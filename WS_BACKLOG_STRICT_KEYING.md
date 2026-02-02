# WebSocket Backlog Strict Keying Fix

## Problem
WebSocket backlog/drain could potentially leak old request results into a new search UI if:
1. Backlog was keyed by session instead of `${channel}:${requestId}`
2. Backlog drain happened for the wrong subscriptionKey
3. Server auto-resubscribed to "last request" on reconnect
4. Logging lacked `subscriptionKey`, `drainedRequestId`, `clientId` fields

## Solution

### 1. ✅ Backlog Keyed Strictly by `subscriptionKey = ${channel}:${requestId}`

**Already correct in codebase:**

```typescript
// server/src/infra/websocket/subscription-manager.ts (line 32-35)
buildSubscriptionKey(channel: WSChannel, requestId: string, sessionId?: string): SubscriptionKey {
  // STRICT: Never use sessionId for backlog key
  // This prevents old request results from leaking into new searches
  return `${channel}:${requestId}`;
}
```

**Key Point:** The `sessionId` parameter is **ignored** - backlog is strictly keyed by `channel:requestId`.

### 2. ✅ Backlog Drain Only for Exact subscriptionKey

**Already correct in codebase:**

```typescript
// server/src/infra/websocket/websocket-manager.ts (line 375-380)
const key = this.subscriptionManager.buildSubscriptionKey(
  result.channel!,
  result.requestId!,
  result.sessionId
);
this.backlogManager.drain(key, ws, result.channel!, result.requestId!, this.cleanup.bind(this));
```

**Flow:**
1. Client sends `subscribe` with `requestId="req_B"`
2. Server builds `key = "search:req_B"`
3. Server drains backlog ONLY for `key = "search:req_B"`
4. ✅ Old backlog for `"search:req_A"` is NOT drained

### 3. ✅ No Server-Side Auto-Resubscribe on Reconnect

**Verified - No auto-resubscribe logic exists:**

```typescript
// server/src/infra/websocket/websocket-manager.ts (line 108-119)
private handleConnection(ws: WebSocket, req: any): void {
  setupConnection(
    ws,
    req,
    this.handleMessage.bind(this),
    this.handleCloseEvent.bind(this),
    this.handleErrorEvent.bind(this)
  );
  
  // DISABLED: No ws_status broadcasts to clients (UI doesn't show connection status)
  // this.sendConnectionStatus(ws, 'connected');
}
```

**Key Point:** When a WebSocket reconnects, the server does NOT automatically send subscribe messages. Subscriptions are **100% client-driven**.

**Client-Side Auto-Resubscribe (Frontend Handles This):**
```typescript
// llm-angular/src/app/core/services/ws/ws-subscriptions.ts (line 101-118)
onConnected(): void {
  // Re-subscribe all ACTIVE subscriptions (from client's subscription map)
  for (const sub of this.subscriptions.values()) {
    const msg = this.buildMessage('subscribe', sub);
    this.trySend(msg);
  }
}
```

Since the frontend clears old subscriptions before new search (see `STALE_RESULTS_FIX.md`), only the current `requestId` is resubscribed on reconnect. ✅

### 4. ✅ Enhanced Logging with Required Fields

**Updated `backlog-manager.ts`:**

```typescript
// Enqueue logging (line 40-66)
logger.info({
  subscriptionKey: key,          // NEW: Exact backlog key
  channel,
  requestId,
  event: 'backlog_created'
}, 'WebSocket backlog created for late subscribers');

logger.debug({
  subscriptionKey: key,          // NEW: Exact backlog key
  channel,
  requestId,
  backlogSize: entry.items.length,
  totalMessages: totalMessages + 1,
  event: 'backlog_enqueued'
}, 'WebSocket message enqueued to backlog');
```

**Drain logging (line 102-161):**

```typescript
// Expired backlog
logger.debug({
  subscriptionKey: key,          // NEW: Exact backlog key
  drainedRequestId: requestId,   // NEW: Explicit requestId being drained
  channel,
  clientId,                      // NEW: Client receiving drain
  event: 'backlog_expired'
}, 'WebSocket backlog expired, not drained');

// Drain failure
logger.warn({
  subscriptionKey: key,          // NEW: Exact backlog key
  drainedRequestId: requestId,   // NEW: Explicit requestId being drained
  channel,
  clientId,                      // NEW: Client receiving drain
  error: err instanceof Error ? err.message : 'unknown',
  event: 'backlog_drain_failed'
}, 'WebSocket send failed in drainBacklog');

// Drain success
logger.info({
  subscriptionKey: key,          // NEW: Exact backlog key
  drainedRequestId: requestId,   // NEW: Explicit requestId being drained
  channel,
  clientId,                      // NEW: Client receiving drain
  count: sent,
  ...(failed > 0 && { failedCount: failed }),
  event: 'backlog_drained'
}, 'WebSocket backlog drained to late subscriber');
```

## How It Prevents Cross-Request Leakage

### Scenario: Search A → WS Disconnect → Search B → WS Reconnect

```
1. User submits Search A:
   ├─ POST /search → {requestId: "req_A"}
   ├─ WS subscribe("search:req_A")
   ├─ Backend publishes 5 messages to "search:req_A"
   ├─ Messages backlogged: backlog["search:req_A"] = [msg1, msg2, msg3, msg4, msg5]
   └─ WS connection drops BEFORE client subscribes

2. User submits Search B:
   ├─ Frontend: clearAllSubscriptions() → unsubscribe("req_A")
   ├─ POST /search → {requestId: "req_B"}
   ├─ currentRequestId = "req_B"
   ├─ Backend publishes 3 messages to "search:req_B"
   └─ Messages backlogged: backlog["search:req_B"] = [msg6, msg7, msg8]

3. WS reconnects:
   ├─ Frontend onConnected() resubscribes ALL in subscriptions.values()
   ├─ subscriptions.size = 1 (only "req_B" because we cleared "req_A")
   ├─ WS subscribe("search:req_B")
   │
   ├─ Backend builds key = "search:req_B"
   ├─ Backend sends sub_ack
   ├─ Backend drains backlog["search:req_B"] → sends [msg6, msg7, msg8] ✅
   └─ backlog["search:req_A"] remains (will expire after TTL) ✅

4. Result:
   ✅ Client receives ONLY "req_B" backlog messages
   ❌ Client does NOT receive "req_A" backlog messages
   ✅ No cross-request leakage
```

### Scenario: Rapid Search Switching (No Disconnect)

```
1. User submits Search A:
   ├─ POST /search → {requestId: "req_A"}
   ├─ WS subscribe("search:req_A")
   ├─ Backend publishes to backlog["search:req_A"]

2. User immediately submits Search B (before A results arrive):
   ├─ Frontend: clearAllSubscriptions() → WS unsubscribe("search:req_A")
   ├─ Backend removes subscriptions["search:req_A"]
   ├─ POST /search → {requestId: "req_B"}
   ├─ WS subscribe("search:req_B")
   ├─ Backend builds key = "search:req_B"
   ├─ Backend drains backlog["search:req_B"] (empty at this point)
   
3. Backend continues publishing messages for A:
   ├─ No subscribers for "search:req_A" (unsubscribed)
   ├─ Messages enqueued to backlog["search:req_A"]
   ├─ Client never subscribes to "req_A" again
   └─ ✅ Old results never reach client

4. Backend publishes messages for B:
   ├─ Active subscribers for "search:req_B"
   ├─ Messages sent directly to client ✅
   └─ ✅ Only B results shown
```

## Verification in Logs

### Look for these log entries:

**Backlog Creation:**
```json
{
  "level": "info",
  "subscriptionKey": "search:req_B",
  "channel": "search",
  "requestId": "req_B",
  "event": "backlog_created",
  "msg": "WebSocket backlog created for late subscribers"
}
```

**Backlog Enqueued:**
```json
{
  "level": "debug",
  "subscriptionKey": "search:req_B",
  "channel": "search",
  "requestId": "req_B",
  "backlogSize": 3,
  "totalMessages": 3,
  "event": "backlog_enqueued",
  "msg": "WebSocket message enqueued to backlog"
}
```

**Backlog Drained (on subscribe):**
```json
{
  "level": "info",
  "subscriptionKey": "search:req_B",
  "drainedRequestId": "req_B",
  "channel": "search",
  "clientId": "abc123...",
  "count": 3,
  "event": "backlog_drained",
  "msg": "WebSocket backlog drained to late subscriber"
}
```

**Key Fields to Verify:**
- ✅ `subscriptionKey` matches the exact channel:requestId being drained
- ✅ `drainedRequestId` matches the client's current requestId
- ✅ `clientId` identifies the receiving client
- ✅ `count` shows number of messages drained from THIS subscriptionKey only

## Files Modified

1. ✅ `server/src/infra/websocket/backlog-manager.ts`
   - Added `subscriptionKey`, `drainedRequestId`, `clientId` to all logs
   - Enhanced comments explaining strict keying

2. ✅ `server/src/infra/websocket/subscription-manager.ts`
   - Enhanced comment on `buildSubscriptionKey` explaining strict keying
   - Emphasized that sessionId is ignored

3. ✅ Verification: No server-side auto-resubscribe logic exists
   - Checked `websocket-manager.ts::handleConnection`
   - Checked `connection-handler.ts::setupConnection`
   - Confirmed subscriptions are 100% client-driven

## Summary

| Requirement | Status | Details |
|-------------|--------|---------|
| **#1: Backlog keyed by `${channel}:${requestId}`** | ✅ Already correct | `buildSubscriptionKey` ignores sessionId |
| **#2: Drain only for exact subscriptionKey** | ✅ Already correct | Drain uses exact key from `buildSubscriptionKey` |
| **#3: Add log fields** | ✅ Fixed | Added `subscriptionKey`, `drainedRequestId`, `clientId` |
| **#4: No server-side auto-resubscribe** | ✅ Verified | Subscriptions are 100% client-driven |

## Result

✅ **Backlog is strictly keyed by `${channel}:${requestId}`**  
✅ **Drain only happens for exact subscriptionKey on sub_ack**  
✅ **Enhanced logging with subscriptionKey, drainedRequestId, clientId**  
✅ **No server-side auto-resubscribe on reconnect**  

🎉 **Cross-request backlog leakage is prevented!**
