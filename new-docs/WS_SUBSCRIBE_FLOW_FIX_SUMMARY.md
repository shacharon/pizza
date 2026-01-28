# WebSocket Subscribe Flow End-to-End Fix

## Problem

**Evidence from logs:**
```
Line 30: HTTP response at 20:14:59.411
Line 31: Invalid subscribe at 20:14:59.429 (hasRequestId=false)
```

The WebSocket subscribe was being sent **without requestId**, causing validation to fail. The timing shows subscribe was sent after HTTP response, but the `requestId` field was missing from the message.

## Root Causes

1. **Server**: HTTP response didn't include `requestId` field
2. **Client**: Subscribe call didn't pass `sessionId` parameter
3. **Server**: No structured error response when subscribe validation failed

## Solution Overview

### 1. Server: Added `requestId` to HTTP Response

**File:** `server/src/services/search/types/search-response.dto.ts`

Added `requestId` as the first field in `SearchResponse`:

```typescript
export interface SearchResponse {
  // Request ID (for WebSocket subscription)
  requestId: string;
  
  // Session
  sessionId: string;
  // ... rest of fields
}
```

**Files:** `server/src/services/search/route2/route2.orchestrator.ts`

Added `requestId` to all response returns (3 locations):
- Main successful response (line ~187)
- Early STOP response (line ~63)
- Early ASK_CLARIFY response (line ~107)

```typescript
const response: SearchResponse = {
  requestId,  // ← ADDED
  sessionId: request.sessionId || 'route2-session',
  // ... rest of response
};
```

### 2. Server: Structured Error Response for Invalid Subscribe

**File:** `server/src/infra/websocket/websocket-manager.ts`

When subscribe validation fails due to missing `requestId`, server now sends:

```json
{
  "v": 1,
  "type": "publish",
  "channel": "system",
  "payload": {
    "code": "MISSING_REQUEST_ID",
    "message": "Subscribe requires requestId. Send subscribe after /search returns requestId."
  }
}
```

**Implementation:**
- Added `sendValidationError()` method
- Enhanced validation logging with `reasonCode`
- Socket stays open (does NOT close)

**Log output:**
```json
{
  "clientId": "ws-...",
  "messageType": "subscribe",
  "hasChannel": true,
  "hasRequestId": false,
  "reasonCode": "MISSING_REQUEST_ID"
}
```

### 3. Client: Pass sessionId on Subscribe

**File:** `llm-angular/src/app/facades/search.facade.ts`

**Before:**
```typescript
this.wsClient.subscribe(response.requestId);
```

**After:**
```typescript
const sessionId = response.sessionId || this.conversationId();
this.wsClient.subscribe(response.requestId, 'search', sessionId);
```

### 4. Client: Add requestId to Domain Type

**File:** `llm-angular/src/app/domain/types/search.types.ts`

```typescript
export interface SearchResponse {
  requestId: string;  // ← ADDED
  sessionId: string;
  // ... rest of fields
}
```

## Files Changed

### Server (3 files)
1. ✅ `server/src/services/search/types/search-response.dto.ts` - Added `requestId` field
2. ✅ `server/src/services/search/route2/route2.orchestrator.ts` - Include `requestId` in responses (3 places)
3. ✅ `server/src/infra/websocket/websocket-manager.ts` - Structured error response + validation

### Client (2 files)
1. ✅ `llm-angular/src/app/facades/search.facade.ts` - Pass `sessionId` on subscribe
2. ✅ `llm-angular/src/app/domain/types/search.types.ts` - Add `requestId` field

## Exact HTTP Response Field

**Endpoint:** `POST /api/v1/search?mode=async`

**Response JSON:**
```json
{
  "requestId": "req-1768594494914-vckayfz1c",
  "sessionId": "session-1768594427878-4ngyr3py1",
  "query": { ... },
  "results": [ ... ],
  "chips": [],
  "assist": { ... },
  "meta": { ... }
}
```

**Field:** `response.requestId` (top-level)

## Exact WS Subscribe JSON (After Fix)

**Client sends:**
```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-1768594494914-vckayfz1c",
  "sessionId": "session-1768594427878-4ngyr3py1"
}
```

**Server receives and logs:**
```json
{
  "clientId": "ws-1768594482320-l9vyft",
  "channel": "search",
  "requestId": "req-1768594494914-vckayfz1c",
  "sessionId": "session-1768594427878-4ngyr3py1",
  "status": "completed",
  "msg": "websocket_subscribed"
}
```

**Socket registered under key:**
```
search:session:session-1768594427878-4ngyr3py1
```

## Client Flow (Corrected)

### Step-by-Step Sequence

1. **Connect WebSocket** (no subscribe yet)
   ```typescript
   wsClient.connect(); // Opens connection, no automatic subscribe
   ```

2. **Call HTTP Search API**
   ```typescript
   const response = await http.post('/api/v1/search?mode=async', { query, ... });
   ```

3. **Read requestId from Response**
   ```typescript
   const requestId = response.requestId;  // "req-1768594494914-vckayfz1c"
   const sessionId = response.sessionId;  // "session-1768594427878-4ngyr3py1"
   ```

4. **Subscribe with requestId + sessionId**
   ```typescript
   wsClient.subscribe(requestId, 'search', sessionId);
   ```

### Reconnect Behavior

**File:** `llm-angular/src/app/core/services/ws-client.service.ts` (lines 61-65)

When WebSocket reconnects:
```typescript
if (this.lastRequestId) {
  console.log('[WS] Resubscribing to', this.lastRequestId);
  this.subscribe(this.lastRequestId);  // ← Uses stored requestId
}
```

This is **correct** because:
- `lastRequestId` is stored when first subscribing
- On reconnect, the HTTP response already returned, so requestId exists
- The reconnect automatically resubscribes to the same request

## Legacy Compatibility

Server continues to accept legacy formats and normalizes them:

### Accepted Legacy Formats

1. **payload.requestId**
   ```json
   {"type": "subscribe", "channel": "search", "payload": {"requestId": "req-123"}}
   ```

2. **data.requestId**
   ```json
   {"type": "subscribe", "channel": "search", "data": {"requestId": "req-123"}}
   ```

3. **reqId**
   ```json
   {"type": "subscribe", "channel": "search", "reqId": "req-123"}
   ```

All normalized to: `message.requestId` before validation.

## Logging (Server)

### Valid Subscribe
```json
{
  "level": "info",
  "clientId": "ws-...",
  "channel": "search",
  "requestId": "req-...",
  "sessionId": "session-...",
  "status": "completed",
  "msg": "websocket_subscribed"
}
```

### Invalid Subscribe
```json
{
  "level": "warn",
  "clientId": "ws-...",
  "messageType": "subscribe",
  "hasChannel": true,
  "hasRequestId": false,
  "reasonCode": "MISSING_REQUEST_ID",
  "msg": "Invalid WebSocket message format"
}
```

**Note:** Payload values are NEVER logged, only metadata.

## Verification Steps

1. **Check HTTP Response** includes `requestId`:
   ```
   POST /api/v1/search?mode=async
   → {"requestId": "req-...", ...}
   ```

2. **Check WS Subscribe** includes `requestId`:
   ```json
   {"v":1, "type":"subscribe", "channel":"search", "requestId":"req-...", "sessionId":"session-..."}
   ```

3. **Check Server Log** confirms subscription:
   ```
   websocket_subscribed {channel:"search", requestId:"req-...", sessionId:"session-...", status:"..."}
   ```

4. **Check Socket Registration**:
   - Key: `search:session:session-...`
   - Subscription map contains WebSocket instance

## Constraints Met

✅ Canonical subscribe shape enforced: `{v:1, type, channel, requestId, sessionId}`  
✅ Client waits for HTTP response before subscribing  
✅ Strict validation maintained (requestId required)  
✅ Error response sent to client (not just logged)  
✅ Socket stays open (does NOT close)  
✅ Legacy compatibility maintained (auto-normalization)  
✅ No raw payload values logged  
✅ Metadata-only logging with reason codes

## Testing Recommendations

1. **Test normal flow:**
   - POST /search?mode=async
   - Wait for response with requestId
   - Subscribe with requestId + sessionId
   - Verify subscription succeeds

2. **Test error case:**
   - Connect WebSocket
   - Send subscribe without requestId
   - Verify error message received
   - Verify socket stays open

3. **Test reconnect:**
   - Subscribe successfully
   - Disconnect WebSocket
   - Reconnect
   - Verify auto-resubscribe works

4. **Test legacy formats:**
   - Send subscribe with `payload.requestId`
   - Verify normalization works
   - Verify subscription succeeds
