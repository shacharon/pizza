# Phase 3 Implementation - COMPLETE ✅

**Date**: 2026-01-10  
**Status**: Build Green, Tests Passing  
**Phase**: WebSocket Layer with Real-Time Streaming  

---

## Summary

Phase 3 successfully implements the WebSocket layer for real-time assistant narration streaming and bidirectional client communication. The `WebSocketManager` provides robust connection management with heartbeats, subscription tracking, leak-safe cleanup, and structured logging.

---

## Deliverables Completed

### 1. WebSocket Protocol Types ✅
- **File**: `server/src/infra/websocket/websocket-protocol.ts`
- **Client→Server Messages**:
  - `WSClientSubscribe` - Subscribe to requestId updates
  - `WSClientActionClicked` - User clicked an action
  - `WSClientUIStateChanged` - UI state changed (map, zoom, etc.)
- **Server→Client Messages**:
  - `WSServerStatus` - Assistant status updates
  - `WSServerStreamDelta` - Streaming text chunks
  - `WSServerStreamDone` - Stream completed
  - `WSServerRecommendation` - Action recommendations
  - `WSServerError` - Error messages
- **Validation**: `isWSClientMessage()` helper for robust parsing

### 2. WebSocket Manager ✅
- **File**: `server/src/infra/websocket/websocket-manager.ts`
- **Class**: `WebSocketManager`
- **Features**:
  - Mounts at `/ws` path
  - Connection tracking with unique client IDs
  - Subscription management: `Map<requestId, Set<WebSocket>>`
  - Reverse mapping: `WeakMap<WebSocket, Set<requestId>>` for leak-safe cleanup
  - Origin verification (allowlist support)
  - Heartbeat ping/pong (30s default)
  - Terminates dead connections automatically
  - Graceful shutdown (closes all connections with code 1001)
  - Stats utility for monitoring

### 3. Server Integration ✅
- **File**: `server/src/server.ts`
- **Changes**:
  - Imported `WebSocketManager`
  - Initialized WebSocket manager with HTTP server
  - Configured path `/ws`, heartbeat 30s, origins from env var
  - Added `wsManager.shutdown()` to graceful shutdown handler

### 4. Integration Tests ✅
- **File**: `server/tests/websocket-manager.test.ts`
- **Coverage**:
  - ✅ Accept WebSocket connections
  - ✅ Handle subscribe messages
  - ✅ Publish messages to subscribers
  - ✅ Cleanup subscriptions on disconnect
  - ✅ Reject invalid messages
- **Results**: **5/5 tests passing**

### 5. Dependencies ✅
- Installed `ws` package (WebSocket library)
- Installed `@types/ws` (TypeScript types)
- Used `--legacy-peer-deps` to resolve zod conflict

---

## Code Changes Summary

### Files Created (3)
1. `server/src/infra/websocket/websocket-protocol.ts` (100 lines) - Protocol types + validation
2. `server/src/infra/websocket/websocket-manager.ts` (310 lines) - WebSocket manager implementation
3. `server/tests/websocket-manager.test.ts` (170 lines) - Integration tests

### Files Modified (2)
1. `server/src/server.ts`
   - Added WebSocketManager import and initialization
   - Enhanced shutdown handler with `wsManager.shutdown()`

2. `server/package.json` (via npm)
   - Added `ws@^8.x` to dependencies
   - Added `@types/ws` to devDependencies

---

## Architecture

```
┌──────────────────────────────────────────┐
│  HTTP Server (Express)                   │
│  - Port 3000                             │
│  - REST API routes                       │
└──────────────────┬───────────────────────┘
                   │
                   │ (shares same port)
                   ▼
┌──────────────────────────────────────────┐
│  WebSocketServer                         │
│  - Path: /ws                             │
│  - Origin verification                   │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│  WebSocketManager                        │
│  ┌────────────────────────────────────┐  │
│  │  Subscriptions:                    │  │
│  │  Map<requestId, Set<WebSocket>>    │  │
│  │  - req-123 → {ws1, ws2}            │  │
│  │  - req-456 → {ws3}                 │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Reverse Map (for cleanup):        │  │
│  │  WeakMap<WebSocket, Set<requestId>>│  │
│  │  - ws1 → {req-123}                 │  │
│  │  - ws2 → {req-123}                 │  │
│  │  - ws3 → {req-456}                 │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Heartbeat Timer (30s):            │  │
│  │  - Ping all clients                │  │
│  │  - Terminate unresponsive          │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

---

## Message Flow Examples

### Subscribe Flow
```
Client                    WebSocketManager
  │                              │
  ├─ Connect ws://host/ws ──────►
  │                              │
  │◄──────────── Accepted ───────┤
  │                              │
  ├─ {type:"subscribe",          │
  │   requestId:"req-123"} ──────►
  │                              │
  │                              ├─ Add to subscriptions
  │                              │  Map: req-123 → {ws}
  │                              │
  │◄──────── (subscribed) ───────┤
```

### Publish Flow
```
AssistantJobService    WebSocketManager      Client
  │                         │                   │
  ├─ publish(req-123, {     │                   │
  │   type:"stream.delta",  │                   │
  │   text:"Found 10..."    │                   │
  │ }) ────────────────────►│                   │
  │                         │                   │
  │                         ├─ Lookup req-123   │
  │                         │  → {ws1, ws2}     │
  │                         │                   │
  │                         ├─ ws1.send(msg) ───►
  │                         ├─ ws2.send(msg) ───►
```

### Cleanup Flow (Disconnect)
```
Client                    WebSocketManager
  │                              │
  ├─ Close connection ───────────►
  │                              │
  │                              ├─ Lookup reverse map
  │                              │  ws → {req-123, req-456}
  │                              │
  │                              ├─ Remove ws from req-123
  │                              ├─ Remove ws from req-456
  │                              ├─ Delete empty sets
  │                              │
  │◄──────── Cleaned up ─────────┤
```

---

## Protocol Examples

### Client → Server

**Subscribe to Request**:
```json
{
  "type": "subscribe",
  "requestId": "req-abc-123"
}
```

**Action Clicked**:
```json
{
  "type": "action_clicked",
  "requestId": "req-abc-123",
  "actionId": "call"
}
```

**UI State Changed**:
```json
{
  "type": "ui_state_changed",
  "requestId": "req-abc-123",
  "state": {
    "selectedResultId": "google_ChIJ...",
    "mapCenter": { "lat": 32.0, "lng": 34.7 },
    "zoom": 14
  }
}
```

### Server → Client

**Status Update**:
```json
{
  "type": "status",
  "requestId": "req-abc-123",
  "status": "streaming"
}
```

**Stream Delta**:
```json
{
  "type": "stream.delta",
  "requestId": "req-abc-123",
  "text": "Found "
}
```

**Stream Done**:
```json
{
  "type": "stream.done",
  "requestId": "req-abc-123",
  "fullText": "Found 10 great pizza places in Tel Aviv!"
}
```

**Recommendation**:
```json
{
  "type": "recommendation",
  "requestId": "req-abc-123",
  "actions": [
    { "id": "call", "type": "CALL", "label": "Call Restaurant", "icon": "📞" },
    { "id": "directions", "type": "DIRECTIONS", "label": "Get Directions", "icon": "📍" }
  ]
}
```

**Error**:
```json
{
  "type": "error",
  "requestId": "req-abc-123",
  "error": "timeout",
  "message": "Assistant request timed out after 15s"
}
```

---

## Structured Logging Examples

### Connection Events
```json
{"level":"info","clientId":"ws-1768071679005-sz067l","origin":"http://localhost:4200","userAgent":"Mozilla/5.0...","msg":"websocket_connected"}

{"level":"info","clientId":"ws-1768071679005-sz067l","requestId":"req-123","msg":"websocket_subscribed"}

{"level":"info","clientId":"ws-1768071679005-sz067l","msg":"websocket_disconnected"}
```

### Message Events
```json
{"level":"debug","requestId":"req-123","messageType":"stream.delta","subscriberCount":2,"sentCount":2,"msg":"websocket_message_sent"}
```

### Heartbeat Events
```json
{"level":"debug","terminated":1,"active":5,"msg":"WebSocket heartbeat: terminated dead connections"}
```

### Shutdown
```json
{"level":"info","closedConnections":3,"msg":"WebSocketManager shutdown"}
```

---

## Test Results

```bash
$ node --test --import tsx tests/websocket-manager.test.ts

TAP version 13
# WebSocketManager - Phase 3
    ok 1 - should accept WebSocket connections
    ok 2 - should handle subscribe message
    ok 3 - should publish messages to subscribers
    ok 4 - should cleanup subscriptions on disconnect
    ok 5 - should reject invalid messages
    1..5
ok 1 - WebSocketManager - Phase 3

# tests 5
# pass 5
# fail 0
```

**Status**: ✅ **5/5 tests passing**

---

## Leak Prevention Strategy

### Problem: Memory Leaks from Closed Connections

**Without cleanup**:
```
1. Client subscribes to req-123
2. Map: req-123 → {ws}
3. Client disconnects
4. Map STILL contains: req-123 → {closed ws}
5. Memory leak: dead WebSocket never GC'd
```

**With WeakMap cleanup**:
```
1. Client subscribes to req-123
2. subscriptions: Map<req-123, Set<ws>>
3. socketToRequests: WeakMap<ws, Set<req-123>>
4. Client disconnects → close event
5. Lookup socketToRequests.get(ws) → {req-123}
6. Remove ws from subscriptions.get(req-123)
7. Delete empty sets
8. GC can now collect dead WebSocket ✅
```

### Why WeakMap?

- **Automatic GC**: If WebSocket is GC'd externally, WeakMap entry automatically removed
- **No memory leak**: Reverse mapping doesn't prevent GC of WebSocket objects
- **O(1) cleanup**: Direct lookup of all requestIds for a given WebSocket

---

## Heartbeat Mechanism

### Purpose
Detect and terminate dead connections that failed to close cleanly (network issues, crashed clients, etc.)

### Implementation
```typescript
// Every 30 seconds:
1. Mark all connections as potentially dead (isAlive = false)
2. Send ping to all connections
3. If connection responds with pong → isAlive = true
4. Next heartbeat:
   - If isAlive = false → terminate + cleanup
   - If isAlive = true → mark false + ping again
```

### Why `unref()`?
```typescript
this.heartbeatInterval.unref();
```
- Prevents heartbeat interval from blocking Node.js exit
- Server can gracefully shut down even if heartbeat is scheduled
- Still runs while server is active

---

## Origin Verification

### Configuration
```typescript
// server.ts
const wsManager = new WebSocketManager(server, {
  allowedOrigins: process.env.WS_ALLOWED_ORIGINS?.split(',') || ['*']
});
```

### Environment Variable
```bash
# .env
WS_ALLOWED_ORIGINS=http://localhost:4200,https://app.going2eat.food
```

### Behavior
- `['*']` → Allow all origins (MVP default)
- `['localhost', 'going2eat.food']` → Only allow matching origins
- Rejected connections logged with origin

---

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| **Connect** | O(1) | Add to wss.clients Set |
| **Subscribe** | O(1) | Map + Set insertion |
| **Publish** | O(N) | N = subscribers for requestId |
| **Disconnect** | O(M) | M = requestIds for socket |
| **Heartbeat** | O(K) | K = total connections |

### Memory per Connection
```
Assumptions:
- Average 2 subscriptions per socket
- 1000 concurrent connections

Memory:
- WebSocket object: ~5 KB
- Subscription Map entries: ~100 bytes each
- Total: 1000 * 5KB + 2000 * 100B = ~5.2 MB
```

---

## Manual Testing with wscat

```bash
# Install wscat globally
npm install -g wscat

# Start server
npm run dev

# In another terminal, connect to WebSocket
wscat -c ws://localhost:3000/ws

# Subscribe to requestId
> {"type":"subscribe","requestId":"test-123"}

# Server should log:
# websocket_connected
# websocket_subscribed

# Test invalid message
> {"type":"invalid","foo":"bar"}
< {"type":"error","requestId":"unknown","error":"invalid_message","message":"Invalid message format"}

# Disconnect
> Ctrl+C
```

---

## Backward Compatibility

✅ **ZERO BREAKING CHANGES**

- WebSocket server shares HTTP port (no new port needed)
- REST API continues to work unchanged
- Existing clients unaffected
- WebSocket is opt-in (clients can choose not to use it)

---

## AWS ALB Compatibility

### ALB WebSocket Support ✅
- AWS ALB supports WebSocket upgrades over HTTP/1.1
- Requires Connection: Upgrade header (handled by `ws` library)
- No special ALB configuration needed for Phase 3

### Future: Scaling Considerations (Phase 4+)
When deploying multiple ECS tasks:
- WebSocket connections are sticky to single instance
- Need Redis pub/sub for cross-instance message routing
- Pattern:
  ```
  Task A: wsManager.publish(req-123, msg)
    → Redis.publish('ws:req-123', msg)
  
  Task B: Redis.subscribe('ws:*')
    → wsManager.localPublish(req-123, msg)
  ```

---

## Phase 4 Prerequisites ✅

Phase 3 provides the foundation for Phase 4 (Assistant Jobs):

- ✅ WebSocket protocol types defined
- ✅ `WebSocketManager.publish()` available for streaming
- ✅ Subscription management ready
- ✅ Structured logging in place
- ✅ Graceful shutdown working

**Next Step**: Implement `AssistantJobService` for async LLM streaming

---

## Acceptance Criteria - Phase 3 ✅

- [x] WebSocket protocol types defined (client & server messages)
- [x] `isWSClientMessage()` validation helper
- [x] `WebSocketManager` class implemented
- [x] `subscribe(requestId, ws)` method
- [x] `publish(requestId, message)` method
- [x] `cleanup(ws)` removes from ALL subscriptions
- [x] `Map<requestId, Set<WebSocket>>` subscription tracking
- [x] `WeakMap<WebSocket, Set<requestId>>` reverse mapping
- [x] Origin allowlist verification
- [x] Robust `onMessage`: try/catch + validation
- [x] Heartbeat ping/pong (30s interval)
- [x] Terminate dead connections + cleanup
- [x] Structured logs: websocket_connected, websocket_subscribed, etc.
- [x] WebSocket mounted at `/ws` on HTTP server
- [x] Graceful shutdown: close connections + clear intervals
- [x] Integration tests: connect, subscribe, publish, cleanup, invalid message
- [x] All 5 tests passing
- [x] TypeScript compiles (no errors)
- [x] Zero breaking changes

---

## Commands to Verify

```bash
# 1. Run Phase 3 tests
cd server
node --test --import tsx tests/websocket-manager.test.ts

# 2. Verify TypeScript compilation
npx tsc --noEmit

# 3. Test with wscat
npm run dev
# In another terminal:
wscat -c ws://localhost:3000/ws
> {"type":"subscribe","requestId":"test-123"}

# 4. Run all tests
npm test
```

---

**Phase 3 Status**: ✅ **COMPLETE - BUILD GREEN**

**Ready for Phase 4**: AssistantJobService with Streaming
