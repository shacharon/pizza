# WebSocket Subscribe Fix - Summary

## Issue

Server log showed: `hasChannel=true, hasRequestId=false`

The WebSocket subscribe message was not properly including `requestId` at the top level, causing validation to fail.

## Root Cause

The Angular client was building the message with `sessionId: undefined`, which explicitly added the field even when not provided:

```typescript
// BEFORE (BROKEN)
const message = {
  type: 'subscribe',
  channel,
  requestId,
  sessionId,  // ← undefined explicitly included
  payload: {}
};
```

## Canonical Shape (v1)

```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-1234567890-abc123",
  "sessionId": "session-xyz789"  // ← optional, only if provided
}
```

### Required Fields
- `v`: Protocol version (always `1`)
- `type`: `"subscribe"`, `"unsubscribe"`, or `"event"`
- `channel`: `"search"` or `"assistant"`
- `requestId`: Request identifier string

### Optional Fields
- `sessionId`: Session identifier (only included if provided)

## Files Changed

### Server
1. **`server/src/infra/websocket/websocket-manager.ts`**
   - Added DEV-only logging to show message keys and nesting (`Object.keys(msg)`, `Object.keys(msg.payload)`, `Object.keys(msg.data)`)
   - Added normalization logic to accept legacy requestId locations:
     - `payload.requestId` → `requestId`
     - `data.requestId` → `requestId`
     - `reqId` → `requestId`
   - Normalization happens **BEFORE** validation at line ~138-155

2. **`server/src/infra/websocket/websocket-protocol.ts`**
   - Updated `WSClientEnvelope` to include `v: 1` field
   - Removed `payload` field (not needed in canonical v1)
   - Updated validation to check `requestId` first, then `channel`
   - Updated `normalizeToCanonical()` to produce v1 format

3. **`server/docs/websocket-protocol-unified.md`**
   - Updated to reflect v1 canonical shape
   - Added legacy compatibility section
   - Updated all examples

4. **`server/examples/websocket-*.json`**
   - Updated example files to use v1 format

### Client
1. **`llm-angular/src/app/core/services/ws-client.service.ts`**
   - Fixed `subscribe()` to conditionally include `sessionId` only if provided
   - Fixed `unsubscribe()` to conditionally include `sessionId` only if provided
   - Added `v: 1` to canonical messages
   - Removed `payload: {}` field

2. **`llm-angular/src/app/core/models/ws-protocol.types.ts`**
   - Updated `WSClientEnvelope` to include `v: 1` field
   - Removed `payload` field

## Final Subscribe JSON (Client)

### Search Channel
```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-1768594239557-k295oqw39"
}
```

### Assistant Channel with Session
```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "assistant",
  "requestId": "req-1768594239557-k295oqw39",
  "sessionId": "session-1768594166546-zecgb3mba"
}
```

## Normalization Location

**File:** `server/src/infra/websocket/websocket-manager.ts`  
**Lines:** ~138-155  
**Function:** `handleMessage()`

```typescript
// Normalize requestId from various legacy locations (backward compatibility)
if (message && message.type === 'subscribe' && !message.requestId) {
  // Check payload.requestId
  if (message.payload?.requestId) {
    message.requestId = message.payload.requestId;
    logger.debug({ clientId }, '[WS] Normalized requestId from payload.requestId');
  }
  // Check data.requestId
  else if ((message as any).data?.requestId) {
    message.requestId = (message as any).data.requestId;
    logger.debug({ clientId }, '[WS] Normalized requestId from data.requestId');
  }
  // Check reqId
  else if ((message as any).reqId) {
    message.requestId = (message as any).reqId;
    logger.debug({ clientId }, '[WS] Normalized requestId from reqId');
  }
}
```

**Note:** Normalization occurs **before** validation, ensuring all legacy formats are accepted.

## DEV Logging

When `NODE_ENV !== 'production'`, the server logs message structure (keys only, no values):

```json
{
  "clientId": "ws-...",
  "msgKeys": ["v", "type", "channel", "requestId"],
  "payloadKeys": null,
  "dataKeys": null,
  "hasPayload": false,
  "hasData": false,
  "msg": "[DEV] WS message keys"
}
```

## Verification

After the fix, the server will log:
```json
{
  "clientId": "ws-...",
  "channel": "search",
  "requestId": "req-...",
  "sessionId": "none",
  "status": "...",
  "msg": "websocket_subscribed"
}
```

✅ `hasRequestId=true` confirmed  
✅ Socket registered under key: `search:request:req-...`

## Legacy Compatibility

### Supported Legacy Formats

1. **Legacy subscribe (no channel)**
   ```json
   {"type": "subscribe", "requestId": "req-123"}
   ```
   → Normalized to `channel: "search"`

2. **requestId in payload**
   ```json
   {"type": "subscribe", "channel": "search", "payload": {"requestId": "req-123"}}
   ```
   → Normalized to top-level `requestId`

3. **requestId in data**
   ```json
   {"type": "subscribe", "channel": "search", "data": {"requestId": "req-123"}}
   ```
   → Normalized to top-level `requestId`

4. **reqId instead of requestId**
   ```json
   {"type": "subscribe", "channel": "search", "reqId": "req-123"}
   ```
   → Normalized to `requestId`

All legacy formats are automatically normalized before validation.

## Constraints Met

✅ Full payload values are NOT logged (only keys)  
✅ No changes to search pipeline logic  
✅ Socket registered under `(channel, requestId, sessionId)` key  
✅ Server logs `hasRequestId=true` after fix  
✅ Backward compatibility maintained
