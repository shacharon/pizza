# WebSocket Event Emission on ROUTE2 Completion

## Implementation

Added WebSocket event emission when ROUTE2 pipeline completes, notifying all subscribed clients that the search has finished.

## Files Changed

### 1. `server/src/services/search/route2/route2.orchestrator.ts`

**Line 23:** Added import
```typescript
import { wsManager } from '../../../server.js';
```

**Lines 234-238:** Added WebSocket publish call (after pipeline_completed log)
```typescript
// Emit WebSocket event to subscribers
wsManager.publishToChannel('search', requestId, undefined, {
  type: 'status',
  requestId,
  status: 'completed'
});
```

### 2. `server/src/infra/websocket/websocket-manager.ts`

**Lines 529-533:** Changed logging from debug to info with simpler format
```typescript
logger.info({
  channel,
  requestId,
  clientCount: sent
}, 'websocket_published');
```

## Exact Publish Call Site

**File:** `server/src/services/search/route2/route2.orchestrator.ts`  
**Line:** 234-238  
**Location:** After `logger.info` for `pipeline_completed`, before `return response`

```typescript
// Log pipeline completion
logger.info({
  requestId,
  pipelineVersion: 'route2',
  event: 'pipeline_completed',
  durationMs: totalDurationMs,
  resultCount: googleResult.results.length
}, '[ROUTE2] Pipeline completed');

// Emit WebSocket event to subscribers  ← HERE
wsManager.publishToChannel('search', requestId, undefined, {
  type: 'status',
  requestId,
  status: 'completed'
});

return response;
```

## WebSocket Payload

**Minimal payload sent to clients:**
```json
{
  "type": "status",
  "requestId": "req-1768594979161-0c07ngbg7",
  "status": "completed"
}
```

## Expected Logs

### 1. Pipeline Completion (existing)
```json
{
  "level": "info",
  "requestId": "req-1768594979161-0c07ngbg7",
  "pipelineVersion": "route2",
  "event": "pipeline_completed",
  "durationMs": 6382,
  "resultCount": 4,
  "msg": "[ROUTE2] Pipeline completed"
}
```

### 2. WebSocket Publish (new)
```json
{
  "level": "info",
  "channel": "search",
  "requestId": "req-1768594979161-0c07ngbg7",
  "clientCount": 1,
  "msg": "websocket_published"
}
```

## Behavior

1. **With Subscribers:**
   - Payload sent to all connected WebSocket clients subscribed to this requestId
   - Log shows `clientCount: N` (N > 0)

2. **Without Subscribers:**
   - No message sent (publishToChannel returns early)
   - No `websocket_published` log emitted
   - Debug log shows "No subscribers for channel key"

## Flow

```
HTTP POST /api/v1/search?mode=async
  ↓
[ROUTE2] pipeline_completed (log)
  ↓
wsManager.publishToChannel('search', requestId, ...) (WS emit)
  ↓
websocket_published (log with clientCount)
  ↓
HTTP 200 response with requestId
  ↓
Client subscribes via WebSocket
  ↓
(If late subscriber: replay from state store)
```

## Client Receives

```typescript
// WebSocket message received by subscribed clients
{
  type: 'status',
  requestId: 'req-1768594979161-0c07ngbg7',
  status: 'completed'
}
```

Client can use this to:
- Update UI to show "Search complete"
- Stop loading indicators
- Trigger any post-search actions

## Testing

1. **Start server and client**
2. **Connect WebSocket** (client subscribes after HTTP response)
3. **Send search request:** `POST /api/v1/search?mode=async`
4. **Verify logs:**
   - `pipeline_completed` with resultCount
   - `websocket_published` with clientCount
5. **Verify client receives:** `{type:"status", status:"completed"}`
