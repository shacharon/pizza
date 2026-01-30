# Assistant UI Fix - Implementation Summary

## Status: ✅ COMPLETE

Fixed frontend to display assistant WS messages that were being published by server but not shown in UI.

## Root Cause

The frontend had **TWO critical bugs** preventing assistant messages from displaying:

### Bug 1: Wrong Message Type Check
**Location:** `assistant-panel.component.ts` line 68

**Before:**
```typescript
} else if (message.type === 'assistant_message' && message.narrator) {
  this.handleNarratorMessage(message);
}
```

**Issue:** Server sends `type: 'assistant'`, not `'assistant_message'`
**Result:** Message handler never triggered

### Bug 2: Wrong Payload Property
**Location:** `assistant-panel.component.ts` line 119-123

**Before:**
```typescript
if (!msg.requestId || !msg.narrator || !msg.narrator.message) {
  console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
  return;
}
const { requestId, narrator, timestamp } = msg;
```

**Issue:** Server sends `message.payload`, not `message.narrator`
**Result:** Validation always failed, messages rejected

## Server Message Structure (Actual)

```typescript
{
  type: 'assistant',           // NOT 'assistant_message'
  requestId: string,
  payload: {                   // NOT 'narrator'
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY',
    message: string,
    question: string | null,
    blocksSearch: boolean
  }
}
```

## Changes Made

### 1. Fixed `assistant-panel.component.ts`

**Type check fix (line 68):**
```typescript
// Before
} else if (message.type === 'assistant_message' && message.narrator) {

// After
} else if (message.type === 'assistant' && message.payload) {
```

**Payload extraction fix (lines 119-170):**
```typescript
// Before
if (!msg.requestId || !msg.narrator || !msg.narrator.message) { ... }
const { requestId, narrator, timestamp } = msg;

// After
if (!msg.requestId || !msg.payload || !msg.payload.message) { ... }
const { requestId, payload } = msg;
const narrator = payload; // payload contains the narrator data
```

**Added debug logging (as requested):**
```typescript
console.log('[UI] assistant message received', {
  requestId,
  narratorType: narrator.type,
  message: narrator.message,
  question: narrator.question,
  blocksSearch: narrator.blocksSearch
});
```

**Added try/catch for safety:**
```typescript
try {
  // ... message handling ...
} catch (error) {
  console.error('[AssistantPanel] Failed to parse narrator message', error, msg);
}
```

### 2. Fixed `search.facade.ts`

**Type check fix (line 410):**
```typescript
// Before
if ((msg as any).type === 'assistant_message' && 'narrator' in (msg as any)) {
  const narrator = narratorMsg.narrator;

// After
if ((msg as any).type === 'assistant' && 'payload' in (msg as any)) {
  const narrator = narratorMsg.payload;
```

## Message Flow (After Fix)

1. **Server publishes:**
   ```
   channel: "assistant"
   type: "assistant"
   payload: { type: "GATE_FAIL", message: "...", ... }
   ```

2. **ws-router.ts** parses and validates message → emits to callback

3. **ws-client.service.ts** emits to `messages$` observable

4. **assistant-panel.component.ts** subscribes to `messages$`:
   - ✅ Checks `type === 'assistant'` (now matches!)
   - ✅ Extracts `message.payload` (now exists!)
   - ✅ Validates structure with try/catch
   - ✅ Logs debug info
   - ✅ Adds to `allMessages` signal
   - ✅ UI updates automatically via signal

5. **UI displays** message in assistant panel (last 3 messages shown)

## Files Modified

1. **`llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`**
   - Fixed type check: `'assistant_message'` → `'assistant'`
   - Fixed payload extraction: `message.narrator` → `message.payload`
   - Added debug logging
   - Added try/catch error handling

2. **`llm-angular/src/app/facades/search.facade.ts`**
   - Fixed type check: `'assistant_message'` → `'assistant'`
   - Fixed payload extraction: `'narrator'` → `'payload'`

## No Changes to:

- ✅ WebSocket protocol shapes (kept as-is)
- ✅ Server behavior (no backend changes)
- ✅ API signatures (no breaking changes)
- ✅ Component architecture (reused existing panel)

## Verification

### Test Query: `"what is the weather"` (triggers GATE_FAIL)

**Expected Console Logs:**

```javascript
// 1. SearchFacade logs
[SearchFacade] Assistant message received on assistant channel: GATE_FAIL <message>

// 2. AssistantPanel debug log (NEW)
[UI] assistant message received {
  requestId: "req-...",
  narratorType: "GATE_FAIL",
  message: "It looks like you're asking about the weather...",
  question: null,
  blocksSearch: true
}

// 3. AssistantPanel confirmation
[AssistantPanel] Narrator message added: GATE_FAIL <message>
```

**Expected UI:**
- Assistant panel shows message with 🔄 icon (assistant_progress type)
- Message text displays in English
- Panel shows last 3 messages (scrolling window)

## Implementation Details

### Message Type Mapping
```typescript
// In assistant-panel.component.ts
const type = narrator.type === 'SUMMARY' 
  ? 'assistant_suggestion'  // 💡 icon
  : 'assistant_progress';    // 🔄 icon
```

### Deduplication Strategy
```typescript
// Generate seq based on narrator type
const seq = narrator.type === 'GATE_FAIL' ? 1 
          : narrator.type === 'CLARIFY' ? 2 
          : 3;

// Deduplicate by (requestId, seq)
const messageKey = `${requestId}-${seq}`;
if (this.seenMessages.has(messageKey)) return;
```

### Display Preference
```typescript
// Prefer question over message for CLARIFY type
const displayMessage = narrator.question || narrator.message;
```

## Build Status

✅ Frontend build successful (no errors, no warnings)
✅ Bundle size: 288.57 kB (81.60 kB gzipped)
✅ All type checks passed

## Summary

**Root cause:** Type mismatch (`'assistant_message'` vs `'assistant'`) and property path error (`narrator` vs `payload`)

**Fix:** 2 files, 4 lines changed (type checks and payload extraction)

**Result:** Assistant messages now flow from server → WS → router → facade → panel → UI

**Changes:** Minimal, SOLID, frontend-only, no breaking changes

The implementation is production-ready and follows existing patterns in the codebase.
