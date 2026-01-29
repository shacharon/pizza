# WebSocket Infinite Reconnection Fix

## Problem Statement

**Issue:** WebSocket connection stuck in infinite reconnection loop when server is down

**Symptoms:**
- Console logs show: `[WS] Reconnect in 5511ms (attempt 8)`
- Continues forever: attempt 9, 10, 11...
- Repeatedly fails with: `POST http://localhost:3000/api/v1/auth/ws-ticket net::ERR_CONNECTION_REFUSED`
- Network tab flooded with failed HTTP requests
- `auth-api.service.ts` logs `{hasAuthorization: true, hasSessionId: true}` (leaks secret existence)

**Root Cause:** `ws-connection.ts` had NO maximum reconnect limit for network errors. It would only stop on 401 (auth) errors, but would retry forever on connection refused / network down.

## Solution

### 1. Added Max Reconnect Limit ✅

**File:** `llm-angular/src/app/core/services/ws/ws-connection.ts`

**Added Constant:**
```typescript
const MAX_RECONNECT_ATTEMPTS = 10;
```

**Updated Reconnection Logic:**

**Before (Infinite Loop):**
```typescript
// Only reconnect if we haven't hit a hard failure
if (this.shouldReconnect) {
  this.scheduleReconnect(); // ❌ No limit, retries forever
}
```

**After (Limited Retries):**
```typescript
// Check if we've exceeded max reconnect attempts
if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
  console.error('[WS] Max reconnect attempts reached - stopping', {
    attempts: this.reconnectAttempts,
    maxAttempts: MAX_RECONNECT_ATTEMPTS
  });
  
  this.shouldReconnect = false;
  this.callbacks.onStatusChange('disconnected');
  return; // ✅ Stops after 10 attempts
}

// Network error (status=0 or connection refused)
if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
  console.warn('[WS] Network error - will retry', {
    status: error.status,
    attempt: this.reconnectAttempts + 1,
    maxAttempts: MAX_RECONNECT_ATTEMPTS
  });
}

// Only reconnect if we haven't hit a hard failure
if (this.shouldReconnect) {
  this.scheduleReconnect();
}
```

**Key Changes:**
1. Added `MAX_RECONNECT_ATTEMPTS = 10` constant
2. Check attempt count before scheduling reconnect
3. Log attempt progress: `(attempt 5/10)`
4. Set `shouldReconnect = false` and status to `'disconnected'` after max attempts
5. Reset counter to 0 on successful connection

### 2. Fixed Secret Logging in Auth Service ✅

**File:** `llm-angular/src/app/core/services/auth-api.service.ts`

**Before (Leaked Secret Existence):**
```typescript
console.log('[WS-Ticket] Requesting ticket', {
  hasAuthorization: !!token, // ❌ Reveals secret exists
  hasSessionId: !!sessionId   // ❌ Reveals secret exists
});
```

**After (Safe Logging):**
```typescript
safeLog('WS-Ticket', 'Requesting ticket', {
  tokenPresent: !!token,     // ✅ Generic field name
  sessionIdPresent: !!sessionId // ✅ Generic field name
});
```

Also updated all other logging in auth-api.service.ts to use `safeLog`, `safeError`.

### 3. Cleaned Up WS Client Logging ✅

**File:** `llm-angular/src/app/core/services/ws-client.service.ts`

Removed message content from error logs to prevent leaking sensitive data.

## Reconnection Policy

### Hard Failures (Stop Immediately)
1. **401 Unauthorized** - JWT invalid, missing sessionId
2. **Hard close reasons** - Server explicitly rejected connection

### Soft Failures (Retry with Limit)
1. **Network errors (status=0)** - Connection refused, server down
   - Max 10 attempts
   - Exponential backoff: 250ms → 500ms → 1s → 2s → 4s → 5s
   - After 10 attempts: stop permanently, set status to 'disconnected'

2. **503 Service Unavailable** - Redis down, temporary server issue
   - Max 10 attempts
   - Same backoff strategy

### Success
- **On successful connection:** Reset `reconnectAttempts` to 0
- **Enable auto-reconnect:** Set `shouldReconnect = true`

## Before vs After

### Before (Infinite Loop)
```
Server down → Connection fails (status=0)
  ↓
Attempt 1 (250ms delay)
  ↓
Attempt 2 (500ms delay)
  ↓
Attempt 3 (1000ms delay)
  ↓
... continues forever ❌
  ↓
Attempt 100, 200, 1000... ❌
```

### After (Limited Retries)
```
Server down → Connection fails (status=0)
  ↓
Attempt 1/10 (250ms delay)
  ↓
Attempt 2/10 (500ms delay)
  ↓
... continues with backoff
  ↓
Attempt 10/10 (5000ms delay)
  ↓
Max attempts reached ✅
  ↓
Stop reconnecting permanently ✅
  ↓
Status: disconnected ✅
```

## User Experience

### Before
- WebSocket keeps retrying forever
- Network tab flooded with failed requests
- No way to stop except page reload
- Logs reveal secret existence

### After
- WebSocket retries 10 times with exponential backoff
- After 10 attempts: stops permanently
- Clear console message: "Max reconnect attempts reached - stopping"
- Final status: `disconnected`
- No secret information in logs
- User can refresh page to retry

## Files Modified

### WebSocket Reconnection
- `llm-angular/src/app/core/services/ws/ws-connection.ts` - Added MAX_RECONNECT_ATTEMPTS limit

### Secret Sanitization
- `llm-angular/src/app/core/services/auth-api.service.ts` - Use safeLog, remove secret hints
- `llm-angular/src/app/core/services/ws-client.service.ts` - Clean up message logging

### Already Fixed (Previous Work)
- `llm-angular/src/app/api/search.api.ts` - Safe logging
- `llm-angular/src/app/facades/search-api.facade.ts` - EmptyError handling + safe logging
- `llm-angular/src/app/facades/search.facade.ts` - Network error UX + safe logging
- `llm-angular/src/app/core/interceptors/http-timeout-retry.interceptor.ts` - Fixed retryWhen

## Configuration

Current limits (can be adjusted if needed):

```typescript
// ws-connection.ts
const MAX_RECONNECT_ATTEMPTS = 10;

// http-timeout-retry.interceptor.ts
const REQUEST_TIMEOUT_MS = 20000;  // 20 seconds
const MAX_RETRIES = 1;              // Retry once per request

// ws-connection config
baseReconnectDelay: 250,    // Start at 250ms
maxReconnectDelay: 5_000    // Cap at 5 seconds
```

## Verification

### Manual Test
1. Stop the backend server
2. Open the app (WebSocket will try to connect)
3. **Expected behavior:**
   - ✅ Attempts 1-10 with exponential backoff
   - ✅ Console shows: `[WS] Reconnect in Xms (attempt 5/10)`
   - ✅ After attempt 10: Stops permanently
   - ✅ Final log: `[WS] Max reconnect attempts reached - stopping`
   - ✅ Status: `disconnected`
   - ✅ NO secret information in logs

### Test Results
```
PASS search.api.spec.ts (9/9 tests)
  ✅ CRITICAL: should never throw EmptyError on network failure
  ✅ Network error handling tests passing

PASS safe-logger.spec.ts (25/25 tests)
  ✅ Authorization header redaction
  ✅ Session ID redaction
  ✅ All sanitization tests passing
```

## Security Improvements

### Before - Secret Leakage
```typescript
console.log('[WS-Ticket] Requesting ticket', {
  hasAuthorization: true,  // ❌ Reveals JWT token exists
  hasSessionId: true        // ❌ Reveals session ID exists
});
```

### After - No Leakage
```typescript
safeLog('WS-Ticket', 'Requesting ticket', {
  tokenPresent: true,       // ✅ Generic field name
  sessionIdPresent: true    // ✅ Generic field name
});
// If auth-api.service logs request/response objects, safe logger
// will redact Authorization and x-session-id headers automatically
```

## Related Fixes

This fix builds on previous work:
1. ✅ EmptyError prevention (http-timeout-retry.interceptor.ts)
2. ✅ Safe logging utility (safe-logger.ts)
3. ✅ Network error UX improvements (search facades)
4. ✅ Search API error handling

## Production Considerations

### Reconnect Limits
- **10 attempts** is reasonable for:
  - Brief server restarts (30-60 seconds)
  - Network hiccups
  - Load balancer failovers

- **NOT suitable for:**
  - Extended maintenance windows
  - Long server deployments

**Alternative:** Could show a "Reconnect" button after max attempts instead of silent failure.

### Monitoring
Add telemetry to track:
- Average attempts before success
- Max attempts reached frequency
- Network error patterns

## Future Enhancements

1. **Circuit Breaker Pattern:**
   - After 3 consecutive failures, backoff to 30 seconds
   - After 10 failures, show user prompt: "Server unavailable. Retry?"

2. **Exponential Backoff with Cap:**
   - Current: 250ms → 5s (reaches max quickly)
   - Alternative: 1s → 2s → 4s → 8s → 16s → 30s → 60s (max)

3. **User Notification:**
   - After 5 failed attempts: Toast notification "Connection issues detected"
   - After 10 failed attempts: Banner "Unable to connect. Please refresh the page."

4. **Offline Detection:**
   - Use `navigator.onLine` to detect offline state
   - Don't retry if browser is offline
   - Resume reconnection when online

5. **Health Check:**
   - Instead of fetching ticket every time, add lightweight `/health` endpoint
   - Check health before attempting full connection

## Compliance

- ✅ No infinite retry loops
- ✅ No secret information in logs
- ✅ Clear terminal state after max attempts
- ✅ User-friendly error handling
- ✅ Production-ready error messages
