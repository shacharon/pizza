# WebSocket Ticket Robustness - Redis Not Ready at Boot

## Problem
At server boot, Redis may not be ready immediately, causing `POST /ws-ticket` to fail with 503. This blocks WebSocket connections, leaving the client in a retry loop and preventing fallback to polling-only mode.

## Solution

### Server: Return Explicit Error Code

**Modified:** `server/src/controllers/auth/auth.controller.ts`

When Redis is not available, return 503 with explicit error code:

```typescript
if (!redis) {
  logger.error(
    {
      traceId,
      sessionId
    },
    '[WSTicket] Redis client not available'
  );

  return res.status(503).json({
    error: 'SERVICE_UNAVAILABLE',
    code: 'WS_TICKET_REDIS_NOT_READY',  // Explicit error code
    message: 'WebSocket ticket service temporarily unavailable - Redis not ready',
    traceId
  });
}
```

**Error Code:** `WS_TICKET_REDIS_NOT_READY`  
**Status:** 503 (Service Unavailable)  
**Message:** "WebSocket ticket service temporarily unavailable - Redis not ready"

### Client: Retry with Exponential Backoff

**Modified:** `llm-angular/src/app/core/services/auth-api.service.ts`

Added `requestTicketWithRetry()` method that retries 503 errors with exponential backoff:

```typescript
/**
 * Request a one-time WebSocket ticket
 * - On 401: clears token and retries ONCE
 * - On 503 (Redis not ready): retries with backoff (200ms, 500ms, 1s) max 3 tries
 */
requestWSTicket(): Observable<WSTicketResponse> {
  return from(this.authService.getToken()).pipe(
    switchMap(token => this.requestTicketWithRetry(token, 0))
  );
}

/**
 * Internal: Request ticket with 503 retry logic
 * Retries up to 3 times with exponential backoff (200ms, 500ms, 1s)
 */
private requestTicketWithRetry(token: string, attemptNumber: number): Observable<WSTicketResponse> {
  // ... make request ...
  
  return this.http.post<WSTicketResponse>(...).pipe(
    catchError((error: unknown) => {
      // Handle 503: Redis not ready - retry with backoff
      if (error instanceof HttpErrorResponse && error.status === 503) {
        const errorCode = (error.error as any)?.code;
        
        // Check if this is a Redis not ready error
        if (errorCode === 'WS_TICKET_REDIS_NOT_READY' && attemptNumber < 3) {
          const backoffDelays = [200, 500, 1000]; // 200ms, 500ms, 1s
          const delay = backoffDelays[attemptNumber];

          // Wait for backoff delay, then retry
          return new Observable(observer => {
            const timeoutId = setTimeout(() => {
              this.requestTicketWithRetry(token, attemptNumber + 1).subscribe({
                next: (response) => observer.next(response),
                error: (err) => observer.error(err),
                complete: () => observer.complete()
              });
            }, delay);

            // Cleanup on unsubscribe
            return () => clearTimeout(timeoutId);
          });
        }
        // Max retries exceeded - error propagates to ws-connection.ts
      }
      // ... handle other errors ...
    })
  );
}
```

**Retry Strategy:**
- **Attempt 1:** Immediate request
- **Attempt 2:** After 200ms delay (if 503 with `WS_TICKET_REDIS_NOT_READY`)
- **Attempt 3:** After 500ms delay (if still 503)
- **Attempt 4:** After 1s delay (if still 503)
- **If all retries fail:** Error propagates to `ws-connection.ts`

### Client: Fall Back to Polling-Only Mode

**Modified:** `llm-angular/src/app/core/services/ws/ws-connection.ts`

If `auth-api.service.ts` exhausts all retries and still gets 503, treat it as a **hard failure** and stop reconnecting:

```typescript
// Classify ticket request failures
if (error?.status === 503) {
  // Hard failure: Redis not ready after retries (auth-api.service already retried 3 times with backoff)
  // Fall back to polling-only mode
  const errorCode = error?.error?.code;
  console.error('[WS] Hard failure - Redis not ready', { status: 503, code: errorCode });

  if (!this.hardFailureLogged) {
    console.error('[WS] Ticket request failed: 503 SERVICE_UNAVAILABLE (Redis not ready after retries) - falling back to polling-only mode');
    this.hardFailureLogged = true;
  }

  this.shouldReconnect = false;  // Stop reconnecting
  return;
}
```

**Behavior:**
- Stop all WebSocket reconnection attempts
- Application falls back to **polling-only mode** (HTTP long-polling)
- User experience: slower updates, but no complete failure

## Flow Diagram

```
Server Boot (Redis not ready)
├─ Client: POST /ws-ticket
├─ Server: Returns 503 { code: 'WS_TICKET_REDIS_NOT_READY' }
│
├─ auth-api.service: Detects 503 + WS_TICKET_REDIS_NOT_READY
├─ Wait 200ms
├─ Retry 1: POST /ws-ticket → 503
│
├─ Wait 500ms
├─ Retry 2: POST /ws-ticket → 503
│
├─ Wait 1s
├─ Retry 3: POST /ws-ticket → 503
│
├─ Max retries exceeded
├─ Error propagates to ws-connection.ts
│
├─ ws-connection: Detects 503 as hard failure
├─ Sets shouldReconnect = false
├─ Logs: "falling back to polling-only mode"
└─ Application continues with HTTP polling only ✅
```

## Retry Timeline (Worst Case)

```
t=0ms:    Attempt 1 (immediate) → 503
t=200ms:  Attempt 2 (after 200ms delay) → 503
t=700ms:  Attempt 3 (after 500ms delay) → 503
t=1700ms: Attempt 4 (after 1s delay) → 503
t=1700ms: Stop reconnecting, fall back to polling
```

**Total retry time:** ~1.7 seconds (worst case)

## Benefits

1. ✅ **Graceful degradation:** Application works with polling if WS unavailable
2. ✅ **Fast recovery:** If Redis becomes ready during retries, WS connects successfully
3. ✅ **No infinite retry loops:** Max 3 retries with backoff, then stops
4. ✅ **Clear error codes:** `WS_TICKET_REDIS_NOT_READY` makes debugging easy
5. ✅ **Better UX:** Polling-only mode is better than complete failure

## Testing

### Manual Test: Redis Down at Boot

1. **Start server WITHOUT Redis:**
   ```bash
   # Make sure Redis is not running
   docker stop redis  # or similar
   
   # Start server
   cd server
   npm start
   ```

2. **Open browser dev console:**
   ```
   Expected logs:
   [WS] Ticket OK, connecting...  (Attempt 1)
   [WS-Ticket] 503 Redis not ready, retrying with backoff { attemptNumber: 1, maxAttempts: 3, delayMs: 200 }
   [WS-Ticket] 503 Redis not ready, retrying with backoff { attemptNumber: 2, maxAttempts: 3, delayMs: 500 }
   [WS-Ticket] 503 Redis not ready, retrying with backoff { attemptNumber: 3, maxAttempts: 3, delayMs: 1000 }
   [WS-Ticket] 503 error - max retries exceeded or non-retryable
   [WS] Hard failure - Redis not ready { status: 503, code: 'WS_TICKET_REDIS_NOT_READY' }
   [WS] Ticket request failed: 503 SERVICE_UNAVAILABLE (Redis not ready after retries) - falling back to polling-only mode
   ```

3. **Verify behavior:**
   - WebSocket does NOT reconnect infinitely
   - Application continues to work with HTTP polling
   - No console errors after final retry

### Manual Test: Redis Becomes Ready During Retries

1. **Start server WITHOUT Redis:**
   ```bash
   docker stop redis
   npm start
   ```

2. **Open browser, wait for first retry:**
   ```
   [WS-Ticket] 503 Redis not ready, retrying with backoff { attemptNumber: 1, maxAttempts: 3, delayMs: 200 }
   ```

3. **Start Redis BEFORE retries exhaust:**
   ```bash
   docker start redis
   ```

4. **Expected behavior:**
   - One of the retries succeeds
   - WebSocket connects successfully
   - Log: `[WS] Connected`

## Error Code Reference

| Error Code | Status | Meaning | Client Action |
|------------|--------|---------|---------------|
| `MISSING_SESSION` | 401 | JWT missing sessionId | Hard failure - stop reconnect |
| `WS_TICKET_REDIS_NOT_READY` | 503 | Redis not available | Retry with backoff (max 3 tries) |
| Other 503 errors | 503 | Generic service unavailable | No retry (max attempts reached) |

## Files Modified

1. ✅ `server/src/controllers/auth/auth.controller.ts`
   - Changed error code from `WS_REDIS_UNAVAILABLE` to `WS_TICKET_REDIS_NOT_READY`
   - Updated error message

2. ✅ `llm-angular/src/app/core/services/auth-api.service.ts`
   - Added `requestTicketWithRetry()` method
   - Retry logic for 503 with exponential backoff (200ms, 500ms, 1s)
   - Max 3 retries

3. ✅ `llm-angular/src/app/core/services/ws/ws-connection.ts`
   - Treat 503 as hard failure (after retries exhausted)
   - Stop reconnecting to fall back to polling-only mode

## Summary

| Requirement | Status | Details |
|-------------|--------|---------|
| **Server: Return 503 with explicit error code** | ✅ | `WS_TICKET_REDIS_NOT_READY` |
| **Client: Retry with backoff** | ✅ | 200ms, 500ms, 1s (max 3 retries) |
| **Client: Fall back to polling** | ✅ | Hard failure after max retries, stops reconnect |

🎉 **Result:** WebSocket ticket endpoint is now robust when Redis is not ready at boot!
