# CTO-Grade WebSocket Assistant Channel Fix

**Date:** 2026-01-28  
**Protocol:** sub_ack/sub_nack + pending subscriptions  
**Status:** ✅ Complete

## Executive Summary

Implemented enterprise-grade WebSocket protocol with:
- **No socket kill on subscribe errors** - graceful rejection with sub_nack
- **Server-trust-only authentication** - sessionId/userId from ticket/JWT only, never from client
- **Pending subscriptions** - pre-subscribe before job creation with automatic activation
- **Dual channel subscription** - separate 'search' and 'assistant' channels
- **Comprehensive logging** - connection context, subscribe attempts, ack/nack events

## Protocol Changes

### New Message Types

#### Server → Client: sub_ack
```typescript
{
  type: 'sub_ack',
  channel: 'search' | 'assistant',
  requestId: string,
  pending: boolean  // true if awaiting job creation
}
```

#### Server → Client: sub_nack
```typescript
{
  type: 'sub_nack',
  channel: 'search' | 'assistant',
  requestId: string,
  reason: 'session_mismatch' | 'invalid_request' | 'unauthorized'
}
```

### Subscribe Flow

```
1. Client subscribes → server validates → checks ownership
2a. Owner matches → sub_ack(pending: false) + activate subscription
2b. Owner null (job not created) → sub_ack(pending: true) + register pending
2c. Owner mismatch → sub_nack + NO SOCKET KILL
3. When job created → activate all pending subscriptions for that requestId
```

## Backend Changes

### 1. WebSocket Protocol Types (`server/src/infra/websocket/websocket-protocol.ts`)

Added new server message types:
```typescript
export interface WSServerSubAck {
  type: 'sub_ack';
  channel: WSChannel;
  requestId: string;
  pending: boolean;
}

export interface WSServerSubNack {
  type: 'sub_nack';
  channel: WSChannel;
  requestId: string;
  reason: 'session_mismatch' | 'invalid_request' | 'unauthorized';
}
```

### 2. WebSocket Manager (`server/src/infra/websocket/websocket-manager.ts`)

**Added Connection Context:**
```typescript
interface WebSocketContext {
  sessionId: string;
  userId?: string;
  clientId: string;
  connectedAt: number;
}
```

Stored on WebSocket at connection time from ticket/JWT (line ~338):
```typescript
const ctx: WebSocketContext = {
  sessionId: req.sessionId ?? 'anonymous',
  userId: req.userId ?? undefined,
  clientId,
  connectedAt: Date.now()
};
(ws as any).ctx = ctx;
```

**Added Pending Subscriptions:**
```typescript
interface PendingSubscription {
  ws: WebSocket;
  channel: WSChannel;
  requestId: string;
  sessionId: string;
  expiresAt: number;
}

private pendingSubscriptions = new Map<string, PendingSubscription>();
private readonly PENDING_SUB_TTL_MS = 90 * 1000; // 90 seconds
```

**New Methods:**

1. `handleSubscribeRequest()` (line ~783) - CTO-grade subscribe handler:
   - Validates payload strictly
   - Gets connSessionId from `ws.ctx.sessionId` (never from client)
   - Checks ownership via `jobStore.getRequestOwner()`
   - Sends `sub_nack` on mismatch WITHOUT closing socket
   - Sends `sub_ack(pending: true)` if job doesn't exist
   - Sends `sub_ack(pending: false)` if owner matches

2. `activatePendingSubscriptions()` (line ~946) - Activates pending subs:
   - Called when job is created/running
   - Finds all pending subs for requestId
   - Verifies sessionId matches owner
   - Moves to active subscriptions
   - Sends updated `sub_ack(pending: false)`
   - Drains backlog if exists

3. `cleanupExpiredPendingSubscriptions()` (line ~1015) - Cleanup:
   - Called in heartbeat interval
   - Removes expired pending subs (TTL: 90s)
   - Sends `sub_nack` to client

4. `sendSubAck()` / `sendSubNack()` (line ~915, ~932) - Message senders

**Updated Logging:**

Connection (line ~360):
```typescript
logger.info({
  clientId,
  sessionHash,
  hasUserId: !!ctx.userId,
  event: 'ws_conn_ctx_set'
}, 'WebSocket connection context established');
```

Subscribe attempt (line ~807):
```typescript
logger.info({
  clientId,
  channel,
  requestIdHash,
  sessionHash,
  event: 'ws_subscribe_attempt'
}, 'WebSocket subscribe attempt');
```

Subscribe ack/nack (line ~886, ~899):
```typescript
logger.info({
  clientId,
  channel,
  requestIdHash,
  sessionHash,
  pending: false|true,
  event: 'ws_subscribe_ack'
}, 'Subscribe accepted/pending');

logger.warn({
  clientId,
  channel,
  requestIdHash,
  reason: 'session_mismatch',
  event: 'ws_subscribe_nack'
}, 'Subscribe rejected (no socket kill)');
```

### 3. Search Controller (`server/src/controllers/search/search.controller.ts`)

**Imported wsManager:**
```typescript
import { wsManager } from '../../server.js';
```

**Activate pending subscriptions after job creation** (line ~290):
```typescript
logger.info(..., 'Job created with JWT session binding');

// CTO-grade: Activate pending subscriptions for this request
wsManager.activatePendingSubscriptions(requestId, ownerSessionId || 'anonymous');
```

## Frontend Changes

### 1. Protocol Types (`llm-angular/src/app/core/models/ws-protocol.types.ts`)

Added new server message types:
```typescript
export interface WSServerSubAck {
  type: 'sub_ack';
  channel: WSChannel;
  requestId: string;
  pending: boolean;
}

export interface WSServerSubNack {
  type: 'sub_nack';
  channel: WSChannel;
  requestId: string;
  reason: 'session_mismatch' | 'invalid_request' | 'unauthorized';
}
```

### 2. WS Client Service (`llm-angular/src/app/core/services/ws-client.service.ts`)

**Enhanced message handling** (line ~291):
```typescript
// CTO-grade: Log sub_ack/sub_nack messages
if (data.type === 'sub_ack') {
  const ack = data as any;
  console.log('[WS] Subscription acknowledged', {
    channel: ack.channel,
    requestId: ack.requestId,
    pending: ack.pending
  });
} else if (data.type === 'sub_nack') {
  const nack = data as any;
  console.warn('[WS] Subscription rejected (no socket kill)', {
    channel: nack.channel,
    requestId: nack.requestId,
    reason: nack.reason
  });
}
```

### 3. Search Facade (`llm-angular/src/app/facades/search.facade.ts`)

**Handle sub_ack/sub_nack gracefully** (line ~374):
```typescript
// CTO-grade: Handle sub_ack/sub_nack messages
if ((msg as any).type === 'sub_ack') {
  console.log('[SearchFacade] Subscription acknowledged', {...});
  return;
}

if ((msg as any).type === 'sub_nack') {
  console.warn('[SearchFacade] Subscription rejected', {...});
  
  // For assistant channel sub_nack, show inline message (no toast)
  if (nack.channel === 'assistant') {
    console.log('[SearchFacade] Assistant subscription rejected - continuing with search channel only');
  }
  
  // Do NOT treat as hard failure - WS stays alive, search channel still works
  return;
}
```

**Dual subscription already implemented** (line ~193):
```typescript
// Subscribe to WebSocket for real-time updates
// 1. 'search' channel for progress/status/ready
this.wsClient.subscribe(requestId, 'search', this.conversationId());
// 2. 'assistant' channel for narrator messages
this.wsClient.subscribe(requestId, 'assistant', this.conversationId());
```

## Security Model

### Server-Trust-Only Authentication

**Source of Truth:** WebSocket connection context (`ws.ctx`)
- Set ONCE at connection time from verified ticket/JWT
- Never modified or overridden by client messages
- Used for ALL authorization decisions

**Defense in Depth:**
```typescript
// Get context from WebSocket (source of truth from ticket/JWT)
const ctx = (ws as any).ctx as WebSocketContext | undefined;
const connSessionId = ctx?.sessionId || 'anonymous';
const connUserId = ctx?.userId;

// Client-supplied sessionId is IGNORED for authorization
// Only connSessionId is used for ownership checks
```

### No Socket Kill on Subscribe Errors

**Old Behavior:**
```typescript
if (owner.sessionId !== wsSessionId) {
  ws.close(1008, 'NOT_AUTHORIZED');  // ❌ Kills entire connection
  return;
}
```

**New Behavior:**
```typescript
if (ownerSessionId && ownerSessionId !== connSessionId) {
  this.sendSubNack(ws, channel, requestId, 'session_mismatch');  // ✅ Graceful reject
  return;  // Socket stays alive
}
```

## Logging

### High-Signal Events

1. **ws_conn_ctx_set** - Connection established with context
   ```json
   {
     "clientId": "abc123",
     "sessionHash": "4f2e8a9b3c1d",
     "hasUserId": true,
     "event": "ws_conn_ctx_set"
   }
   ```

2. **ws_subscribe_attempt** - Subscribe request received
   ```json
   {
     "clientId": "abc123",
     "channel": "assistant",
     "requestIdHash": "8d4a2f1e3b9c",
     "sessionHash": "4f2e8a9b3c1d",
     "event": "ws_subscribe_attempt"
   }
   ```

3. **ws_subscribe_ack** - Subscription accepted
   ```json
   {
     "clientId": "abc123",
     "channel": "assistant",
     "requestIdHash": "8d4a2f1e3b9c",
     "sessionHash": "4f2e8a9b3c1d",
     "pending": false,
     "event": "ws_subscribe_ack"
   }
   ```

4. **ws_subscribe_nack** - Subscription rejected (no socket kill)
   ```json
   {
     "clientId": "abc123",
     "channel": "assistant",
     "requestIdHash": "8d4a2f1e3b9c",
     "reason": "session_mismatch",
     "event": "ws_subscribe_nack"
   }
   ```

5. **pending_subscription_activated** - Pending sub activated
   ```json
   {
     "clientId": "abc123",
     "channel": "assistant",
     "requestIdHash": "8d4a2f1e3b9c",
     "event": "pending_subscription_activated"
   }
   ```

## Verification Cases

### Case A: Gate STOP (not_food_related)

**Test:** Query "weather in tel aviv"

**Expected:**
1. WS connection stays alive (no hard failure)
2. Client receives `sub_ack` for assistant channel (pending or not)
3. Assistant message delivered on channel "assistant"
4. Logs show:
   - `ws_conn_ctx_set`
   - `ws_subscribe_attempt` (channel: assistant)
   - `ws_subscribe_ack` (pending: false or true)
   - `assistant_hook_called` (hookType: GATE_FAIL)
   - `websocket_published` (channel: assistant, clientCount > 0)

### Case B: Successful Search with Summary

**Test:** Query "pizza near me"

**Expected:**
1. Full search completes
2. END_SUMMARY assistant message received
3. Logs show:
   - `assistant_hook_called` (hookType: SUMMARY)
   - `websocket_published` (channel: assistant, payloadType: assistant_message)

### Case C: Wrong RequestId (Intentional Mismatch)

**Test:** Subscribe to assistant channel with requestId from different session

**Expected:**
1. Client receives `sub_nack` (reason: session_mismatch)
2. WS connection remains connected
3. Search channel still works
4. Logs show:
   - `ws_subscribe_attempt`
   - `ws_subscribe_nack` (reason: session_mismatch)
   - NO socket close event

### Case D: Pre-Subscribe (Pending Activation)

**Test:** Connect WS and subscribe to assistant before job is created

**Expected:**
1. Client receives `sub_ack` (pending: true)
2. When /search POST creates job, pending sub activates
3. Client receives updated `sub_ack` (pending: false)
4. Backlog drained if any messages were published
5. Logs show:
   - `ws_subscribe_ack` (pending: true)
   - `pending_subscription_activated`
   - `backlog_drained` (if applicable)

## Files Modified

### Backend
- `server/src/infra/websocket/websocket-protocol.ts` - Added sub_ack/sub_nack types
- `server/src/infra/websocket/websocket-manager.ts` - Core CTO-grade implementation
- `server/src/controllers/search/search.controller.ts` - Activate pending subscriptions

### Frontend
- `llm-angular/src/app/core/models/ws-protocol.types.ts` - Added sub_ack/sub_nack types
- `llm-angular/src/app/core/services/ws-client.service.ts` - Log sub_ack/sub_nack
- `llm-angular/src/app/facades/search.facade.ts` - Handle sub_ack/sub_nack gracefully

## Key Implementation Details

### Pending Subscription Flow

1. **Client subscribes early:**
   ```typescript
   // Before /search POST
   ws.send({ type: 'subscribe', channel: 'assistant', requestId: 'req_123' });
   ```

2. **Server checks ownership:**
   ```typescript
   const owner = await this.getRequestOwner(requestId);
   // owner is null (job not created yet)
   ```

3. **Server registers pending:**
   ```typescript
   this.pendingSubscriptions.set(`assistant:req_123:sess_abc`, {
     ws, channel, requestId, sessionId,
     expiresAt: Date.now() + 90000
   });
   this.sendSubAck(ws, channel, requestId, true); // pending: true
   ```

4. **Job created:**
   ```typescript
   await searchJobStore.createJob(requestId, { sessionId, ... });
   wsManager.activatePendingSubscriptions(requestId, sessionId);
   ```

5. **Server activates:**
   ```typescript
   // Finds pending sub, verifies session matches
   this.subscribeToChannel(channel, requestId, sessionId, ws);
   this.sendSubAck(ws, channel, requestId, false); // pending: false
   this.drainBacklog(...); // Send any queued messages
   ```

### Assistant Channel Enablement

**Backlog/Drain:**
- Works identically for 'search' and 'assistant' channels
- `buildSubscriptionKey()` handles both channels
- `publishToChannel()` enqueues to backlog if no subscribers
- `drainBacklog()` replays messages to late subscribers

**Publishing:**
```typescript
// Assistant/Narrator publisher (server/src/services/search/route2/narrator/assistant-publisher.ts)
wsManager.publishToChannel('assistant', requestId, sessionId, {
  type: 'assistant_message',
  requestId,
  narrator: { type, message, question, suggestedAction, blocksSearch },
  timestamp: Date.now()
});
```

## Migration Notes

### Backward Compatibility

- Old clients without sub_ack/sub_nack handling: Work normally, just don't see ack messages
- Legacy subscribe format: Still supported via `normalizeToCanonical()`
- Existing 'search' channel: Zero changes to behavior

### Rollout Strategy

1. Deploy backend first (new protocol is additive)
2. Monitor logs for `ws_subscribe_ack/nack` events
3. Deploy frontend to start handling sub_ack/sub_nack
4. Verify no socket kills on mismatch (check close events in logs)

## Summary

**What Changed:**
- Subscribe errors no longer kill WebSocket connection
- Server-trust-only auth (sessionId from ticket/JWT, never client)
- Pending subscriptions allow pre-subscribe before job creation
- Sub_ack/sub_nack protocol provides feedback to client
- Comprehensive logging for debugging and monitoring

**What Stayed Same:**
- Search channel behavior unchanged
- Assistant message format unchanged
- Backlog/drain mechanism unchanged
- Connection/heartbeat logic unchanged

**Security Posture:**
- ✅ Server is source of truth for identity
- ✅ Client cannot spoof sessionId for authorization
- ✅ Graceful degradation (sub_nack) instead of hard failures
- ✅ Pending subscriptions expire after 90s (no memory leak)
- ✅ Comprehensive audit logging for security monitoring
