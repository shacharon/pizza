# Redis Initialization Fix - /ws-ticket 503 Spam Resolution

## Problem
- Repeated `/ws-ticket` 503 errors with "Redis client not available" spam in logs
- Redis initialization was lazy and happened at different times for different services
- ws-ticket endpoint depended on JobStore's Redis initialization timing
- No coordination between services using Redis

## Solution Overview
Created a centralized `RedisService` singleton that:
1. Initializes Redis explicitly on server startup (before routes)
2. Provides a single shared Redis connection for all services
3. Offers `readyPromise()` for services that require Redis
4. Enables graceful degradation with clear error codes

## Changes Made

### 1. New RedisService (`lib/redis/redis.service.ts`)
**Purpose**: Singleton manager for shared Redis client

**Key Features**:
- `initialize(options)` - Explicit initialization on server startup
- `getClientOrNull()` - Non-blocking access to client
- `isReady()` - Check if Redis is ready
- `readyPromise(timeoutMs)` - Wait for Redis with timeout (default 300ms)
- `close()` - Graceful shutdown

**Logging Events**:
- `redis_connect_start` - Connection attempt started
- `redis_connect_ok` - Connection successful
- `redis_connect_fail` - Connection failed (non-fatal, services degrade)
- `redis_error` - Runtime error (non-fatal)
- `redis_ready` - Client ready

### 2. Server Startup (`server.ts`)
**Changes**:
- Added Redis initialization **before** `app.listen()`
- Ensures Redis is ready before routes start accepting requests
- Added Redis cleanup in shutdown handler

**Code**:
```typescript
// Phase 1: Initialize Redis (before routes, before WebSocket)
import { RedisService } from './lib/redis/redis.service.js';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
await RedisService.initialize({
  url: redisUrl,
  maxRetriesPerRequest: 2,
  connectTimeout: 2000,
  commandTimeout: 2000,
  enableOfflineQueue: false
});
```

### 3. WS-Ticket Handler (`controllers/auth/auth.controller.ts`)
**Changes**:
- Uses `RedisService.readyPromise(300)` to wait up to 300ms for Redis
- Returns 503 with **stable error code**: `WS_TICKET_REDIS_UNAVAILABLE`
- Adds `Retry-After: 2` header (client should retry in 2 seconds)
- Logs once per requestId (no spam)

**Error Response**:
```json
{
  "error": "SERVICE_UNAVAILABLE",
  "code": "WS_TICKET_REDIS_UNAVAILABLE",
  "message": "Ticket service temporarily unavailable, retry in 2 seconds",
  "traceId": "...",
  "retryAfter": 2
}
```

**Headers**:
- `Retry-After: 2` (standard HTTP retry header)

### 4. JobStore (`services/search/job-store/index.ts`)
**Changes**:
- Uses `RedisService.getClientOrNull()` instead of creating own connection
- Shares the same Redis client initialized by server.ts
- Maintains existing fallback behavior (InMemory in development)

### 5. WebSocketManager (`infra/websocket/websocket-manager.ts`)
**Changes**:
- Uses `RedisService.getClientOrNull()` instead of `new Redis()`
- Shares the same Redis client
- Updated logging to indicate use of shared client

### 6. Google Cache Manager (`services/search/route2/stages/google-maps/cache-manager.ts`)
**Changes**:
- Uses `RedisService.getClientOrNull()` instead of `getRedisClient()`
- Shares the same Redis client
- Non-fatal degradation if Redis unavailable

## Behavior Changes

### Before Fix
1. Server starts → routes become available immediately
2. Client requests `/ws-ticket` → 503 (Redis not initialized)
3. Redis initializes lazily (JobStore first use)
4. Multiple 503 errors logged repeatedly
5. No client guidance on when to retry

### After Fix
1. Server starts → Redis initialization (explicit, ~2000ms timeout)
2. Routes become available → Redis already ready or failed
3. Client requests `/ws-ticket`:
   - If Redis ready → Success (no delay)
   - If Redis initializing → Waits 300ms → Success or 503
   - If Redis failed → Immediate 503 with Retry-After header
4. Single log entry per request (no spam)
5. Client knows to retry after 2 seconds

## Error Code Stability

### Old Error Code
```json
{
  "error": "WS_REDIS_UNAVAILABLE",
  "code": "WS_REDIS_UNAVAILABLE"
}
```

### New Error Code (Breaking Change - Stable)
```json
{
  "error": "SERVICE_UNAVAILABLE",
  "code": "WS_TICKET_REDIS_UNAVAILABLE"
}
```

**Note**: Added `retryAfter` field and `Retry-After` header for client guidance.

## Testing

### Unit Test Coverage Needed
1. **RedisService.readyPromise()** timeout behavior
2. `/ws-ticket` returns 503 when Redis unavailable
3. `Retry-After` header is present in 503 response
4. No server crash when Redis unavailable
5. Shared client used by all services

### Integration Test
```bash
# Start server without Redis
REDIS_URL=redis://localhost:9999 npm start

# Expected:
# - Server starts successfully
# - Log: "redis_connect_fail"
# - POST /ws-ticket → 503 + Retry-After: 2
# - No repeated error spam
```

## Deployment Notes

### Environment Variables
- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379`)
- No new environment variables added

### Backward Compatibility
- ✅ All existing log keys preserved
- ✅ Services maintain fallback behavior (InMemory in dev)
- ✅ Production requirements unchanged (Redis required for scale)
- ⚠️  Error code changed: `WS_REDIS_UNAVAILABLE` → `WS_TICKET_REDIS_UNAVAILABLE`
- ✅ Added `Retry-After` header (non-breaking addition)

### Migration Path
1. Deploy new code
2. Server will initialize Redis on startup
3. Monitor logs for `redis_connect_ok` or `redis_connect_fail`
4. Verify `/ws-ticket` 503 spam eliminated
5. Update clients to use `Retry-After` header (optional, recommended)

## Log Event Reference

### Successful Startup
```
[BOOT] Loaded .env
redis_connect_start - redisUrl: redis://localhost:6379
redis_connect_ok - durationMs: 145
Server listening on http://localhost:3000
WebSocketManager: Using shared Redis client
[JobStore] ✓ Redis store initialized with shared client
[GoogleMapsCache] ✓ Cache service active with shared Redis client
```

### Redis Unavailable (Graceful Degradation)
```
redis_connect_start - redisUrl: redis://localhost:6379
redis_connect_fail - error: "Connection timeout after 2000ms", durationMs: 2003
Server listening on http://localhost:3000
WebSocketManager: Redis client not available (may still be initializing)
[JobStore] Falling back to InMemory (development only)
[GoogleMapsCache] Redis unavailable, caching disabled (non-fatal)
```

### ws-ticket Request (Redis Unavailable)
```
[WSTicket] Redis not available after timeout - traceId: abc123, sessionId: sess_xxx
POST /ws-ticket - 503 - 5ms
```

## Key Benefits

1. **No More 503 Spam**: Redis initialization happens once at startup
2. **Clear Error Codes**: `WS_TICKET_REDIS_UNAVAILABLE` with `Retry-After` header
3. **Single Shared Connection**: All services use one Redis client
4. **Explicit Initialization**: Clear startup sequence, no race conditions
5. **Graceful Degradation**: Services fail gracefully when Redis unavailable
6. **Better Client Experience**: Retry-After header guides clients
7. **Simplified Debugging**: Clear log events for Redis lifecycle

## Files Modified
1. `lib/redis/redis.service.ts` - NEW shared Redis service
2. `server.ts` - Initialize Redis on startup, close on shutdown
3. `controllers/auth/auth.controller.ts` - Use RedisService, add Retry-After
4. `services/search/job-store/index.ts` - Use shared client
5. `infra/websocket/websocket-manager.ts` - Use shared client
6. `services/search/route2/stages/google-maps/cache-manager.ts` - Use shared client

## Future Improvements
1. Add health check endpoint that includes Redis status
2. Add metrics for Redis connection uptime
3. Consider circuit breaker pattern for repeated Redis failures
4. Add Redis connection pooling if needed for high load
