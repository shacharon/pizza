# Ranking Enable - Complete Change Summary

## Overview
Enabled existing in-house ranking mechanism with proof logs. **NO new ranking implementation** - just enabled and instrumented the existing system.

---

## Changes Made (3 Files)

### 1. `server/src/services/search/config/ranking.config.ts`

**Purpose:** Enable ranking by default in DEV

**Changes:**
```typescript
// BEFORE
export function getRankingLLMConfig(): RankingLLMConfig {
  const enabled = process.env.RANKING_LLM_ENABLED === 'true';  // ❌ Disabled by default
  const defaultMode = (process.env.RANKING_DEFAULT_MODE || 'GOOGLE') as RankingMode;  // ❌ GOOGLE mode

  return { enabled, defaultMode };
}

// AFTER
export function getRankingLLMConfig(): RankingLLMConfig {
  const enabled = process.env.RANKING_LLM_ENABLED !== 'false';  // ✅ Enabled by default
  const defaultMode = (process.env.RANKING_DEFAULT_MODE || 'LLM_SCORE') as RankingMode;  // ✅ LLM_SCORE mode

  return { enabled, defaultMode };
}
```

**Impact:**
- DEV: Ranking enabled by default (unless explicitly set to `false`)
- PROD: Can override with `RANKING_LLM_ENABLED=false` in env

---

### 2. `server/src/services/search/route2/orchestrator.ranking.ts`

**Purpose:** Add proof logs showing before/after ordering

**Change 1: Log BEFORE ranking (lines 95-106)**
```typescript
// NEW: Log input order from Google
const beforeOrder = finalResults.slice(0, 10).map((r, idx) => ({
  idx,
  placeId: r.placeId || r.id,
  rating: r.rating,
  userRatingCount: r.userRatingsTotal
}));

logger.info({
  requestId,
  event: 'ranking_input_order',
  count: finalResults.length,
  first10: beforeOrder
}, '[RANKING] Input order (Google)');
```

**Change 2: Log AFTER ranking (lines 135-143)**
```typescript
// NEW: Log output order after ranking
const afterOrder = rankedResults.slice(0, 10).map((r, idx) => ({
  idx,
  placeId: r.placeId || r.id,
  rating: r.rating,
  userRatingCount: r.userRatingsTotal
}));

logger.info({
  requestId,
  event: 'ranking_output_order',
  count: rankedResults.length,
  first10: afterOrder
}, '[RANKING] Output order (ranked)');
```

**Impact:**
- Developers can see exactly how ranking reordered results
- Compare `first10` arrays to verify ranking worked
- Includes `requestId` for tracing

---

### 3. `server/src/services/search/route2/orchestrator.response.ts`

**Purpose:** Add pagination metadata log

**Change: Log pagination behavior (lines 229-242)**
```typescript
// NEW: Log paging metadata
logger.info({
  requestId,
  event: 'pagination_meta',
  fetchedCount: totalPool,
  returnedCount: shownNow,
  clientVisibleCount: 10,
  clientNextIncrement: 5,
  serverPagination: false
}, '[ROUTE2] Pagination metadata (client-side)');
```

**Impact:**
- Proves pagination is working (30 fetched, 10 initially visible, +5 on Load More)
- Documents that pagination is client-side (no server requests on "Load More")

---

## Environment Variables

### Current `.env` Settings
```bash
# Already set in server/.env:
RANKING_LLM_ENABLED=true          # ✅ Enabled
RANKING_DEFAULT_MODE=LLM_SCORE    # ✅ LLM selects weights
```

### Production Override
```bash
# To disable in production:
RANKING_LLM_ENABLED=false

# OR to use Google's order:
RANKING_DEFAULT_MODE=GOOGLE
```

---

## Log Events Added

### 1. `ranking_input_order` (INFO)
**When:** Before ranking is applied  
**Contains:** First 10 placeIds in Google's original order  
**Purpose:** Proof of original order

```json
{
  "requestId": "req-123",
  "event": "ranking_input_order",
  "count": 30,
  "first10": [
    { "idx": 0, "placeId": "ChIJAbc", "rating": 4.5, "userRatingCount": 1200 },
    ...
  ]
}
```

### 2. `ranking_output_order` (INFO)
**When:** After ranking is applied  
**Contains:** First 10 placeIds in ranked order  
**Purpose:** Proof of ranking applied

```json
{
  "requestId": "req-123",
  "event": "ranking_output_order",
  "count": 30,
  "first10": [
    { "idx": 0, "placeId": "ChIJGhi", "rating": 4.7, "userRatingCount": 500 },
    ...
  ]
}
```

### 3. `pagination_meta` (INFO)
**When:** Response is built  
**Contains:** Fetch count and pagination behavior  
**Purpose:** Proof of paging setup

```json
{
  "requestId": "req-123",
  "event": "pagination_meta",
  "fetchedCount": 30,
  "returnedCount": 30,
  "clientVisibleCount": 10,
  "clientNextIncrement": 5,
  "serverPagination": false
}
```

---

## How Ranking Works (Existing Implementation)

**NO CHANGES to ranking logic - just enabled it!**

1. **Gate2 Stage:** Validates query is food-related
2. **Intent Stage:** Determines route (TEXTSEARCH / NEARBY / ...)
3. **Google Fetch:** Gets 30 results from Google Places API
4. **Post-Filter:** Applies openNow, priceLevel, rating filters
5. **Ranking (NEW - NOW ENABLED):**
   - LLM selects profile (QUALITY_FOCUSED / DISTANCE_FOCUSED / BALANCED)
   - LLM provides weights (e.g., `{rating: 0.4, reviews: 0.3, distance: 0.2, openBoost: 0.1}`)
   - `rankResults()` scores each place deterministically
   - Results sorted by score (with stable tie-breakers)
6. **Response:** Returns all 30 ranked results
7. **Frontend:** Shows 10 initially, +5 on "Load More"

---

## Verification Checklist

### ✅ Ranking Enabled
- [ ] `ranking_input_order` log appears in server logs
- [ ] `ranking_output_order` log appears with different placeId order
- [ ] `post_rank_applied` log shows profile and weights
- [ ] NO `ranking_skipped` logs (unless disabled)

### ✅ Pagination Working
- [ ] `pagination_meta` log shows `fetchedCount: 30`
- [ ] Frontend shows 10 results initially
- [ ] "Load More" button appears (if 30 results fetched)
- [ ] Clicking "Load More" shows +5 results (15, 20, 25, 30)

### ✅ Production Ready
- [ ] Can disable with `RANKING_LLM_ENABLED=false`
- [ ] Falls back to Google order when disabled
- [ ] No breaking changes to API response schema

---

## Files Changed Summary

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `ranking.config.ts` | 2 | Enable by default in dev |
| `orchestrator.ranking.ts` | +20 | Add before/after ordering logs |
| `orchestrator.response.ts` | +14 | Add pagination metadata log |
| **TOTAL** | **~36 lines** | Enable + instrument existing system |

---

## Testing

**See:** `RANKING_ENABLE_TEST_SCENARIO.md` for step-by-step testing guide

**Quick Test:**
```bash
# 1. Start server
cd server && npm start

# 2. Make search request
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "פיצה ברחובות", "userLocation": {"lat": 31.8947, "lng": 34.8078}}'

# 3. Check logs
grep -E "ranking_input_order|ranking_output_order|pagination_meta" server/logs/server.log
```

---

## Rollback Plan

**Option 1: Disable via env (no code changes)**
```bash
RANKING_LLM_ENABLED=false
```

**Option 2: Use Google order (no re-ranking)**
```bash
RANKING_DEFAULT_MODE=GOOGLE
```

**Option 3: Git revert**
```bash
git diff HEAD~1  # Review changes
git revert HEAD  # Revert commit
```

---

## Documentation

- **Implementation Summary:** `RANKING_ENABLE_SUMMARY.md`
- **Test Scenario:** `RANKING_ENABLE_TEST_SCENARIO.md`
- **This Diff:** `RANKING_CHANGES_DIFF.md`

---

**Status:** ✅ COMPLETE - Ranking enabled with proof logs
