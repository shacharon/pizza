# CTO-Grade WebSocket Fix - Quick Summary

**Protocol:** sub_ack/sub_nack + pending subscriptions  
**Date:** 2026-01-28

## What Was Fixed

1. **No Socket Kill** - Subscribe errors send `sub_nack` instead of closing connection
2. **Server-Trust Auth** - sessionId from ticket/JWT only, never from client messages
3. **Pending Subscriptions** - Pre-subscribe before job creation with automatic activation
4. **Comprehensive Logging** - Connection context, subscribe attempts, ack/nack events

## New Protocol Messages

### sub_ack (Server → Client)
```json
{
  "type": "sub_ack",
  "channel": "assistant",
  "requestId": "req_123",
  "pending": false
}
```
- `pending: true` = awaiting job creation
- `pending: false` = subscription active

### sub_nack (Server → Client)
```json
{
  "type": "sub_nack",
  "channel": "assistant",
  "requestId": "req_123",
  "reason": "session_mismatch"
}
```
- Reasons: `session_mismatch`, `invalid_request`, `unauthorized`
- **No socket close** - connection stays alive

## Key Changes

### Backend Subscribe Flow
**File:** `server/src/infra/websocket/websocket-manager.ts`

**Old:** Close socket on mismatch
```typescript
if (owner.sessionId !== wsSessionId) {
  ws.close(1008, 'NOT_AUTHORIZED');  // ❌
}
```

**New:** Send sub_nack, keep socket alive
```typescript
if (ownerSessionId !== connSessionId) {
  this.sendSubNack(ws, channel, requestId, 'session_mismatch');  // ✅
  return;
}
```

### Connection Context (Server-Trust-Only)
**File:** `server/src/infra/websocket/websocket-manager.ts` (line ~338)

```typescript
const ctx: WebSocketContext = {
  sessionId: req.sessionId,  // From ticket/JWT
  userId: req.userId,        // From ticket/JWT
  clientId,
  connectedAt: Date.now()
};
(ws as any).ctx = ctx;
```

### Pending Subscriptions
**File:** `server/src/infra/websocket/websocket-manager.ts` (line ~783)

```typescript
// If owner is null (job not created yet)
const pendingSub: PendingSubscription = {
  ws, channel, requestId, sessionId,
  expiresAt: Date.now() + 90000  // 90s TTL
};
this.pendingSubscriptions.set(key, pendingSub);
this.sendSubAck(ws, channel, requestId, true);  // pending: true
```

### Activation on Job Creation
**File:** `server/src/controllers/search/search.controller.ts` (line ~290)

```typescript
await searchJobStore.createJob(requestId, {...});

// Activate pending subscriptions
wsManager.activatePendingSubscriptions(requestId, ownerSessionId);
```

### Frontend Graceful Handling
**File:** `llm-angular/src/app/facades/search.facade.ts` (line ~374)

```typescript
if ((msg as any).type === 'sub_nack') {
  console.warn('Subscription rejected', nack);
  
  // For assistant channel, show inline message (no toast)
  if (nack.channel === 'assistant') {
    console.log('Assistant rejected - continuing with search only');
  }
  
  // Do NOT treat as hard failure
  return;
}
```

## Logging Events

### 1. Connection Context Set
```
[INFO] ws_conn_ctx_set { clientId, sessionHash, hasUserId }
```

### 2. Subscribe Attempt
```
[INFO] ws_subscribe_attempt { clientId, channel, requestIdHash, sessionHash }
```

### 3. Subscribe Acknowledged
```
[INFO] ws_subscribe_ack { clientId, channel, requestIdHash, pending: true/false }
```

### 4. Subscribe Rejected (No Socket Kill)
```
[WARN] ws_subscribe_nack { clientId, channel, requestIdHash, reason }
```

### 5. Pending Activated
```
[INFO] pending_subscription_activated { clientId, channel, requestIdHash }
```

## Testing

### Test 1: Gate STOP
```bash
Query: "weather in tel aviv"
Expected:
  - sub_ack received
  - Assistant message on 'assistant' channel
  - No socket close
```

### Test 2: Successful Search
```bash
Query: "pizza near me"
Expected:
  - SUMMARY message at end
  - websocket_published (channel: assistant)
```

### Test 3: Wrong RequestId
```bash
Subscribe with requestId from different session
Expected:
  - sub_nack (reason: session_mismatch)
  - Socket stays alive
  - Search channel still works
```

### Test 4: Pre-Subscribe
```bash
1. Connect WS
2. Subscribe to assistant (before /search POST)
3. POST /search (creates job)
Expected:
  - sub_ack (pending: true)
  - Job created
  - sub_ack (pending: false)
  - Backlog drained
```

## Files Modified

### Backend (3 files)
- `server/src/infra/websocket/websocket-protocol.ts` - Types
- `server/src/infra/websocket/websocket-manager.ts` - Core logic (500+ lines)
- `server/src/controllers/search/search.controller.ts` - Activation call

### Frontend (3 files)
- `llm-angular/src/app/core/models/ws-protocol.types.ts` - Types
- `llm-angular/src/app/core/services/ws-client.service.ts` - Logging
- `llm-angular/src/app/facades/search.facade.ts` - Graceful handling

## Quick Deployment

1. **Deploy backend first** (protocol is additive, backward compatible)
2. **Monitor logs** for `ws_subscribe_ack/nack` events
3. **Deploy frontend** to handle sub_ack/sub_nack
4. **Verify** no socket kills on mismatch

## Security Summary

✅ **Server-trust-only** - sessionId from ticket/JWT, not client  
✅ **Graceful degradation** - sub_nack instead of socket kill  
✅ **Pending expiration** - 90s TTL prevents memory leaks  
✅ **Audit logging** - All subscribe events logged  
✅ **Zero trust** - Client cannot spoof identity for authorization  

---

For full details, see `CTO_GRADE_WEBSOCKET_FIX.md`
