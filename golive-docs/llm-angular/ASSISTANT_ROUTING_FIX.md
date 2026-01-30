# Assistant UI Routing Fix (חד-חד-ערכית)

**Date**: 2026-01-29  
**Scope**: Angular only (llm-angular)  
**Status**: ✅ Complete

## Problem

The assistant UI had multiple issues:
1. **Duplication**: Multiple WS listeners causing duplicate rendering
2. **Wrong channel types**: SUMMARY/CLARIFY/GATE_FAIL appearing in assistant-line
3. **No deduplication**: Reconnect backlog causing duplicate messages
4. **Poor GATE_FAIL UX**: Results showing when pipeline stops with no results

## Solution

### 1. Canonical Routing Rules (חד-חד-ערכית)

Created `assistant-routing.types.ts` with strict routing map:

**app-assistant-line** (Shows ONLY):
- `PRESENCE` - System presence indicator
- `WS_STATUS` - WebSocket connection status  
- `PROGRESS` - Search progress updates

**app-assistant-summary** (Shows ONLY):
- `SUMMARY` - Assistant summary card
- `CLARIFY` - Clarification request card
- `GATE_FAIL` - Gate failure card

### 2. Single WS Listener

- ✅ Only `SearchAssistantHandler` subscribes to WS messages
- ✅ Removed direct WS subscriptions from `AssistantLineComponent`
- ✅ Components get messages from facade signals only

### 3. Deduplication & Ordering

**Client-side messageId**: `${requestId}:${type}:${seq ?? ts ?? hash(message)}`

**Deduplication**:
- `AssistantDedupService` tracks seen messages per requestId
- Drops duplicates before routing

**Ordering**:
- Line: Keep only latest message
- Card: Keep only latest per type (SUMMARY, CLARIFY, GATE_FAIL)

### 4. Fixed GATE_FAIL UX

- When `GATE_FAIL` + `resultCount=0` → hide results section entirely
- Show only assistant card with failure message
- No confusing "ready/success" visuals

### 5. Instrumentation

**Logging format**:
```typescript
{
  requestId: string,
  type: AssistantMessageType,
  messageId: string,
  dedupDropped: boolean,
  routedTo: 'line' | 'card' | 'dropped',
  timestamp: string
}
```

**Dev Tools** (browser console):
```javascript
// Simulate duplicates
window.assistantDevTools.simulateDuplicates()

// Simulate reconnect backlog
window.assistantDevTools.simulateReconnectBacklog()

// Enable verbose logging
window.assistantDevTools.enableVerboseLogging()
```

## Files Changed

### New Files
- `llm-angular/src/app/facades/assistant-routing.types.ts` - Canonical routing definitions
- `llm-angular/src/app/facades/assistant-dedup.service.ts` - Deduplication service
- `llm-angular/src/app/facades/assistant-dev-tools.ts` - Dev tools for testing

### Modified Files
- `llm-angular/src/app/facades/search-assistant.facade.ts` - Routing & dedup logic
- `llm-angular/src/app/facades/search.facade.ts` - Expose routed channels
- `llm-angular/src/app/features/unified-search/components/assistant-line/` - Remove WS subscription
- `llm-angular/src/app/features/unified-search/components/assistant-summary/` - Use card messages
- `llm-angular/src/app/features/unified-search/search-page/` - GATE_FAIL UX fix

## Acceptance Criteria

✅ **For query "what the wather is ?" (GATE2 STOP)**:
- Only one GATE_FAIL card visible
- Zero assistant-line entries besides WS status/presence
- Results section hidden (resultCount=0)

✅ **No SUMMARY/CLARIFY/GATE_FAIL ever appear in assistant-line**

✅ **Reconnect/backlog cannot produce duplicates**

## Testing

1. **Test GATE_FAIL**:
   ```
   Query: "what the wather is ?"
   Expected: One GATE_FAIL card, no results
   ```

2. **Test deduplication**:
   ```javascript
   window.assistantDevTools.simulateDuplicates()
   // Check console: 1 rendered, 2 dropped
   ```

3. **Test reconnect backlog**:
   ```javascript
   window.assistantDevTools.simulateReconnectBacklog()
   // Check console: All messages deduplicated
   ```

4. **Verify routing**:
   - PROGRESS messages → assistant-line only
   - SUMMARY messages → assistant-summary only
   - No message appears in both places

## Architecture

```
┌─────────────────────────────────────────┐
│         SearchFacade (Orchestrator)     │
└─────────────────┬───────────────────────┘
                  │
                  ├── WS Messages (single subscription)
                  │
        ┌─────────▼─────────────────────┐
        │  SearchAssistantHandler       │
        │  (Routing + Deduplication)    │
        └───────────┬───────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
   ┌────▼────┐            ┌─────▼─────┐
   │  LINE   │            │   CARD    │
   │ Channel │            │  Channel  │
   └────┬────┘            └─────┬─────┘
        │                       │
        │                       │
   ┌────▼──────────┐   ┌────────▼──────────┐
   │ assistant-    │   │ assistant-        │
   │ line          │   │ summary           │
   │ (PRESENCE,    │   │ (SUMMARY,         │
   │  WS_STATUS,   │   │  CLARIFY,         │
   │  PROGRESS)    │   │  GATE_FAIL)       │
   └───────────────┘   └───────────────────┘
```

## Backward Compatibility

- Legacy `messages` signal still works (deprecated)
- New `lineMessages` and `cardMessages` are preferred
- Both rendering paths coexist during transition

## Notes

- All logging uses `[AssistantHandler][ROUTING]` prefix for easy filtering
- MessageId is stable across reconnects (uses seq/ts/hash)
- Dedup service automatically clears old requestIds
- Dev tools available globally in development builds
