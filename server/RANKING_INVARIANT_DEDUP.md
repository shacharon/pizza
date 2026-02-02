# Ranking Invariant Log Deduplication - Implementation Summary

## Problem

1. `ranking_invariant_applied` was logged **TWICE per request**:

   - Once in `rankResults()` (line 139)
   - Once in `computeScoreBreakdown()` (line 227)

2. Weight inconsistency across ranking events:
   - `ranking_profile_selected.weights` = **baseWeights** (before invariants)
   - `ranking_score_breakdown.weights` = **finalWeights** (after invariants, but called twice)
   - `post_rank_applied.weights` = **baseWeights** (WRONG - should be finalWeights)

## Solution

### 1. Single Choke Point for Invariants

**Moved invariant application to ONE location:** `orchestrator.ranking.ts` (Step 4)

**Before:**

```typescript
// results-ranker.ts - rankResults()
const effectiveWeights = enforceRankingInvariants(..., requestId); // LOG 1

// results-ranker.ts - computeScoreBreakdown()
const effectiveWeights = enforceRankingInvariants(..., requestId); // LOG 2 (duplicate!)
```

**After:**

```typescript
// orchestrator.ranking.ts - applyRankingIfEnabled() (Step 4)
const finalWeights = enforceRankingInvariants(..., requestId, true); // LOG ONCE

// results-ranker.ts - rankResults()
// Uses finalWeights directly (NO invariant enforcement)

// results-ranker.ts - computeScoreBreakdown()
// Uses finalWeights directly (NO invariant enforcement)
```

### 2. Added `shouldLog` Parameter

**Updated `enforceRankingInvariants()` signature:**

```typescript
export function enforceRankingInvariants(
  weights: RankingWeights,
  hasUserLocation: boolean,
  cuisineKey: string | null | undefined,
  openNowRequested: boolean | null | undefined,
  hasCuisineScores: boolean,
  requestId?: string,
  shouldLog?: boolean // NEW: Controls logging (default: false)
): RankingWeights;
```

**Logging logic:**

```typescript
// Log ONLY when shouldLog is true (set by orchestrator)
if (appliedRules.length > 0 && requestId && shouldLog) {
  logger.info(
    {
      requestId,
      event: "ranking_invariant_applied",
      rules: appliedRules,
      baseWeights: weights, // Before invariants
      finalWeights: adjusted, // After invariants
    },
    `[RANKING] Invariants applied: ...`
  );
}
```

### 3. Fixed Weight Consistency

**All ranking events now use `finalWeights` (after ALL adjustments):**

| Event                       | Before                                | After                             |
| --------------------------- | ------------------------------------- | --------------------------------- |
| `ranking_profile_selected`  | `weights` (base)                      | `baseWeights` (base)              |
| `ranking_invariant_applied` | `originalWeights` + `adjustedWeights` | `baseWeights` + `finalWeights`    |
| `ranking_weights_final`     | ❌ (didn't exist)                     | ✅ `baseWeights` + `finalWeights` |
| `ranking_score_breakdown`   | `effectiveWeights` (inconsistent)     | `finalWeights` (consistent)       |
| `post_rank_applied`         | `selection.weights` (base) ❌         | `finalWeights` ✅                 |

### 4. Added `ranking_weights_final` Event

**New log event** (logged ONCE after all adjustments):

```typescript
// Only logged if weights changed from base
logger.info({
  requestId,
  event: 'ranking_weights_final',
  profile: 'BALANCED',
  baseWeights: { rating: 0.25, reviews: 0.20, distance: 0.30, ... },
  finalWeights: { rating: 0.25, reviews: 0.20, distance: 0.00, ... }, // distance zeroed
  adjustments: {
    distanceOriginNone: true, // Distance disabled (no anchor)
    invariantsApplied: true    // Invariants were applied
  }
}, '[RANKING] Final weights after all adjustments');
```

## Sample Logs (After Fix)

### Scenario 1: Invariants Applied (No User Location)

```json
// 1. Profile selected (baseWeights)
{
  "requestId": "req-123",
  "event": "ranking_profile_selected",
  "profile": "BALANCED",
  "baseWeights": {
    "rating": 0.25,
    "reviews": 0.20,
    "distance": 0.30,
    "openBoost": 0.10,
    "cuisineMatch": 0.15
  },
  "reason": "default",
  "source": "deterministic"
}

// 2. Invariants applied (ONCE per request)
{
  "requestId": "req-123",
  "event": "ranking_invariant_applied",
  "rules": [
    { "rule": "NO_USER_LOCATION", "component": "distance", "oldWeight": 0.30 }
  ],
  "baseWeights": { "rating": 0.25, "reviews": 0.20, "distance": 0.30, "openBoost": 0.10, "cuisineMatch": 0.15 },
  "finalWeights": { "rating": 0.25, "reviews": 0.20, "distance": 0.00, "openBoost": 0.10, "cuisineMatch": 0.15 }
}

// 3. Final weights summary
{
  "requestId": "req-123",
  "event": "ranking_weights_final",
  "profile": "BALANCED",
  "baseWeights": { "rating": 0.25, "reviews": 0.20, "distance": 0.30, "openBoost": 0.10, "cuisineMatch": 0.15 },
  "finalWeights": { "rating": 0.25, "reviews": 0.20, "distance": 0.00, "openBoost": 0.10, "cuisineMatch": 0.15 },
  "adjustments": {
    "distanceOriginNone": false,
    "invariantsApplied": true
  }
}

// 4. Score breakdown (uses finalWeights)
{
  "requestId": "req-123",
  "event": "ranking_score_breakdown",
  "profile": "BALANCED",
  "weights": { "rating": 0.25, "reviews": 0.20, "distance": 0.00, "openBoost": 0.10, "cuisineMatch": 0.15 },
  "top10": [...]
}

// 5. Post-rank summary (uses finalWeights)
{
  "requestId": "req-123",
  "event": "post_rank_applied",
  "profile": "BALANCED",
  "weights": { "rating": 0.25, "reviews": 0.20, "distance": 0.00, "openBoost": 0.10, "cuisineMatch": 0.15 },
  "resultCount": 15,
  "mode": "LLM_SCORE"
}
```

**Verification:**

- ✅ `ranking_invariant_applied` logged **ONCE**
- ✅ `finalWeights` identical across all events: `ranking_score_breakdown.weights` == `post_rank_applied.weights`
- ✅ `baseWeights` vs `finalWeights` clearly separated

### Scenario 2: No Invariants Applied (All Signals Present)

```json
// 1. Profile selected
{
  "requestId": "req-456",
  "event": "ranking_profile_selected",
  "profile": "BALANCED",
  "baseWeights": { "rating": 0.25, "reviews": 0.20, "distance": 0.30, "openBoost": 0.10, "cuisineMatch": 0.15 }
}

// 2. Invariants NOT logged (no rules applied)
// ❌ ranking_invariant_applied - SKIPPED (no rules to apply)

// 3. Final weights summary NOT logged (weights unchanged)
// ❌ ranking_weights_final - SKIPPED (baseWeights == finalWeights)

// 4. Score breakdown (uses finalWeights, same as baseWeights)
{
  "requestId": "req-456",
  "event": "ranking_score_breakdown",
  "profile": "BALANCED",
  "weights": { "rating": 0.25, "reviews": 0.20, "distance": 0.30, "openBoost": 0.10, "cuisineMatch": 0.15 }
}

// 5. Post-rank summary (uses finalWeights, same as baseWeights)
{
  "requestId": "req-456",
  "event": "post_rank_applied",
  "profile": "BALANCED",
  "weights": { "rating": 0.25, "reviews": 0.20, "distance": 0.30, "openBoost": 0.10, "cuisineMatch": 0.15 }
}
```

**Verification:**

- ✅ `ranking_invariant_applied` **NOT logged** (no rules applied)
- ✅ `ranking_weights_final` **NOT logged** (weights unchanged)
- ✅ All weight references identical

## Files Modified

1. **`server/src/services/search/route2/ranking/results-ranker.ts`**

   - Added `shouldLog` parameter to `enforceRankingInvariants()`
   - Removed invariant enforcement from `rankResults()` (now receives finalWeights)
   - Removed invariant enforcement from `computeScoreBreakdown()` (now receives finalWeights)
   - Made `enforceRankingInvariants()` **exported** (for orchestrator to call)

2. **`server/src/services/search/route2/orchestrator.ranking.ts`**

   - Added Step 4: Single choke point for invariant application
   - Import and call `enforceRankingInvariants()` with `shouldLog=true`
   - Added `ranking_weights_final` log event (if weights changed)
   - Changed all weight references to use `finalWeights` instead of `selection.weights` or `effectiveWeights`

3. **`server/src/services/search/route2/ranking/ranking-profile-deterministic.ts`**
   - Renamed `weights` to `baseWeights` in all `ranking_profile_selected` logs
   - No functional change (just clarity)

## Testing

### Unit Test Verification

```bash
cd server
npm test -- ranking
```

### Manual Verification

1. Query with no user location:

   - Expect: `ranking_invariant_applied` logged ONCE
   - Verify: `distance: 0` in all subsequent logs

2. Query with user location + openNow + cuisine:

   - Expect: NO `ranking_invariant_applied` log
   - Verify: All weights non-zero

3. Query with user location but no openNow:
   - Expect: `ranking_invariant_applied` logged ONCE
   - Verify: `openBoost: 0` in all subsequent logs

## Status

✅ **Implementation Complete**  
✅ **Single choke point** for invariant application  
✅ **Deduplication** achieved (`ranking_invariant_applied` logs ONCE)  
✅ **Weight consistency** enforced across all events  
✅ **Clear separation** of `baseWeights` vs `finalWeights`  
✅ **New event** `ranking_weights_final` for transparency

---

**Completed:** 2026-02-01  
**Version:** 1.0.0
