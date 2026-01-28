# Assistant WebSocket GATE_FAIL Implementation Summary

## Status: ✅ COMPLETE

Implementation of minimal end-to-end WS assistant message for GATE_FAIL.

## Changes Made

### 1. Backend Protocol Types (`server/src/infra/websocket/websocket-protocol.ts`)
- Added `WSServerAssistant` interface with type `'assistant'`
- Payload structure:
  ```typescript
  {
    type: 'assistant',
    requestId: string,
    payload: {
      type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY',
      message: string,
      question: string | null,
      blocksSearch: boolean
    }
  }
  ```

### 2. Assistant Publisher (`server/src/services/search/route2/narrator/assistant-publisher.ts`)
- Added crypto import for sessionId hashing
- Added structured log **before** publish:
  - `event: "assistant_ws_publish_attempt"`
  - Fields: `channel`, `requestId`, `sessionHash`, `payloadType`
- Changed message structure from `type: 'assistant_message'` to `type: 'assistant'`
- Changed payload structure to have nested `payload` field with narrator output
- Updated all logging to use `payloadType: 'assistant'`

### 3. WebSocket Manager
- **No changes needed** - already supports 'assistant' channel
- Channel routing:
  - `search` channel: keyed by `requestId`
  - `assistant` channel: keyed by `sessionId` (or `requestId` if no sessionId)
- Backlog behavior: same as search channel

## Test Results

Test query: `"what is the weather"` (non-food, triggers GATE_FAIL)

### Logs Observed

1. ✅ `assistant_hook_called` logged with `hookType: "GATE_FAIL"`
2. ✅ `assistant_ws_publish_attempt` logged before publish with all required fields
3. ✅ `assistant_message_published` logged after publish
4. ✅ WebSocket backlog created (no active subscribers in test)
5. ✅ Message structure: `type: 'assistant'`, `payloadType: 'assistant'`
6. ✅ WS connection stays alive

### Sample Log Output
```
[15:43:09] [INFO]: [NARRATOR] Assistant hook invoked
    requestId: "req-1769607788037-ln5r2yk3n"
    hookType: "GATE_FAIL"
    sessionIdPresent: true
    event: "assistant_hook_called"

[15:43:11] [INFO]: [NARRATOR] Publishing assistant message to WebSocket
    channel: "assistant"
    requestId: "req-1769607788037-ln5r2yk3n"
    sessionHash: "bd7065173b6b"
    payloadType: "assistant"
    event: "assistant_ws_publish_attempt"

[15:43:11] [INFO]: WebSocket backlog created for late subscribers
    channel: "assistant"
    requestId: "req-1769607788037-ln5r2yk3n"
    event: "backlog_created"

[15:43:11] [INFO]: [NARRATOR] Published assistant message to WebSocket
    requestId: "req-1769607788037-ln5r2yk3n"
    channel: "assistant"
    payloadType: "assistant"
    event: "assistant_message_published"
    narratorType: "GATE_FAIL"
    blocksSearch: true
    suggestedAction: "NONE"
```

## Implementation Details

### Message Flow
1. Gate2 returns `STOP` (foodSignal: NO)
2. `maybeNarrateAndPublish` called with `NarratorGateContext` (type: GATE_FAIL)
3. Logs: `assistant_hook_called`
4. Generates narrator message via LLM
5. Calls `publishAssistantMessage(wsManager, requestId, sessionId, narrator)`
6. Logs: `assistant_ws_publish_attempt` (with sessionHash)
7. Calls `wsManager.publishToChannel('assistant', requestId, sessionId, message)`
8. WebSocketManager routes to channel key: `assistant:${sessionId}` (or `assistant:${requestId}`)
9. If subscribers exist: publishes directly
10. If no subscribers: enqueues to backlog (TTL: 2 minutes)
11. Logs: `assistant_message_published`

### Subscription Behavior
- Frontend subscribes to assistant channel: `{ type: 'subscribe', channel: 'assistant', requestId }`
- WebSocketManager:
  - Validates ownership via jobStore
  - Subscribes with key: `assistant:${sessionId}`
  - Drains backlog if messages were published before subscription
  - Late-subscriber replay: up to 50 messages, 2-minute TTL

## Files Modified
1. `server/src/infra/websocket/websocket-protocol.ts` - Added WSServerAssistant type
2. `server/src/services/search/route2/narrator/assistant-publisher.ts` - Updated publisher

## Files NOT Modified
- `server/src/infra/websocket/websocket-manager.ts` - Already supports assistant channel
- UI files - As requested, no UI changes

## Build Status
✅ TypeScript compilation successful
✅ Server starts without errors
✅ Test query executes successfully

## Next Steps (If Needed)
1. Frontend: Subscribe to 'assistant' channel and handle `type: 'assistant'` messages
2. Frontend: Display narrator messages in UI
3. Test with WebSocket client to verify message delivery
4. Add unit tests for assistant-publisher

## Verification Command
To test GATE_FAIL:
```bash
# Generate JWT token
node -e "const jwt = require('jsonwebtoken'); console.log(jwt.sign({ sessionId: 'test-session', userId: 'test-user' }, 'dev_local_super_secret_change_me_32_chars_min!!', { expiresIn: '1d' }));"

# Send non-food query
curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"what is the weather"}'
```

Check logs for:
- `assistant_hook_called`
- `assistant_ws_publish_attempt`
- `assistant_message_published` with `payloadType: "assistant"`
