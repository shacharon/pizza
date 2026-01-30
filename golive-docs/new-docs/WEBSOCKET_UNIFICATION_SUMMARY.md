# WebSocket Protocol Unification - Implementation Summary

## ✅ Completed

Unified WebSocket protocol for both SEARCH async and ASSISTANT streaming with full backward compatibility.

## Canonical Message Envelope

```typescript
{
  "type": "subscribe" | "unsubscribe" | "event",
  "channel": "search" | "assistant",
  "requestId": "<req-...>",
  "sessionId": "<session-...>",  // optional
  "payload": {}                   // optional, NOT logged
}
```

## Exact Accepted Message Shapes

### 1. Canonical Subscribe (Search)
```json
{
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-1737055535495-l0a654u1s",
  "payload": {}
}
```

### 2. Canonical Subscribe (Assistant)
```json
{
  "type": "subscribe",
  "channel": "assistant",
  "requestId": "req-1737055600000-xyz456",
  "sessionId": "session-user123-20260116",
  "payload": {}
}
```

### 3. Canonical Unsubscribe
```json
{
  "type": "unsubscribe",
  "channel": "search",
  "requestId": "req-1737055535495-l0a654u1s",
  "payload": {}
}
```

### 4. Canonical Event
```json
{
  "type": "event",
  "channel": "assistant",
  "requestId": "req-1737055600000-xyz456",
  "payload": {
    "eventType": "custom_event",
    "data": {}
  }
}
```

### 5. Legacy Subscribe (Backward Compatible)
```json
{
  "type": "subscribe",
  "requestId": "req-1737055535495-l0a654u1s"
}
```
_Automatically normalized to canonical format with `channel: "search"`_

## Files Changed

### Server
1. **`server/src/infra/websocket/websocket-protocol.ts`**
   - Added `WSChannel` type (`'search' | 'assistant'`)
   - Added `WSClientEnvelope` interface (canonical)
   - Added `WSClientSubscribeLegacy` interface
   - Updated `WSClientMessage` union type
   - Enhanced `isWSClientMessage()` validation
   - Added `normalizeToCanonical()` function

2. **`server/src/infra/websocket/websocket-manager.ts`**
   - Changed subscription map key from `requestId` to `channel:request:requestId` or `channel:session:sessionId`
   - Renamed `socketToRequests` to `socketToSubscriptions`
   - Added proper JSON parsing with try/catch
   - Added metadata-only logging (payload NOT logged)
   - Added `subscribeToChannel()` private method
   - Added `unsubscribeFromChannel()` private method
   - Added `publishToChannel()` method
   - Added `buildSubscriptionKey()` helper
   - Updated `handleMessage()` with enhanced error handling
   - Updated `handleClientMessage()` to support canonical envelope
   - Updated `cleanup()` to use new subscription map
   - Kept legacy `subscribe()` and `publish()` for backward compatibility

### Client
1. **`llm-angular/src/app/core/models/ws-protocol.types.ts`**
   - Added `WSChannel` type
   - Added `WSClientEnvelope` interface
   - Added `WSClientSubscribeLegacy` interface
   - Updated `WSClientMessage` union type

2. **`llm-angular/src/app/core/services/ws-client.service.ts`**
   - Updated `subscribe()` to use canonical envelope with channel parameter
   - Added `unsubscribe()` method
   - Added `WSChannel` import
   - Default channel is `'search'` for backward compatibility

### Documentation
1. **`server/docs/websocket-protocol-unified.md`**
   - Complete protocol specification
   - All accepted message shapes
   - Migration guide
   - Examples

### Examples
1. **`server/examples/websocket-assistant-subscribe.json`**
   - Example assistant channel subscription
2. **`server/examples/websocket-search-subscribe.json`**
   - Example search channel subscription

## Server Behavior

### Subscription Keys
- **Request-based:** `channel:request:<requestId>`
- **Session-based:** `channel:session:<sessionId>`

### Logging Format
```typescript
{
  clientId: "ws-...",
  type: "subscribe",
  channel: "search",
  hasRequestId: true,
  hasSessionId: false
}
```
**Note:** Payload is NEVER logged.

### Error Handling
- JSON parse errors: Caught and logged with error type
- Invalid messages: Logged with metadata about what's missing
- All errors return WebSocket error message to client

## Backward Compatibility

✅ **Fully Maintained**
- Legacy subscribe messages without `channel` field are automatically normalized to `channel: "search"`
- Existing code using `wsManager.subscribe(requestId, socket)` continues to work
- Existing code using `wsManager.publish(requestId, message)` continues to work
- No breaking changes to existing search pipeline

## Migration Path

### Client Code
**Before:**
```typescript
wsClient.subscribe('req-123');
```

**After (Recommended):**
```typescript
wsClient.subscribe('req-123', 'search');  // explicit channel
wsClient.subscribe('req-456', 'assistant', 'session-789');  // with session
```

**Note:** Old code still works (defaults to 'search' channel).

## Non-Goals (Not Implemented)

- ❌ Assistant event implementation (structure ready, handler TODO)
- ❌ New authentication logic (kept existing)
- ❌ Search pipeline changes (untouched)

## Testing

To test the implementation:

1. **Search Channel (Legacy Compatible):**
   ```json
   {"type": "subscribe", "requestId": "req-123"}
   ```

2. **Search Channel (Canonical):**
   ```json
   {"type": "subscribe", "channel": "search", "requestId": "req-123", "payload": {}}
   ```

3. **Assistant Channel:**
   ```json
   {"type": "subscribe", "channel": "assistant", "requestId": "req-456", "sessionId": "session-789", "payload": {}}
   ```

Check server logs for:
```
[INFO] websocket_subscribed { clientId: "ws-...", channel: "assistant", requestId: "req-456", sessionId: "session-789", status: "..." }
```

## Example: Assistant Channel Subscription

```json
{
  "type": "subscribe",
  "channel": "assistant",
  "requestId": "req-1737055600000-xyz456",
  "sessionId": "session-user123-20260116",
  "payload": {}
}
```

This message will:
1. Subscribe the WebSocket to `assistant:session:session-user123-20260116`
2. Log metadata (not payload)
3. Enable future assistant streaming events

## Status

✅ **COMPLETE** - All deliverables met:
- ✅ Canonical envelope defined
- ✅ Backward compatibility maintained
- ✅ Server parsing/validation fixed with try/catch
- ✅ Subscription map supports (channel, requestId, sessionId)
- ✅ Logging sanitized (no payload logging)
- ✅ Client updated to use canonical envelope
- ✅ Documentation complete
- ✅ Examples provided
- ✅ All files changed listed
- ✅ No linter errors
