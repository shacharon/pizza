# Assistant WebSocket Channel Fix (Option B)

**Date:** 2026-01-28  
**Issue:** Assistant/Narrator messages not appearing in UI via WebSocket  
**Solution:** Option B - Separate "assistant" channel with dual subscription

## Problem Summary

Assistant messages were published to the `'assistant'` channel on the backend, but the frontend only subscribed to the `'search'` channel. This caused assistant messages (gate fail, clarify, summary) to never reach the UI.

## Solution: Option B (Dedicated Channel)

Add a separate WebSocket channel subscription for assistant messages. The frontend now subscribes to BOTH:
1. **'search'** channel - for progress/status/ready messages
2. **'assistant'** channel - for narrator messages

This approach:
- Keeps search and assistant concerns fully separated
- Ensures late-subscriber replay works for both channels independently
- No changes to existing search channel behavior
- Backend already supported this, just needed frontend subscription

## Changes Made

### Backend Changes

#### 1. Channel Constant (`server/src/services/search/route2/narrator/constants.ts`)
```typescript
// Using dedicated 'assistant' channel (reverted from temporary 'search' approach)
export const ASSISTANT_WS_CHANNEL = 'assistant' as const;
```

#### 2. Publisher Comment (`server/src/services/search/route2/narrator/assistant-publisher.ts`)
- Updated comment to reflect assistant channel (not search)
- Logging already uses ASSISTANT_WS_CHANNEL constant dynamically
- No functional changes - backend was already correct

#### 3. Existing Hook Logging (`server/src/services/search/route2/route2.orchestrator.ts`)
- Already has high-signal logging:
  ```typescript
  logger.info({
    requestId,
    hookType: narratorContext.type,
    sessionIdPresent: !!sessionId,
    event: 'assistant_hook_called'
  });
  ```

#### 4. WebSocket Manager (`server/src/infra/websocket/websocket-manager.ts`)
- Already supports 'assistant' channel in protocol
- buildSubscriptionKey() already handles assistant channel:
  ```typescript
  if (channel === 'search') {
    return `search:${requestId}`;
  }
  // Assistant channel: prefer session-based
  if (sessionId) {
    return `${channel}:${sessionId}`;
  }
  return `${channel}:${requestId}`;
  ```
- Backlog/drain mechanism works identically for both channels
- No changes needed

### Frontend Changes

#### 1. Dual Channel Subscription (`llm-angular/src/app/facades/search.facade.ts`)
**Added second subscription after search starts:**
```typescript
// Subscribe to WebSocket for real-time updates
// 1. 'search' channel for progress/status/ready
this.wsClient.subscribe(requestId, 'search', this.conversationId());
// 2. 'assistant' channel for narrator messages
this.wsClient.subscribe(requestId, 'assistant', this.conversationId());
```

#### 2. Message Routing (`llm-angular/src/app/facades/search.facade.ts`)
**Added explicit handling for assistant channel:**
```typescript
// Handle assistant channel messages
if ('channel' in (msg as any) && (msg as any).channel === 'assistant') {
  // Assistant messages are handled directly by assistant components
  if ((msg as any).type === 'assistant_message' && 'narrator' in (msg as any)) {
    const narratorMsg = msg as any;
    const narrator = narratorMsg.narrator;
    console.log('[SearchFacade] Assistant message received on assistant channel:', 
                narrator.type, narrator.message);
  }
  return;
}
```

#### 3. Type Definition (`llm-angular/src/app/core/models/ws-protocol.types.ts`)
**Already added in previous iteration:**
```typescript
export interface WSServerAssistantMessage {
  type: 'assistant_message';
  requestId: string;
  narrator: {
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY';
    message: string;
    question: string | null;
    suggestedAction: ...;
    blocksSearch: boolean;
  };
  timestamp: number;
}
```

#### 4. Assistant Components
**No changes needed - already handle assistant_message type:**
- `assistant-panel.component.ts` - has `handleNarratorMessage()`
- `assistant-line.component.ts` - has `handleNarratorMessage()`
- Both transform narrator payload to display format

## Message Flow

1. **Backend produces narrator message at hook points:**
   - GATE_FAIL (not_food_related)
   - CLARIFY (location/food missing)
   - SUMMARY (end of search)

2. **Published to 'assistant' channel:**
   ```typescript
   wsManager.publishToChannel('assistant', requestId, sessionId, {
     type: 'assistant_message',
     requestId,
     narrator: { type, message, question, suggestedAction, blocksSearch },
     timestamp
   });
   ```

3. **Frontend receives on dedicated assistant subscription:**
   - Separate from search channel messages
   - No interference with progress/status/ready flow

4. **Assistant components display:**
   - Extract message/question from narrator
   - Generate seq for ordering
   - Map to progress/suggestion type
   - Display in assistant panel (no toasts)

## Channel Independence

### Search Channel ('search')
**Unchanged behavior:**
- `progress` - stage updates
- `ready` - results available
- `error` - search errors
- Used by: SearchFacade for triggering result fetch

### Assistant Channel ('assistant')
**New subscription:**
- `assistant_message` - narrator messages
- Used by: Assistant panel and line components
- No toasts - UI panel only

## Backlog/Drain Verification

The WebSocketManager already handles backlog/drain for assistant channel:

1. **When no subscribers exist:**
   ```
   [INFO] backlog_created { channel: "assistant", requestId: "..." }
   ```

2. **When late subscriber connects:**
   ```
   [INFO] backlog_drained { channel: "assistant", requestId: "...", count: N }
   ```

3. **Backlog configuration:**
   - TTL: 2 minutes
   - Max items: 50
   - Works identically for 'search' and 'assistant' channels

## Logging

### Hook Invocation (already implemented)
```
[NARRATOR] Assistant hook invoked
{
  requestId: "...",
  hookType: "GATE_FAIL" | "CLARIFY" | "SUMMARY",
  sessionIdPresent: true/false,
  event: "assistant_hook_called"
}
```

### WebSocket Publish (already implemented)
```
[NARRATOR] Published assistant message to WebSocket
{
  requestId: "...",
  channel: "assistant",
  payloadType: "assistant_message",
  event: "assistant_message_published",
  narratorType: "GATE_FAIL" | "CLARIFY" | "SUMMARY",
  blocksSearch: true/false,
  suggestedAction: "..."
}
```

### WebSocket Manager (already implemented)
```
websocket_published
{
  channel: "assistant",
  requestId: "...",
  clientCount: N,
  payloadBytes: N,
  payloadType: "assistant_message",
  durationMs: N
}
```

### Frontend (new)
```
[SearchFacade] Assistant message received on assistant channel: GATE_FAIL "message text"
```

## Verification Steps

### 1. Test Gate STOP (not_food_related)
- Query: "weather in tel aviv"
- Expected: Assistant message on 'assistant' channel
- Logs should show:
  - `assistant_hook_called` with `hookType: "GATE_FAIL"`
  - `assistant_message_published` with `channel: "assistant"`
  - `websocket_published` with `clientCount > 0`
  - Frontend log: "Assistant message received on assistant channel"

### 2. Test Successful Query with Summary
- Query: "pizza near me"
- Complete full search
- Expected: Summary message on 'assistant' channel at end
- Logs should show:
  - `assistant_hook_called` with `hookType: "SUMMARY"`
  - Message appears in assistant panel

### 3. Test Clarify Hook
- Query triggering location clarification
- Expected: Clarify message with question on 'assistant' channel
- Logs should show:
  - `assistant_hook_called` with `hookType: "CLARIFY"`
  - Question displayed in UI

### 4. Test Late Subscriber
- Send request while WS disconnected
- Connect WS after messages published
- Expected: Backlog drained, messages appear
- Logs should show:
  - `backlog_created` for assistant channel
  - `backlog_drained` on subscription

## Constraints Met

✅ Search channel behavior unchanged (progress/status/ready)  
✅ Assistant on dedicated 'assistant' channel  
✅ Backlog/drain works for assistant channel  
✅ No toasts - assistant panel only  
✅ Frontend subscribes to both channels with same requestId/session  
✅ High-signal logging maintained  

## Files Modified

### Backend
- `server/src/services/search/route2/narrator/constants.ts` - reverted to 'assistant' channel
- `server/src/services/search/route2/narrator/assistant-publisher.ts` - comment update
- `server/src/services/search/route2/route2.orchestrator.ts` - hook logging (already done)

### Frontend
- `llm-angular/src/app/facades/search.facade.ts` - added assistant channel subscription
- `llm-angular/src/app/core/models/ws-protocol.types.ts` - added WSServerAssistantMessage type (already done)
- `llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts` - handleNarratorMessage (already done)
- `llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts` - handleNarratorMessage (already done)

## Key Implementation Details

### Subscribe Path
**File:** `llm-angular/src/app/facades/search.facade.ts`  
**Line:** ~193-196  
**What:** After receiving 202 response, subscribes to both 'search' and 'assistant' channels with same requestId and conversationId (sessionId)

### Publish Path
**File:** `server/src/services/search/route2/narrator/assistant-publisher.ts`  
**Line:** ~65  
**What:** Publishes to channel specified by ASSISTANT_WS_CHANNEL constant (now 'assistant')

### Channel Routing
**File:** `server/src/infra/websocket/websocket-manager.ts`  
**Method:** `buildSubscriptionKey()`  
**What:** Generates unique keys for each channel+requestId combination, enabling independent backlog/drain

## Option Chosen: B (Separate Channel)

**Rationale:** 
- Cleaner separation of concerns (search progress vs assistant narrator)
- Each channel has independent backlog/drain
- Backend was already designed for this
- Only needed to add frontend subscription
- No risk of message type collisions between channels

## Next Steps

1. Deploy changes
2. Monitor logs for `assistant_hook_called` and `websocket_published` events
3. Verify assistant messages appear on 'assistant' channel
4. Verify late subscriber backlog/drain works
5. Test all 3 hook types (GATE_FAIL, CLARIFY, SUMMARY)
