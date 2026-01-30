# P0 Fix: Cache Service Initialization Race Condition

## Problem
The Google Maps cache service was consistently bypassed with "cache_service_not_available" errors, even though Redis was properly initialized and available:

**Logs showing the issue:**
```json
{"time":"19:52:36.250Z","event":"CACHE_BYPASS","providerMethod":"textSearch","reason":"cache_service_not_available"}
```

But Redis was working:
```json
{"time":"19:56:22.283Z","event":"redis_ready","msg":"[RedisService] Redis client ready"}
```

## Root Cause

**Race Condition in Initialization Order:**

The cache-manager.ts module was auto-initializing on module load (line 169-174):
```typescript
// Initialize cache on module load (non-blocking)
initializeCacheService().catch((err) => {
  logger.warn({ ... });
});
```

This caused a race condition:
1. **Cache tries to init** (when module is imported) → Redis client not ready yet
2. **Cache initialization fails** → "Shared Redis client not available (may still be initializing)"
3. **Redis starts connecting** (in server.ts)
4. **Redis becomes ready** (too late - cache already gave up)

**Timeline from logs:**
```
19:56:21.184 - [GoogleMapsCache] Attempting Redis connection
19:56:21.189 - [GoogleMapsCache] Redis unavailable, caching disabled  ❌
19:56:22.189 - [RedisService] Starting Redis connection
19:56:22.283 - [RedisService] Redis client ready                      ✅ (too late!)
```

## Solution

### 1. Removed Auto-Initialization on Module Load
**File:** `server/src/services/search/route2/stages/google-maps/cache-manager.ts`

**Before:**
```typescript
// Initialize cache on module load (non-blocking)
initializeCacheService().catch((err) => {
  logger.warn({ ... });
});
```

**After:**
```typescript
// DO NOT auto-initialize on module load - causes race condition with Redis startup
// Cache must be initialized explicitly in server.ts AFTER Redis is ready
```

### 2. Explicit Initialization in Boot Sequence
**File:** `server/src/server.ts`

**Added after Redis initialization:**
```typescript
try {
  await RedisService.start({ ... });
} catch (error) {
  // Handle Redis errors
}

// Phase 1.5: Initialize Google Maps Cache Service (AFTER Redis is ready)
// This ensures cache service doesn't race with Redis initialization
import { initializeCacheService } from './services/search/route2/stages/google-maps/cache-manager.js';
await initializeCacheService();
```

### 3. Improved Startup Logging
**Changed event name from multiple events to single `CACHE_STARTUP` event:**

**Before (inconsistent):**
- `CACHE_INIT_ATTEMPT`
- `CACHE_SERVICE_READY` / `CACHE_SERVICE_DISABLED`
- `cache_service_not_available`

**After (consistent):**
- `CACHE_STARTUP` with status flags

**Logs now clearly show cache status:**

```json
// Cache enabled successfully
{
  "event": "CACHE_STARTUP",
  "cacheEnabled": true,
  "hasRedis": true,
  "reason": "redis_available",
  "msg": "[GoogleMapsCache] ✓ Cache ENABLED with shared Redis client"
}

// Cache disabled (Redis unavailable)
{
  "event": "CACHE_STARTUP",
  "cacheEnabled": false,
  "hasRedis": false,
  "reason": "redis_unavailable",
  "msg": "[GoogleMapsCache] ✗ Cache DISABLED - Redis unavailable"
}

// Cache disabled (explicitly via env)
{
  "event": "CACHE_STARTUP",
  "cacheEnabled": false,
  "hasRedis": false,
  "reason": "explicitly_disabled",
  "msg": "[GoogleMapsCache] ✗ Cache DISABLED via ENABLE_GOOGLE_CACHE=false"
}
```

### 4. Simplified getCacheService()
**Removed lazy initialization logic:**

**Before:**
```typescript
export function getCacheService(): GoogleCacheService | null {
  // Fast path: Already initialized
  if (cacheService !== null || cacheInitialized) {
    return cacheService;
  }
  
  // Slow path: Not initialized yet (race condition on startup)
  // Attempt synchronous initialization (last resort)
  try {
    const redis = RedisService.getClientOrNull();
    // ... complex fallback logic
  } catch (err) {
    // ... error handling
  }
}
```

**After:**
```typescript
export function getCacheService(): GoogleCacheService | null {
  return cacheService;
}
```

Simpler and more predictable - cache is either initialized at startup or it's not.

### 5. Enhanced Cache Bypass Logging
**File:** `text-search.handler.ts`

**Only log warning if cache should be available but isn't:**
```typescript
if (!cache) {
  const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false';
  if (enableCache) {
    logger.warn({
      event: 'CACHE_BYPASS',
      reason: 'cache_not_initialized',
      note: 'Cache should have been initialized at startup'
    });
  }
  results = await fetchFn();
}
```

## Expected Behavior After Fix

### Startup Sequence (Correct Order)
```
1. [RedisService] Starting Redis connection
2. [RedisService] Redis client ready ✓
3. [GoogleMapsCache] ✓ Cache ENABLED with shared Redis client
4. Server listening on http://localhost:3000
```

### Cache Hit on Repeated Search
```
First search:
{"event":"textsearch_request_payload","finalTextQuery":"איטלקי בגדרה"}
{"servedFrom":"google_api","resultCount":20}  // Cache miss, fetch from Google

Second search (same query):
{"event":"textsearch_request_payload","finalTextQuery":"איטלקי בגדרה"}
{"servedFrom":"cache","resultCount":20}       // Cache hit! ✅
```

### No More CACHE_BYPASS Messages
```
❌ BEFORE: Every search logged "CACHE_BYPASS ... cache_service_not_available"
✅ AFTER:  No CACHE_BYPASS messages (cache working properly)
```

## Verification Checklist

✅ **Startup Logs:**
- `CACHE_STARTUP` event appears AFTER `redis_ready`
- Shows `cacheEnabled: true` if Redis available
- Shows `hasRedis: true` and `reason: "redis_available"`

✅ **No Race Condition:**
- Cache initialization happens in server.ts boot sequence
- Cache tries to connect AFTER Redis is ready
- No "Shared Redis client not available" errors

✅ **Cache Usage:**
- First identical search: `servedFrom: "google_api"`
- Second identical search: `servedFrom: "cache"`
- No CACHE_BYPASS messages for repeated searches

✅ **Explicit Disable Works:**
- `ENABLE_GOOGLE_CACHE=false` → Cache DISABLED at startup
- No cache bypass warnings (expected behavior)

## Files Changed
1. `server/src/services/search/route2/stages/google-maps/cache-manager.ts`
   - Removed auto-init on module load
   - Simplified getCacheService()
   - Improved CACHE_STARTUP logging

2. `server/src/server.ts`
   - Added explicit cache initialization after Redis
   - Phase 1.5 in boot sequence

3. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`
   - Enhanced cache bypass logging
   - Only warn if cache should be available

## Environment Variables
- `ENABLE_GOOGLE_CACHE` - Set to `false` to explicitly disable caching (default: enabled)
- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379`)

## Testing

### Test 1: Cache Enabled (Default)
```bash
# Start server (Redis running)
npm run dev

# Expected startup logs:
# ✓ [RedisService] Redis client ready
# ✓ [GoogleMapsCache] Cache ENABLED with shared Redis client

# Make identical searches
curl -X POST http://localhost:3000/api/search -d '{"query":"פיצה"}'
curl -X POST http://localhost:3000/api/search -d '{"query":"פיצה"}'

# Expected: Second search served from cache
# No CACHE_BYPASS messages
```

### Test 2: Cache Disabled (Explicit)
```bash
# Start server with cache disabled
ENABLE_GOOGLE_CACHE=false npm run dev

# Expected startup logs:
# ✓ [GoogleMapsCache] Cache DISABLED via ENABLE_GOOGLE_CACHE=false

# Make searches - should work without cache
# No CACHE_BYPASS warnings (expected behavior)
```

### Test 3: Redis Unavailable
```bash
# Stop Redis, start server
npm run dev

# Expected startup logs:
# ✗ [GoogleMapsCache] Cache DISABLED - Redis unavailable

# Server continues in degraded mode
# Searches work but always hit Google API
```

## Impact
- **Priority:** P0 (Cache completely broken)
- **Performance:** Fixed - Repeated searches now cached
- **Cost:** Reduced - Fewer Google API calls
- **Reliability:** Improved - No race conditions

## Rollback Plan
If issues occur:
```bash
git revert HEAD~2  # Revert cache init changes
```

The system will degrade gracefully - cache will be bypassed but searches still work.
