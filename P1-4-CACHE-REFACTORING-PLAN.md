# P1-4: GoogleCacheService.wrap() Refactoring Plan

**Current State**: 205-line method with deep nesting (4-5 levels)  
**Goal**: Linear early-return style with pure helpers  
**Date**: 2026-01-30

## Current Problems

### Nesting Issues (Lines 39-243)
```typescript
async wrap() {
  try {                                    // Level 1
    // validation
    if (inflight) {                        // Level 2
      if (shouldSample()) { ... }          // Level 3
    }
    try {                                  // Level 2 (L1 check)
      if (l1Entry) {                       // Level 3
        if (l1Entry.expiresAt > now) {     // Level 4
          if (isSlow || shouldSample()) {  // Level 5
            // logging
          }
        }
      }
    } catch { ... }
    try {                                  // Level 2 (L2 check)
      if (redis.status === 'ready') {      // Level 3
        if (cachedValue) {                 // Level 4
          try {                            // Level 5
            // parse and return
          } catch { ... }
        }
      }
    } catch { ... }
    // fetch logic with more nesting...
  } catch { ... }
}
```

**Complexity**: McCabe Complexity ~15 (high), hard to test, hard to read

## Proposed Structure

### 1. Extract Pure Helpers (New Functions)

#### Helper: `checkL1Cache`
```typescript
private checkL1Cache(
  key: string,
  safeTtl: number
): { hit: boolean; value?: unknown; metrics?: CacheMetrics } {
  const l1Entry = this.l1Cache.get(key);
  if (!l1Entry) return { hit: false };
  
  const now = Date.now();
  if (l1Entry.expiresAt <= now) {
    this.l1Cache.delete(key); // Lazy expiry
    return { hit: false };
  }
  
  const ttlRemainingMs = l1Entry.expiresAt - now;
  const cacheAgeMs = safeTtl * 1000 - ttlRemainingMs;
  
  return {
    hit: true,
    value: l1Entry.value,
    metrics: {
      source: 'memory',
      cacheTier: 'L1',
      cacheAgeMs: Math.max(0, Math.round(cacheAgeMs)),
      ttlRemainingSec: Math.round(ttlRemainingMs / 1000)
    }
  };
}
```

#### Helper: `checkInflight`
```typescript
private checkInflight<T>(key: string): Promise<T> | null {
  return this.inflightRequests.get(key) as Promise<T> | null;
}
```

#### Helper: `checkL2Cache`
```typescript
private async checkL2Cache(
  key: string
): Promise<{ hit: boolean; value?: unknown; metrics?: CacheMetrics }> {
  if (!this.redis || this.redis.status !== 'ready') {
    return { hit: false };
  }
  
  const cachedValue = await this.redis.get(key);
  if (!cachedValue) return { hit: false };
  
  try {
    const parsed = JSON.parse(cachedValue);
    const ttl = await this.redis.ttl(key);
    
    return {
      hit: true,
      value: parsed,
      metrics: {
        source: 'redis',
        cacheTier: 'L2',
        ttlRemainingSec: ttl > 0 ? ttl : undefined
      }
    };
  } catch (parseError) {
    this.logger.warn({ event: 'CACHE_CORRUPT', key }, 'Failed to parse cached JSON');
    return { hit: false };
  }
}
```

#### Helper: `fetchAndPopulate`
```typescript
private async fetchAndPopulate<T>(
  key: string,
  fetchFn: () => Promise<T>,
  safeTtl: number
): Promise<T> {
  try {
    const res = await fetchFn();
    const isEmptyArray = Array.isArray(res) && res.length === 0;
    const redisTtl = isEmptyArray ? 120 : safeTtl;
    
    // Populate L1
    this.populateL1(key, res, redisTtl);
    
    // Populate L2
    await this.populateL2(key, res, redisTtl);
    
    return res;
  } finally {
    this.inflightRequests.delete(key);
  }
}
```

#### Helper: `populateL1` (extracted from setL1Cache)
```typescript
private populateL1(key: string, value: unknown, ttl: number): void {
  try {
    this.setL1Cache(key, value, ttl);
  } catch (l1WriteError) {
    this.logger.warn({
      event: 'L1_WRITE_ERROR',
      key,
      error: String(l1WriteError)
    });
  }
}
```

#### Helper: `populateL2`
```typescript
private async populateL2(key: string, value: unknown, ttl: number): Promise<void> {
  const startTime = Date.now();
  try {
    if (this.redis && this.redis.status === 'ready') {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttl);
      const durationMs = Date.now() - startTime;
      
      this.logCacheOperation('CACHE_STORE', key, {
        cacheTier: 'L2',
        ttlUsed: ttl,
        durationMs
      });
    }
  } catch (setErr) {
    this.logger.warn({
      event: 'REDIS_WRITE_ERROR',
      key,
      error: String(setErr)
    });
  }
}
```

#### Helper: `logCacheOperation` (DRY logging)
```typescript
private logCacheOperation(
  event: string,
  key: string,
  data: Record<string, any>
): void {
  const isSlow = data.durationMs > SLOW_THRESHOLDS.CACHE;
  if (isSlow || shouldSampleRandom(this.cacheSamplingRate)) {
    const logLevel = isSlow ? 'info' : 'debug';
    this.logger[logLevel]({
      event,
      key,
      ...data,
      ...(isSlow && { slow: true }),
      ...(!isSlow && { sampled: true })
    });
  }
}
```

### 2. Refactored Linear Flow

```typescript
async wrap<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // 1. Validate inputs (early return on error)
  const safeTtl = this.validateInputs(key, fetchFn, ttlSeconds);
  
  // 2. Check L0: Inflight deduplication (early return if hit)
  const inflight = this.checkInflight<T>(key);
  if (inflight) {
    this.logInflightDedupe(key);
    return inflight;
  }
  
  // 3. Check L1: In-memory cache (early return if hit)
  const l1Result = this.tryCheckL1(key, safeTtl);
  if (l1Result.hit) {
    return l1Result.value as T;
  }
  
  // 4. Check L2: Redis cache (early return if hit)
  const l2Result = await this.tryCheckL2(key, safeTtl);
  if (l2Result.hit) {
    this.populateL1(key, l2Result.value, safeTtl); // Promote to L1
    return l2Result.value as T;
  }
  
  // 5. Double-check inflight (race condition protection)
  const inflight2 = this.checkInflight<T>(key);
  if (inflight2) return inflight2;
  
  // 6. Cache miss -> fetch and populate
  this.logCacheMiss(key);
  const fetchPromise = this.fetchAndPopulate<T>(key, fetchFn, safeTtl);
  this.inflightRequests.set(key, fetchPromise);
  
  return fetchPromise;
}
```

**New Complexity**: McCabe Complexity ~5 (low), easy to test, easy to read

### 3. Safe Wrappers (preserve error handling)

```typescript
private tryCheckL1(key: string, safeTtl: number): CacheResult {
  const startTime = Date.now();
  try {
    const result = this.checkL1Cache(key, safeTtl);
    if (result.hit) {
      const durationMs = Date.now() - startTime;
      this.logCacheOperation('L1_CACHE_HIT', key, {
        ...result.metrics,
        durationMs
      });
    } else {
      this.logCacheMiss(key, 'L1');
    }
    return result;
  } catch (l1Error) {
    this.logger.warn({
      event: 'L1_CACHE_ERROR',
      key,
      error: l1Error instanceof Error ? l1Error.message : String(l1Error)
    });
    return { hit: false };
  }
}

private async tryCheckL2(key: string, safeTtl: number): Promise<CacheResult> {
  const startTime = Date.now();
  try {
    const result = await this.checkL2Cache(key);
    if (result.hit) {
      const durationMs = Date.now() - startTime;
      this.logCacheOperation('CACHE_HIT', key, {
        ...result.metrics,
        durationMs
      });
    }
    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    this.logger.warn({
      event: 'REDIS_READ_ERROR',
      key,
      durationMs,
      error: err instanceof Error ? err.message : String(err)
    });
    return { hit: false };
  }
}
```

## Benefits

### Before vs After

| Metric | Before | After |
|--------|--------|-------|
| Method length | 205 lines | ~50 lines |
| Max nesting | 5 levels | 2 levels |
| McCabe Complexity | ~15 | ~5 |
| Testability | Hard | Easy |
| Readability | Poor | Good |

### Testing Strategy

#### Unit Tests to Add
1. **Inflight deduplication race**
   - Multiple concurrent requests for same key
   - Verify only one fetch occurs
   - Verify all callers get same promise

2. **L1 hit path**
   - Fresh entry returns value
   - Expired entry triggers L2/fetch
   - Metrics logged correctly

3. **L2 hit path**
   - Redis hit returns value
   - L1 promoted correctly
   - Metrics logged correctly

4. **Fetch path**
   - Miss triggers fetch
   - L1/L2 populated correctly
   - Inflight cleaned up on success
   - Inflight cleaned up on error

5. **Error handling**
   - L1 error continues to L2
   - L2 error continues to fetch
   - Fetch error propagates but cleans up inflight

## Implementation Steps

### Phase 1: Extract Pure Helpers
1. Create `CacheResult` type
2. Extract `checkL1Cache()` (pure, no side effects)
3. Extract `checkL2Cache()` (pure, async)
4. Extract `checkInflight()` (pure accessor)
5. Verify types compile

### Phase 2: Extract Logging Helpers
1. Extract `logCacheOperation()` (DRY)
2. Extract `logInflightDedupe()`
3. Extract `logCacheMiss()`
4. Verify logs preserved

### Phase 3: Extract Populate Helpers
1. Extract `populateL1()`
2. Extract `populateL2()`
3. Extract `fetchAndPopulate()`
4. Verify side effects preserved

### Phase 4: Refactor Main Method
1. Add safe wrappers (`tryCheckL1`, `tryCheckL2`)
2. Rewrite `wrap()` with linear flow
3. Verify build passes
4. Verify existing tests pass

### Phase 5: Add New Tests
1. Test inflight deduplication races
2. Test L1/L2 hit paths
3. Test error recovery paths
4. Test metrics/logs

## Preserved Semantics

### ✅ Must Remain Identical
1. **Cache tiers**: L0 (inflight) → L1 (memory) → L2 (Redis) → Fetch
2. **TTL logic**: Empty arrays get 120s (Redis) / 30s (L1), others respect input
3. **L1 size limit**: FIFO eviction at 500 entries
4. **Error handling**: Continue to next tier on errors
5. **Inflight cleanup**: Always in `finally` block
6. **Metrics/logs**: Same events, same sampling logic
7. **Race protection**: Double-check inflight before fetch

### ✅ Log Events Preserved
- `INFLIGHT_DEDUPE`
- `L1_CACHE_HIT` / `L1_CACHE_MISS` / `L1_CACHE_ERROR`
- `CACHE_HIT` (L2) / `CACHE_MISS`
- `REDIS_READ_ERROR` / `REDIS_WRITE_ERROR`
- `CACHE_STORE`
- `CACHE_CORRUPT`
- `L1_WRITE_ERROR` / `L1_SET_ERROR`
- `CACHE_WRAP_CRITICAL_ERROR`

### ✅ Sampling Logic Preserved
- DEBUG logs: 5% sampling (configurable)
- INFO logs: Always for slow operations (>200ms)
- WARN/ERROR logs: Always

## Success Criteria
- ✅ Main method < 60 lines (from 205)
- ✅ Max nesting ≤ 2 levels
- ✅ All helpers < 50 lines each
- ✅ Build passes
- ✅ Existing tests pass
- ✅ New tests added (race conditions, error paths)
- ✅ Metrics/logs preserved
- ✅ Same runtime behavior

## Risk
🟢 **Low**
- Pure refactoring (no logic changes)
- Incremental extraction (can test each step)
- Comprehensive test coverage planned
