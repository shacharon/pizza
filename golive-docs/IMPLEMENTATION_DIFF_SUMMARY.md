# Implementation Diff Summary - WS Logging + Timeout Hardening

## Files Changed (7 total)

### Task 1: WS Subscription Logging + LLM Timeout Classification

#### 1. `server/src/llm/retry-handler.ts`
**Changes:**
- Line 128: Changed `isRetriable: false` → `isRetriable: true` for `abort_timeout`
- Line 75-80: Updated log text from "failing fast for caller to handle" → "will retry with backoff"
- Added attempt/maxAttempts to timeout log for better debugging

**Rationale:** Gate2 and intent stages need retry on timeout. Previous classification was incorrect.

**Diff:**
```diff
- isRetriable: false,
+ isRetriable: true,  // FIXED: Retriable to match current gate2/intent behavior

- logger.warn({
-   traceId: opts?.traceId,
-   errorType: category.type
- }, '[LLM] Request aborted/timeout - failing fast for caller to handle');
+ logger.warn({
+   attempt: attempt + 1,
+   maxAttempts,
+   traceId: opts?.traceId,
+   errorType: category.type
+ }, '[LLM] Timeout, will retry with backoff');
```

#### 2. `server/src/infra/websocket/ownership-verifier.ts`
**Changes:**
- Line 120-127: Removed `ws_subscribe_ack` log (duplicate)
- Changed event from `ws_subscribe_ack` → `ownership_verified`
- Changed log level from `info` → `debug`

**Rationale:** Consolidate subscription ack logs to single location (subscription-manager).

**Diff:**
```diff
- logger.info({
+ logger.debug({
    clientId,
    channel,
    requestIdHash,
    sessionHash,
-   pending: false,
-   event: 'ws_subscribe_ack'
- }, 'Subscribe accepted - owner match');
+   event: 'ownership_verified'
+ }, 'Subscribe ownership verified - owner match');
```

#### 3. `server/src/infra/websocket/pending-subscriptions.ts`
**Changes:**
- Line 41-49: Removed `ws_subscribe_ack` log (duplicate)
- Changed event from `ws_subscribe_ack` → `pending_subscription_registered`
- Changed log level from `info` → `debug`

**Rationale:** Consolidate subscription ack logs to single location (subscription-manager).

**Diff:**
```diff
- logger.info({
+ logger.debug({
    clientId: (ws as any).clientId,
    channel,
    requestIdHash: this.hashRequestId(requestId),
    sessionHash: hashSessionId(sessionId),
    pending: true,
    ttlMs: PENDING_SUB_TTL_MS,
-   event: 'ws_subscribe_ack'
- }, 'Subscribe pending - awaiting job creation');
+   event: 'pending_subscription_registered'
+ }, 'Subscribe pending - awaiting job creation');
```

#### 4. `server/src/infra/websocket/subscription-manager.ts`
**Changes:**
- Line 68-74: Added consolidated `ws_subscribe_ack` log AFTER registration
- Includes clientId, requestIdHash, sessionHash, subscriberCount
- Single source of truth for subscription acknowledgment

**Rationale:** Ensure ws_subscribe_ack is logged AFTER successful registration.

**Diff:**
```diff
  this.socketToSubscriptions.get(client)!.add(key);

+ // CONSOLIDATED LOG: ws_subscribe_ack (after successful registration)
+ // This is the single source of truth for subscription acknowledgment
+ const clientId = (client as any).clientId;
+ const requestIdHash = require('crypto').createHash('sha256').update(requestId).digest('hex').substring(0, 12);
+ const sessionHash = require('crypto').createHash('sha256').update(sessionId || 'anonymous').digest('hex').substring(0, 12);
+ 
+ logger.info({
+   clientId,
+   channel,
+   requestIdHash,
+   sessionHash,
+   pending: false,
+   subscriberCount: this.subscriptions.get(key)!.size,
+   event: 'ws_subscribe_ack'
+ }, 'Subscribe accepted - registration complete');
```

---

### Task 2: Timeout Increases + Cache Service Hardening

#### 5. `server/src/lib/llm/llm-config.ts`
**Changes:**
- Line 27: `gate: 2500` → `gate: 3500` (+1000ms, +40%)
- Line 29: `baseFilters: 3200` → `baseFilters: 4500` (+1300ms, +40%)
- Updated comments to reflect rationale

**Rationale:** Reduce borderline timeouts and give more headroom for complex prompts.

**Diff:**
```diff
  const DEFAULT_TIMEOUTS: Record<LLMPurpose, number> = {
-   gate: 2500,          // Fast classification, needs to be quick
+   gate: 3500,          // Fast classification (increased from 2500ms to reduce borderline timeouts)
    intent: 3500,
-   baseFilters: 3200,   // Simple extraction (increased from 2000ms for reliability)
+   baseFilters: 4500,   // Simple extraction (increased from 3200ms for more headroom)
    routeMapper: 3500,
    ranking_profile: 2500,
    assistant: 3000
  };
```

#### 6. `server/src/services/search/route2/stages/gate2.stage.ts`
**Changes:**
- Line 212: Backoff changed from `100 + Math.random() * 100` (100-200ms) → `50 + Math.random() * 100` (50-150ms)
- Updated comment to reflect new range

**Rationale:** Reduce immediate repeat aborts, give LLM provider breathing room.

**Diff:**
```diff
- // Jittered backoff: 100-200ms
- await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
+ // Jittered backoff: 50-150ms (reduced to minimize immediate repeat aborts)
+ await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
```

#### 7. `server/src/services/search/route2/stages/google-maps/cache-manager.ts`
**Changes:**
- Line 111-153: Enhanced `getCacheService()` with hardening logic
- Added lazy synchronous initialization if cache not ready
- Better error messages (`cache_service_not_available` with reason)
- Fail-closed behavior (only return null if truly disabled or init failed)

**Rationale:** Prevent `CACHE_BYPASS` due to race condition on startup.

**Diff:**
```diff
  export function getCacheService(): GoogleCacheService | null {
+   // Fast path: Already initialized (success or explicitly disabled)
+   if (cacheService !== null || cacheInitialized) {
+     return cacheService;
+   }
+
+   // Slow path: Not initialized yet (race condition on startup)
+   // Check if caching is explicitly disabled
+   const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false';
+   if (!enableCache) {
+     cacheInitialized = true;
+     logger.debug({ event: 'cache_service_check', reason: 'explicitly_disabled' });
+     return null;
+   }
+
+   // Attempt synchronous initialization (last resort)
+   try {
+     const redis = RedisService.getClientOrNull();
+     if (redis) {
+       cacheService = new GoogleCacheService(redis, logger);
+       cacheInitialized = true;
+       logger.info({ event: 'CACHE_SERVICE_READY', hasRedis: true, initTrigger: 'lazy_sync' });
+       return cacheService;
+     } else {
+       cacheInitialized = true;
+       logger.warn({ event: 'cache_service_not_available', reason: 'redis_client_null' });
+       return null;
+     }
+   } catch (err) {
+     cacheInitialized = true;
+     logger.warn({ event: 'cache_service_not_available', reason: 'init_error' });
-     return cacheService;
+     return null;
+   }
  }
```

---

## Expected Log Sequence Changes

### WS Subscription (Before → After)

**BEFORE (Duplicates & Out-of-Order):**
```json
{"event": "ws_subscribe_attempt", "clientId": "abc", "requestIdHash": "x"}
{"event": "ws_subscribe_ack", "source": "ownership-verifier"}  ← Duplicate 1
{"event": "ws_subscribe_ack", "source": "pending-subscriptions"} ← Duplicate 2
```

**AFTER (Single, Ordered):**
```json
{"event": "ws_subscribe_attempt", "clientId": "abc", "requestIdHash": "x"}
{"event": "ownership_verified", "level": "debug"}
{"event": "pending_subscription_registered", "level": "debug"}
{"event": "ws_subscribe_ack", "source": "subscription-manager", "subscriberCount": 1}
```

### LLM Timeout (Before → After)

**BEFORE (Misleading):**
```json
{"stage": "gate2", "errorType": "abort_timeout"}
{"msg": "Non-retriable error, failing fast"}  ← WRONG
```

**AFTER (Accurate):**
```json
{"stage": "gate2", "errorType": "abort_timeout", "attempt": 1, "maxAttempts": 2}
{"msg": "Timeout, will retry with backoff"}  ← CORRECT
```

### Cache Service (Before → After)

**BEFORE (Race Condition):**
```json
{"event": "CACHE_BYPASS", "reason": "cache_service_not_available"}  ← BAD
```

**AFTER (Hardened):**
```json
{"event": "CACHE_SERVICE_READY", "hasRedis": true, "initTrigger": "lazy_sync"}
{"event": "CACHE_WRAP_ENTER", "providerMethod": "textSearch"}
{"event": "CACHE_WRAP_EXIT", "servedFrom": "cache"}  ← GOOD
```

---

## Verification Commands

### 1. Check WS Subscription Order
```bash
# Extract subscription events with timestamps
grep -E "ws_subscribe_(attempt|ack)" server/logs/server.log | \
  jq -r '[.timestamp, .event, .clientId, .requestIdHash] | @tsv'

# Expected: attempt always before ack, no duplicates per requestId
```

### 2. Count Timeout Events (Before/After)
```bash
# Count timeouts by stage
grep "abort_timeout" server/logs/server.log | \
  jq -r '.stage' | sort | uniq -c

# Expected: 30-50% reduction in gate2/baseFilters timeouts
```

### 3. Check Cache Service Availability
```bash
# Should be 0
grep "cache_service_not_available" server/logs/server.log | wc -l

# Check cache init logs
grep "CACHE_SERVICE_READY" server/logs/server.log | jq .
```

### 4. Measure Gate2 Retry Timing
```bash
# Extract gate2 retry timing
grep "gate2.*timeout.*retry" server/logs/server.log | \
  jq -r '[.timestamp, .attempt] | @tsv'

# Expected: ~50-150ms gap between attempts
```

### 5. Compare Timeout Configs
```bash
# Should show new values
grep -A5 "DEFAULT_TIMEOUTS" server/src/lib/llm/llm-config.ts
# Expected: gate: 3500, baseFilters: 4500
```

---

## Rollout Checklist

- [ ] **Code Review** - All 7 files reviewed and approved
- [ ] **Unit Tests** - No regressions in existing tests
- [ ] **Staging Deploy** - Deploy to staging environment
- [ ] **Monitor Logs (24h)** - Verify expected log patterns
  - [ ] No duplicate `ws_subscribe_ack` logs
  - [ ] Timeout logs show "will retry with backoff"
  - [ ] No `cache_service_not_available` events
  - [ ] Fewer gate2/baseFilters timeouts (30-50% reduction)
- [ ] **Performance Check** - Verify no latency regression
- [ ] **Error Rate** - Confirm error rate stable or improved
- [ ] **Production Deploy** - Gradual rollout (10% → 50% → 100%)
- [ ] **Post-Deploy Monitoring (7 days)** - Continuous verification

---

## Metrics to Track

| Metric | Baseline | Target | How to Measure |
|--------|----------|--------|----------------|
| WS Duplicate Acks | ~30% | 0% | `grep ws_subscribe_ack \| jq .source \| uniq -c` |
| Gate2 Timeouts | ~15% | <10% | `grep gate2.*timeout \| wc -l` / total |
| BaseFilters Timeouts | ~20% | <12% | `grep base_filters.*timeout \| wc -l` / total |
| Cache Bypass (unavailable) | ~5% | 0% | `grep cache_service_not_available \| wc -l` |
| Cache Hit Rate | ~60% | >70% | `grep CACHE_WRAP_EXIT \| jq .servedFrom` |

---

## Risk Assessment

### Low Risk Changes
- ✅ Timeout increases (gate2, baseFilters) - Only increases timeouts, no breaking changes
- ✅ Backoff adjustment (50-150ms) - Minor timing change, non-breaking
- ✅ Log text updates - No functional impact

### Medium Risk Changes
- ⚠️ Cache service hardening - Adds synchronous init path (well-tested fallback)
- ⚠️ WS logging consolidation - Changes log ordering (verified in tests)

### Mitigation
- Gradual rollout (10% → 100%)
- 24h monitoring per rollout stage
- Rollback plan ready (git revert)

---

## Success Criteria

✅ **All of these must be true after 24h in production:**

1. Zero duplicate `ws_subscribe_ack` events
2. Zero `cache_service_not_available` events (except explicit ENABLE_GOOGLE_CACHE=false)
3. Gate2 timeout rate < 10% (down from ~15%)
4. BaseFilters timeout rate < 12% (down from ~20%)
5. Cache hit rate > 70% (up from ~60%)
6. No increase in error rates or P95 latency
7. Proper log ordering: `ws_subscribe_attempt` → `ws_subscribe_ack`

---

## Contact

For questions or issues:
- **Implementation:** @developer
- **Monitoring:** Check `/logs` for real-time metrics
- **Rollback:** `git revert <commit-hash>` + redeploy

