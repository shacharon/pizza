# Photo Proxy & Cache Log Noise Reduction

**Date:** 2026-01-30  
**Goal:** Reduce log noise from PhotoProxy and Cache operations without losing debuggability

---

## Summary

Reduced high-frequency, low-value INFO logs from PhotoProxy and Cache operations by:
- Moving routine operations to **DEBUG** level with sampling
- Keeping **INFO** only for failures, slow operations, or anomalies
- Adding configurable sampling rate for DEBUG logs (5% default)

**Expected Impact:** ~60-80% reduction in INFO log volume for photo and cache operations.

---

## Changes

### 1. PhotoProxy Logging (photos.controller.ts)

#### Before ❌
```typescript
// Always logged at INFO (twice per request)
logger.info({ msg: '[PhotoProxy] Fetching photo from Google' });
// ... fetch ...
logger.info({ msg: '[PhotoProxy] Photo served successfully' });
```

#### After ✅
```typescript
// Single summary log with threshold-based level
const durationMs = Date.now() - startTime;
const sizeBytes = buffer.byteLength;
const isSlow = durationMs > 800;
const isLarge = sizeBytes > 250_000;

// INFO only for slow (>800ms) or large (>250KB), DEBUG otherwise
const logLevel = isSlow || isLarge ? 'info' : 'debug';
logger[logLevel]({
  requestId,
  photoRefHash,
  sizeBytes,
  durationMs,
  ...(isSlow && { slow: true }),
  ...(isLarge && { large: true }),
  msg: '[PhotoProxy] Photo served'
});
```

**Rules:**
- **DEBUG:** Fast (<800ms) + normal size (<250KB) photos
- **INFO:** Slow (>800ms) OR large (>250KB) photos
- **ERROR:** All failures (404, 5xx, timeouts, invalid content)
- **Timing:** Added `durationMs` to all logs
- **Consolidation:** Single summary log per request (not 2)

---

### 2. Cache Logging (googleCacheService.ts)

#### Before ❌
```typescript
// Always logged at INFO
this.logger.info({ event: 'L1_CACHE_HIT', key });
this.logger.info({ event: 'CACHE_MISS', key });
this.logger.info({ event: 'CACHE_STORE', key });
```

#### After ✅
```typescript
// DEBUG with sampling, INFO if slow
const durationMs = Date.now() - startTime;
const isSlow = durationMs > SLOW_THRESHOLDS.CACHE; // 200ms

if (isSlow || shouldSampleRandom(this.cacheSamplingRate)) {
  const logLevel = isSlow ? 'info' : 'debug';
  this.logger[logLevel]({
    event: 'CACHE_HIT',
    key,
    durationMs,
    ...(isSlow && { slow: true }),
    ...(!isSlow && { sampled: true })
  });
}
```

**Rules:**
- **DEBUG (with 5% sampling):** Fast (<200ms) cache operations
- **INFO:** Slow (>200ms) cache operations
- **WARN/ERROR:** All cache errors (Redis down, timeouts, corruption)
- **Sampling:** Configurable via `LOG_CACHE_SAMPLE_RATE` env var (0.0-1.0)
- **Timing:** Added `durationMs` to all cache operations

**Cache Events Affected:**
- `L1_CACHE_HIT` / `L1_CACHE_MISS`
- `CACHE_HIT` (L2/Redis)
- `CACHE_MISS`
- `CACHE_STORE`
- `INFLIGHT_DEDUPE`

---

### 3. Sampling Utility (sampling.ts)

Added cache-specific thresholds and sampling configuration:

```typescript
export const SLOW_THRESHOLDS = {
  // ... existing thresholds
  CACHE: 200,  // Cache operations: log at INFO if >200ms
  PHOTO: 800   // Photo proxy: log at INFO if >800ms
} as const;

export function getCacheSamplingRate(): number {
  const envRate = process.env.LOG_CACHE_SAMPLE_RATE;
  if (!envRate) return 0.05; // 5% default
  
  const parsed = parseFloat(envRate);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    return 0.05; // fallback to default if invalid
  }
  
  return parsed;
}
```

**Configuration:**
- Set `LOG_CACHE_SAMPLE_RATE=0.1` for 10% sampling
- Set `LOG_CACHE_SAMPLE_RATE=0` to disable sampling (only slow ops log)
- Set `LOG_CACHE_SAMPLE_RATE=1` to always log (for debugging)
- Default: `0.05` (5% sampling)

---

## Tests

### PhotoProxy Tests (7/7 passing) ✅

```bash
npx tsx --test src/controllers/photos/__tests__/photo-proxy-logging.test.ts
```

**Coverage:**
1. Fast + normal size → DEBUG
2. Slow (>800ms) → INFO
3. Large (>250KB) → INFO
4. Slow AND large → INFO
5. Edge case: exactly 800ms → DEBUG
6. Edge case: exactly 250KB → DEBUG
7. Errors always → ERROR

### Cache Sampling Tests (16/16 passing) ✅

```bash
npx tsx --test src/lib/cache/__tests__/cache-sampling.test.ts
```

**Coverage:**
1. SLOW_THRESHOLDS.CACHE = 200ms
2. Cache operations under/over/exactly 200ms
3. getCacheSamplingRate() default (5%)
4. getCacheSamplingRate() respects env var
5. Invalid env values fallback to default
6. Accept 0 (no sampling) and 1 (always sample)
7. Fast without sampling → no log
8. Fast with sampling → DEBUG
9. Slow always → INFO
10. Slow + sampled → INFO (not DEBUG)
11. SLOW_THRESHOLDS.PHOTO = 800ms

---

## Files Changed

### Modified (3 files):
1. **server/src/controllers/photos/photos.controller.ts**
   - Added timing tracking (`startTime`, `durationMs`)
   - Consolidated to single summary log per request
   - Threshold-based log level (slow >800ms, large >250KB)

2. **server/src/lib/cache/googleCacheService.ts**
   - Added sampling with `getCacheSamplingRate()`
   - Added timing tracking for L1/L2 operations
   - Threshold-based log level (slow >200ms)
   - DEBUG with sampling for routine operations

3. **server/src/lib/logging/sampling.ts**
   - Added `SLOW_THRESHOLDS.CACHE` (200ms)
   - Added `SLOW_THRESHOLDS.PHOTO` (800ms)
   - Added `getCacheSamplingRate()` function

### New (2 test files):
4. **server/src/controllers/photos/__tests__/photo-proxy-logging.test.ts**
   - 7 tests covering PhotoProxy thresholds and edge cases

5. **server/src/lib/cache/__tests__/cache-sampling.test.ts**
   - 16 tests covering cache thresholds, sampling, and log level decisions

---

## Verification

### 1. PhotoProxy (Before/After)

**Before:**
```
[INFO] [PhotoProxy] Fetching photo from Google
[INFO] [PhotoProxy] Photo served successfully
```
2 INFO logs per photo request × 100 photos = **200 INFO logs**

**After (typical fast photo):**
```
[DEBUG] [PhotoProxy] Photo served (durationMs=450, sizeBytes=48000)
```
1 DEBUG log per photo request × 100 photos = **0 INFO logs** (100% reduction)

**After (slow photo):**
```
[INFO] [PhotoProxy] Photo served (durationMs=950, sizeBytes=48000, slow=true)
```
Only slow/large photos log at INFO (estimated 5-10% of requests)

### 2. Cache (Before/After)

**Before:**
```
[INFO] L1_CACHE_MISS
[INFO] CACHE_MISS
[INFO] CACHE_STORE
```
3 INFO logs per cache miss × 100 misses = **300 INFO logs**

**After (typical fast cache miss):**
```
[DEBUG] L1_CACHE_MISS (sampled=true)  // 5% chance
[DEBUG] CACHE_MISS (sampled=true)      // 5% chance
[DEBUG] CACHE_STORE (sampled=true)     // 5% chance
```
Sampled at 5% = **~15 DEBUG logs** (95% reduction in log volume)

**After (slow cache operation):**
```
[INFO] CACHE_HIT (durationMs=250, slow=true)
```
Slow operations always log at INFO for visibility

---

## Expected Impact

### Log Volume Reduction
- **PhotoProxy:** ~90% reduction (only slow/large/errors at INFO)
- **Cache:** ~95% reduction with default 5% sampling
- **Overall:** ~60-80% reduction in INFO log volume for these subsystems

### Observability Preserved
- ✅ All errors/failures still log at ERROR/WARN
- ✅ Slow operations (>threshold) always visible at INFO
- ✅ Anomalies (large payloads, timeouts) always visible at INFO
- ✅ 5% sampling provides statistical visibility for routine operations
- ✅ Sampling rate configurable for increased visibility when debugging

---

## Configuration

### Environment Variables

```bash
# Cache sampling rate (0.0-1.0, default: 0.05 = 5%)
LOG_CACHE_SAMPLE_RATE=0.05

# For debugging cache issues, increase sampling:
LOG_CACHE_SAMPLE_RATE=0.5  # 50% sampling

# For production, reduce sampling:
LOG_CACHE_SAMPLE_RATE=0.01  # 1% sampling

# Disable sampling (only slow ops and errors log):
LOG_CACHE_SAMPLE_RATE=0
```

---

## Testing Locally

### 1. Run tests:
```bash
cd server
npx tsx --test src/controllers/photos/__tests__/photo-proxy-logging.test.ts
npx tsx --test src/lib/cache/__tests__/cache-sampling.test.ts
```

### 2. Test PhotoProxy:
```bash
# Start server
npm start

# Fetch a photo
curl http://localhost:3000/api/v1/photos/places/ChIJd8BlQ2BZwokRAFUEcm_qrcA/photos/AUc7tXV --output photo.jpg

# Check logs - should be DEBUG for fast photos
tail -100 logs/server.log | grep PhotoProxy
```

### 3. Test Cache with sampling:
```bash
# Set sampling to 100% for testing
export LOG_CACHE_SAMPLE_RATE=1

# Make search request
curl -X POST http://localhost:3000/api/v1/search -H "Content-Type: application/json" -d '{"query": "pizza"}'

# Check logs - should see DEBUG cache logs with sampled=true
tail -200 logs/server.log | grep -E "CACHE_HIT|CACHE_MISS|CACHE_STORE"

# Reset to default
unset LOG_CACHE_SAMPLE_RATE
```

---

## Rollback Plan

If issues arise:
1. Set `LOG_CACHE_SAMPLE_RATE=1` to always log cache operations
2. Revert commits to restore INFO-level logging
3. No functional changes - only logging levels changed

---

## Related Work

This builds on previous log noise reduction work:
- **LOG_NOISE_REDUCTION_SUMMARY.md** - HTTP, WebSocket, LLM logging (completed)
- **CORRECTNESS_FIXES_CHANGELOG.md** - Bias logging, assistant telemetry (completed)

Together, these changes reduce overall INFO log volume by ~70-80% while preserving full visibility into errors, slow operations, and anomalies.

---

**Status:** ✅ COMPLETE  
**Tests:** 23/23 passing  
**Ready for:** PR Review & Deployment
