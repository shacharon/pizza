# Assistant WebSocket Fix - Quick Summary

## What Was Fixed
Assistant/Narrator messages were not appearing in the UI because the frontend only subscribed to the 'search' WebSocket channel, but the backend was publishing to a separate 'assistant' channel.

## Solution (Option B)
Added frontend subscription to the 'assistant' channel alongside the existing 'search' channel subscription.

## Key Changes

### Frontend Subscribe Path
**File:** `llm-angular/src/app/facades/search.facade.ts`  
**Lines:** ~193-196

```typescript
// Subscribe to WebSocket for real-time updates
// 1. 'search' channel for progress/status/ready
this.wsClient.subscribe(requestId, 'search', this.conversationId());
// 2. 'assistant' channel for narrator messages
this.wsClient.subscribe(requestId, 'assistant', this.conversationId());
```

### Backend Publish Path
**File:** `server/src/services/search/route2/narrator/assistant-publisher.ts`  
**Line:** ~65

```typescript
// Publish to assistant channel
wsManager.publishToChannel(ASSISTANT_WS_CHANNEL, requestId, sessionId, payload);
// ASSISTANT_WS_CHANNEL = 'assistant' (defined in constants.ts)
```

### Message Routing
**File:** `llm-angular/src/app/facades/search.facade.ts`  
**Lines:** ~374-383

```typescript
// Handle assistant channel messages
if ('channel' in (msg as any) && (msg as any).channel === 'assistant') {
  // Routed to assistant components
  console.log('[SearchFacade] Assistant message received on assistant channel:', ...);
  return;
}
```

## How It Works

1. **Frontend subscribes to TWO channels** when search starts:
   - `'search'` for progress/status/ready
   - `'assistant'` for narrator messages

2. **Backend publishes assistant messages** to `'assistant'` channel at 3 hook points:
   - GATE_FAIL (not_food_related)
   - CLARIFY (location/food missing)
   - SUMMARY (end of search)

3. **Assistant components receive and display** messages via existing handlers

## Backlog/Drain Support
The WebSocketManager already supports backlog/drain for the 'assistant' channel:
- Late subscribers receive missed messages
- TTL: 2 minutes, Max: 50 items
- Works identically to 'search' channel

## Testing
To verify:
1. Query "weather in tel aviv" → should show GATE_FAIL message in assistant panel
2. Complete successful query → should show SUMMARY message at end
3. Check logs for `assistant_hook_called` and `websocket_published` with `channel: "assistant"`

## Files Modified
- Backend: `server/src/services/search/route2/narrator/constants.ts` (comment update)
- Backend: `server/src/services/search/route2/narrator/assistant-publisher.ts` (comment update)
- Frontend: `llm-angular/src/app/facades/search.facade.ts` (added assistant subscription + routing)

That's it! Simple fix - just needed to subscribe to the assistant channel.
