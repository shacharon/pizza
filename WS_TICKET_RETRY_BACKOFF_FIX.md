# WS-Ticket Retry Backoff & Polling Fallback Fix

## Problem
- Frontend infinitely retries `/ws-ticket` requests when backend returns 503 (Redis unavailable)
- No backoff strategy for 503 errors - same retry logic as network errors
- No immediate fallback to polling mode when WebSocket unavailable
- Console spam from repeated connection attempts
- Poor UX when Redis temporarily unavailable

## Solution Overview
Implemented intelligent 503 handling with:
1. **Special backoff for 503 errors**: 2s → 4s → 8s → 16s → 30s (max 5 attempts)
2. **Immediate polling fallback**: Switch to HTTP polling on first 503
3. **Request mutex**: Prevent concurrent ws-ticket requests
4. **Quiet retries**: Minimal console logging when polling is active
5. **Automatic recovery**: Reconnect when Redis comes back online

## Changes Made

### 1. Backend Changes (Already Implemented)
See `REDIS_INITIALIZATION_FIX.md` for backend changes:
- Single RedisService with explicit initialization
- ws-ticket returns 503 + `Retry-After` header + error code `WS_TICKET_REDIS_UNAVAILABLE`
- Single shared Redis connection for all services

### 2. Frontend - WebSocket Connection (`ws-connection.ts`)

**New State Tracking**:
```typescript
private ticketRequestInFlight = false; // Mutex to prevent concurrent ws-ticket requests
private redis503Attempts = 0; // Track 503-specific retries
private pollingFallbackTriggered = false; // Track if we've switched to polling mode
```

**503-Specific Error Handling**:
- Detects 503 or error code `WS_TICKET_REDIS_UNAVAILABLE`
- Triggers `onTicketUnavailable()` callback on first 503 (immediate polling fallback)
- Uses separate retry counter (max 5 attempts vs 10 for network errors)
- Calls `scheduleReconnect503()` with slower backoff

**Request Mutex**:
```typescript
if (this.ticketRequestInFlight) {
  console.warn('[WS] ws-ticket request already in flight, skipping');
  return;
}

this.ticketRequestInFlight = true;
ticketResponse = await this.ticketProvider.requestTicket();
this.ticketRequestInFlight = false;
```

**New Backoff Method** (`scheduleReconnect503()`):
- Base delay: 2s (vs 250ms for network errors)
- Max delay: 30s (vs 5s for network errors)
- Formula: `2s * 2^(attempts-1)` with ±25% jitter
- Progression: 2s → 4s → 8s → 16s → 30s
- Max 5 attempts (vs 10 for network errors)
- Quieter logging (mentions polling is active)

### 3. Frontend - WS Types (`ws-types.ts`)

**New Callback**:
```typescript
export interface WSConnectionCallbacks {
  // ... existing callbacks
  onTicketUnavailable?: (requestId?: string) => void; // Called when ws-ticket returns 503
}
```

### 4. Frontend - WS Client Service (`ws-client.service.ts`)

**New Observable**:
```typescript
// Polling fallback signal (PUBLIC API)
// Emitted when ws-ticket returns 503 (Redis unavailable)
// Triggers immediate switch to polling mode for active searches
private ticketUnavailableSubject = new Subject<void>();
readonly ticketUnavailable$ = this.ticketUnavailableSubject.asObservable();
```

**Callback Wiring**:
```typescript
const connectionCallbacks: WSConnectionCallbacks = {
  // ... existing callbacks
  onTicketUnavailable: () => this.ticketUnavailableSubject.next()
};
```

### 5. Frontend - Search WS Handler (`search-ws.facade.ts`)

**Expose Observable**:
```typescript
// Ticket unavailable stream (for polling fallback)
readonly ticketUnavailable$ = this.wsClient.ticketUnavailable$;
```

### 6. Frontend - Search Facade (`search.facade.ts`)

**Subscribe to Ticket Unavailable**:
```typescript
// Subscribe to ticket unavailable events (503 Redis unavailable)
// Triggers immediate polling fallback without waiting for deferred polling
this.wsHandler.ticketUnavailable$.subscribe(() => {
  const requestId = this.currentRequestId();
  const query = this.query();
  
  if (requestId && query) {
    safeLog('SearchFacade', 'ws-ticket unavailable - starting immediate polling fallback', { requestId });
    
    // Cancel deferred polling start and start immediately
    this.apiHandler.cancelPollingStart();
    
    // Start polling immediately (no delay)
    this.apiHandler.startPolling(
      requestId,
      query,
      (response) => this.handleSearchResponse(response, query),
      (error) => { /* error handler */ },
      undefined, // onProgress
      { delayMs: 0, fastIntervalBase: 500, slowInterval: 2000, backoffAt: 10000, maxDuration: 30000, fastJitter: 200 }
    );
  }
});
```

## Behavior Changes

### Before Fix
1. User searches → Backend starts processing
2. Frontend tries to connect WebSocket
3. ws-ticket returns 503 (Redis initializing)
4. Frontend retries with **normal backoff** (250ms, 500ms, 1s, 2s...)
5. Multiple 503s in rapid succession (log spam)
6. **No polling fallback** - user waits for WebSocket
7. Results delayed or never arrive

### After Fix
1. User searches → Backend starts processing
2. Frontend tries to connect WebSocket
3. ws-ticket returns 503 (Redis initializing)
4. **Immediate polling fallback** (results arrive via HTTP)
5. Frontend retries ws-ticket with **slower backoff** (2s, 4s, 8s...)
6. **Mutex prevents concurrent ws-ticket requests**
7. Quiet retries in background (no log spam)
8. When Redis ready → WebSocket connects automatically
9. User gets results quickly via polling, WebSocket reconnects later

## Retry Comparison

### Network Errors (status=0)
- Max attempts: 10
- Base delay: 250ms
- Max delay: 5s
- Progression: 250ms → 500ms → 1s → 2s → 4s → 5s → 5s...
- Behavior: Normal reconnection logic
- Logging: Full logging (connection critical)

### 503 Errors (Redis unavailable)
- Max attempts: 5
- Base delay: 2s
- Max delay: 30s
- Progression: 2s → 4s → 8s → 16s → 30s
- Behavior: **Immediate polling fallback on first attempt**
- Logging: Quiet logging (polling handles results)

## Console Output Examples

### First 503 (Immediate Fallback)
```
[WS] ws-ticket unavailable (503) - Redis not ready { attempt: 1, maxAttempts: 5, retryAfter: "2s" }
[WS] Switched to polling mode (ws-ticket unavailable)
[SearchFacade] ws-ticket unavailable - starting immediate polling fallback { requestId: "req-123" }
[SearchApiHandler] Starting polling { requestId: "req-123", resultUrl: "/api/v1/search/req-123/result" }
[WS] ws-ticket retry in 2s (attempt 1/5, polling active)
```

### Subsequent Retries (Background)
```
[WS] ws-ticket retry in 4s (attempt 2/5, polling active)
[WS] ws-ticket retry in 8s (attempt 3/5, polling active)
```

### Max Attempts Reached
```
[WS] Max 503 retry attempts reached - stopping ws-ticket requests { attempts: 5 }
```

### Successful Reconnection
```
[WS] Ticket OK, connecting...
[WS] Connected
```

## User Experience

### Scenario: Redis Temporarily Unavailable

**Before Fix**:
- ❌ User submits search
- ❌ Loading spinner indefinitely (waiting for WebSocket)
- ❌ Console spam: repeated 503 errors
- ❌ No results until Redis recovers

**After Fix**:
- ✅ User submits search
- ✅ Results appear within ~1s via HTTP polling
- ✅ Minimal console logging (quiet retries)
- ✅ WebSocket reconnects automatically when Redis ready
- ✅ Future searches use WebSocket (faster)

### Scenario: Redis Permanently Down

**Before Fix**:
- ❌ 10+ retry attempts over ~30s
- ❌ Console spam throughout
- ❌ Search eventually times out

**After Fix**:
- ✅ Results arrive via polling immediately
- ✅ Only 5 retry attempts over ~60s (2+4+8+16+30)
- ✅ Quiet retries (no spam)
- ✅ Stops retrying after 5 attempts
- ✅ Polling continues to work for all searches

## Testing

### Manual Test - Redis Unavailable
```bash
# Terminal 1: Start backend without Redis
cd server
REDIS_URL=redis://localhost:9999 npm start

# Terminal 2: Start frontend
cd llm-angular
npm start

# Browser:
1. Open http://localhost:4200
2. Submit search query
3. Observe:
   - Results appear via polling (~1s)
   - Console shows one 503 warning
   - Console shows "Switched to polling mode"
   - Console shows "ws-ticket retry in 2s (polling active)"
   - No infinite retries
   - No console spam
```

### Manual Test - Redis Comes Online
```bash
# Terminal 1: Start backend without Redis
cd server
REDIS_URL=redis://localhost:9999 npm start

# Terminal 2: Start frontend
cd llm-angular
npm start

# Terminal 3: After search submitted, start Redis
docker run -p 6379:6379 redis

# Browser:
1. Submit search (uses polling)
2. Wait 2-4 seconds (ws-ticket retry)
3. Observe:
   - Console shows "Ticket OK, connecting..."
   - Console shows "[WS] Connected"
   - Next search uses WebSocket (faster)
```

### Automated Test Assertions
```typescript
describe('WS-Ticket 503 Handling', () => {
  it('should not retry more than 5 times for 503 errors', async () => {
    // Mock ws-ticket to return 503
    mockAuthApi.requestWSTicket.mockRejectedValue({
      status: 503,
      error: { code: 'WS_TICKET_REDIS_UNAVAILABLE', retryAfter: 2 }
    });

    await wsConnection.connect();
    await wait(65000); // Wait for all retries

    // Should have max 5 attempts
    expect(mockAuthApi.requestWSTicket).toHaveBeenCalledTimes(5);
  });

  it('should trigger polling fallback on first 503', async () => {
    const onTicketUnavailable = jest.fn();
    
    // Mock ws-ticket to return 503
    mockAuthApi.requestWSTicket.mockRejectedValue({
      status: 503,
      error: { code: 'WS_TICKET_REDIS_UNAVAILABLE' }
    });

    const wsConnection = new WSConnection(config, ticketProvider, {
      ...callbacks,
      onTicketUnavailable
    });

    await wsConnection.connect();

    // Should trigger fallback immediately
    expect(onTicketUnavailable).toHaveBeenCalledTimes(1);
  });

  it('should not make concurrent ws-ticket requests', async () => {
    let resolveTicket: any;
    const ticketPromise = new Promise(resolve => { resolveTicket = resolve; });
    
    mockAuthApi.requestWSTicket.mockReturnValue(ticketPromise);

    // Start two concurrent connects
    const connect1 = wsConnection.connect();
    const connect2 = wsConnection.connect();

    // Resolve ticket
    resolveTicket({ ticket: 'test-ticket' });
    
    await Promise.all([connect1, connect2]);

    // Should only make one request
    expect(mockAuthApi.requestWSTicket).toHaveBeenCalledTimes(1);
  });
});
```

## Key Benefits

1. **No More Infinite Retries**: Max 5 attempts for 503, stops gracefully
2. **Immediate Results**: Polling fallback ensures user gets results even if WebSocket unavailable
3. **No Console Spam**: Quiet retries when polling is active
4. **Proper Backoff**: Slower retry cadence (2s-30s) respects backend recovery time
5. **Request Mutex**: Prevents concurrent ws-ticket requests (no race conditions)
6. **Automatic Recovery**: Reconnects when Redis becomes available
7. **Better UX**: User unaware of backend issues, results always arrive

## Files Modified

### Frontend
1. `llm-angular/src/app/core/services/ws/ws-connection.ts` - Special 503 handling + backoff + mutex
2. `llm-angular/src/app/core/services/ws/ws-types.ts` - Added `onTicketUnavailable` callback
3. `llm-angular/src/app/core/services/ws-client.service.ts` - Exposed `ticketUnavailable$` observable
4. `llm-angular/src/app/facades/search-ws.facade.ts` - Exposed `ticketUnavailable$` to facade
5. `llm-angular/src/app/facades/search.facade.ts` - Subscribe to `ticketUnavailable$` and trigger polling

### Backend (See REDIS_INITIALIZATION_FIX.md)
1. `server/src/lib/redis/redis.service.ts` - NEW shared Redis service
2. `server/src/server.ts` - Initialize Redis on startup
3. `server/src/controllers/auth/auth.controller.ts` - Use RedisService + Retry-After header
4. `server/src/services/search/job-store/index.ts` - Use shared client
5. `server/src/infra/websocket/websocket-manager.ts` - Use shared client

## Future Improvements
1. Add metrics for 503 retry counts (track Redis availability)
2. Add circuit breaker pattern (stop retrying if Redis consistently down)
3. Consider showing subtle UI indicator when in polling mode
4. Add e2e tests for Redis failure scenarios
5. Monitor Retry-After header and use dynamic backoff
