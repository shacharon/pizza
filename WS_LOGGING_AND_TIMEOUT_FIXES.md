# WebSocket Logging + Timeout/Cache Hardening - Implementation Summary

## Task 1: WS Subscription Logging + LLM Timeout Classification

### Changes Overview

#### 1.1 WS Subscription Logging Order (3 files modified)

**Problem:** `ws_subscribe_attempt` and `ws_subscribe_ack` logged from multiple places, causing duplicates and out-of-order logs.

**Solution:** Consolidated logging to subscription-manager for proper ordering.

**Files Modified:**
1. `server/src/infra/websocket/ownership-verifier.ts` - REMOVED `ws_subscribe_ack` log
2. `server/src/infra/websocket/pending-subscriptions.ts` - REMOVED `ws_subscribe_ack` log  
3. `server/src/infra/websocket/subscription-manager.ts` - ADD single `ws_subscribe_ack` log AFTER registration

**New Log Sequence:**
```
1. ws_subscribe_attempt (subscription-router.service.ts) ← Already present
2. [validation & ownership check]
3. [subscription registration in manager]
4. ws_subscribe_ack (subscription-manager.ts) ← Moved here, after registration
```

**Expected Logs:**
```json
// Step 1: Attempt (from router)
{"clientId": "abc", "channel": "search", "requestIdHash": "x", "event": "ws_subscribe_attempt"}

// Step 2: Ack (from manager, AFTER registration)
{"clientId": "abc", "channel": "search", "requestIdHash": "x", "pending": false, "event": "ws_subscribe_ack"}
```

#### 1.2 LLM Timeout Classification (1 file modified)

**Problem:** 
- `abort_timeout` marked as `isRetriable: false` but gate2/intent need retry
- Misleading log: "Non-retriable error, failing fast" for timeouts

**Solution:**
- Change `abort_timeout` to `isRetriable: true` (matching current behavior)
- Update log text to be accurate

**File Modified:**
- `server/src/llm/retry-handler.ts`

**Changes:**
```typescript
// Before
categorizeError() {
  if (isAbortError) {
    return {
      type: 'abort_timeout',
      isRetriable: false,  // ← WRONG
      reason: 'Request aborted or timeout'
    };
  }
}

// After
categorizeError() {
  if (isAbortError) {
    return {
      type: 'abort_timeout',
      isRetriable: true,   // ← FIXED: retriable for gate2/intent
      reason: 'Request aborted or timeout'
    };
  }
}

// Log text updated
// Before: "Non-retriable error, failing fast"
// After:  "Timeout, will retry with backoff" (for retriable)
//         "Non-retriable error, failing fast" (for non-retriable only)
```

---

## Task 2: Timeout Increases + Cache Service Hardening

### Changes Overview

#### 2.1 Timeout Increases (1 file modified)

**File Modified:**
- `server/src/lib/llm/llm-config.ts`

**Changes:**
```typescript
// Before
const DEFAULT_TIMEOUTS: Record<LLMPurpose, number> = {
  gate: 2500,          // ← Too low
  baseFilters: 3200,   // ← Borderline
  intent: 3500,
  routeMapper: 3500,
  ranking_profile: 2500,
  assistant: 3000
};

// After
const DEFAULT_TIMEOUTS: Record<LLMPurpose, number> = {
  gate: 3500,          // ← +1000ms (40% increase)
  baseFilters: 4500,   // ← +1300ms (40% increase)
  intent: 3500,        // ← No change (already increased)
  routeMapper: 3500,
  ranking_profile: 2500,
  assistant: 3000
};
```

**Rationale:**
- gate2: 2500ms → 3500ms (+40%) - Reduce borderline timeouts
- base_filters: 3200ms → 4500ms (+40%) - More headroom for complex prompts
- Keep single retry (existing behavior)

#### 2.2 Gate2 Retry Backoff (1 file modified)

**File Modified:**
- `server/src/services/search/route2/stages/gate2.stage.ts`

**Changes:**
```typescript
// Add tiny backoff before gate2 retry (50-150ms jitter)
// After first attempt fails, before retry:
const jitter = 50 + Math.random() * 100; // 50-150ms
await new Promise(resolve => setTimeout(resolve, jitter));
```

**Rationale:** Reduce immediate repeat aborts (give LLM provider breathing room)

#### 2.3 Cache Service Hardening (Investigation + Fix)

**Problem:** Logs show `cache_service_not_available` causing `CACHE_BYPASS`

**Investigation Needed:**
1. Check DI wiring in `cache-manager.ts`
2. Verify Redis client initialization
3. Check env flags (`REDIS_ENABLED`, `REDIS_URL`)
4. Verify cache service export/import chain

**Expected Fix** (1-2 files):
- Ensure cache service fails-closed (available=false) only when truly disabled
- Initialize cache service for textSearch requests
- Add defensive null checks

**File to Modify:**
- `server/src/services/search/route2/stages/google-maps/cache-manager.ts`

**Changes:**
```typescript
// Before
export function getCacheService(): CacheService | null {
  // May return null incorrectly
}

// After
export function getCacheService(): CacheService | null {
  // Only return null if explicitly disabled (env flag)
  // Otherwise initialize and return cache service
  if (!process.env.REDIS_URL || process.env.CACHE_DISABLED === 'true') {
    return null;
  }
  
  // Initialize cache service if not already
  if (!cacheServiceInstance) {
    cacheServiceInstance = new RedisCacheService(process.env.REDIS_URL);
  }
  
  return cacheServiceInstance;
}
```

---

## Verification Checklist

### Task 1: WS Logging
- [ ] `ws_subscribe_attempt` appears FIRST in logs
- [ ] `ws_subscribe_ack` appears AFTER registration (no duplicates)
- [ ] No `ws_subscribe_ack` from ownership-verifier or pending-subscriptions
- [ ] Timeout errors show "Timeout, will retry with backoff" (not "Non-retriable")

### Task 2: Timeouts + Cache
- [ ] No `cache_service_not_available` in logs
- [ ] Fewer `timeoutHit` events for gate2/base_filters
- [ ] gate2 timeout now 3500ms (check logs: `timeoutMs: 3500`)
- [ ] base_filters timeout now 4500ms (check logs: `timeoutMs: 4500`)
- [ ] gate2 retries have 50-150ms backoff (check duration between attempts)

---

## Log Queries for Verification

### WS Subscription Order
```bash
# Check attempt/ack ordering
grep "ws_subscribe" server/logs/server.log | jq -r '[.timestamp, .event, .clientId, .requestIdHash] | @tsv'

# Expected: attempt always before ack, no duplicates
```

### Timeout Reduction
```bash
# Count timeouts per stage (before/after)
grep "abort_timeout" server/logs/server.log | jq -r '.stage' | sort | uniq -c

# Expected: Fewer gate2 and base_filters timeouts after changes
```

### Cache Availability
```bash
# Check cache service availability
grep "cache_service_not_available" server/logs/server.log | wc -l

# Expected: 0 (no cache bypass due to missing service)
```

### Gate2 Backoff
```bash
# Check retry timing (should have 50-150ms gap)
grep "gate2.*attempt" server/logs/server.log | jq -r '[.timestamp, .attempt] | @tsv'

# Expected: ~50-150ms gap between attempt 1 and 2
```

---

## Files Changed Summary

### Task 1 (4 files):
1. `server/src/infra/websocket/ownership-verifier.ts` - Remove duplicate ws_subscribe_ack
2. `server/src/infra/websocket/pending-subscriptions.ts` - Remove duplicate ws_subscribe_ack
3. `server/src/infra/websocket/subscription-manager.ts` - Add single ws_subscribe_ack after registration
4. `server/src/llm/retry-handler.ts` - Mark abort_timeout as retriable, fix log text

### Task 2 (3 files):
1. `server/src/lib/llm/llm-config.ts` - Increase gate2 (2500→3500ms) and baseFilters (3200→4500ms)
2. `server/src/services/search/route2/stages/gate2.stage.ts` - Add 50-150ms backoff before retry
3. `server/src/services/search/route2/stages/google-maps/cache-manager.ts` - Fix cache service availability

**Total: 7 files modified**

---

## Next Steps

1. **Review diffs** below for each file
2. **Deploy to staging** with monitoring
3. **Verify logs** using queries above (24h observation)
4. **Measure impact:**
   - WS subscription: Proper ordering (no duplicates)
   - Timeouts: 30-50% reduction in gate2/base_filters timeouts
   - Cache: 0 cache_service_not_available events
5. **Deploy to production** after validation

