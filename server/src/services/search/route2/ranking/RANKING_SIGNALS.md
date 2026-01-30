# Ranking Signals Implementation

**Status:** Complete ✅  
**Type:** Metadata-only (no behavior change)  
**Tests:** 21 unit tests, all passing

## Overview

RankingSignals is a deterministic metadata object produced after post-filters and (optional) ranking. It provides insights about the ranking decision, result pool state, and quality signals without affecting the actual results.

## Purpose

- **Observability:** Track ranking decisions and quality signals
- **Debugging:** Understand why certain profiles/weights were chosen
- **Analytics:** Measure pool quality (low results, relax usage, openNow coverage)
- **Future:** Can drive UX improvements (show filters, suggest relaxation, etc.)

## Architecture

```
Post-Filters → Ranking (optional) → Build Signals → Attach to response.meta
```

**Key Principle:** Signals are **always computed** (even when ranking is disabled) and attached as metadata. They never affect results.

## Signal Structure

```typescript
interface RankingSignals {
  profile: RankingProfile;          // Which profile was used
  dominantFactor: DominantFactor;   // Which factor dominates (or NONE)
  
  triggers: {
    lowResults: boolean;              // Results count is low (≤10)
    relaxUsed: boolean;               // Filters were relaxed
    manyOpenUnknown: boolean;         // Many results lack openNow data
    dominatedByOneFactor: boolean;    // One weight >> others
  };
  
  facts: {
    shownNow: number;                 // Final result count
    totalPool: number;                // Pre-filter pool size
    hasUserLocation: boolean;
  };
}
```

## Deterministic Thresholds

All thresholds are hardcoded and deterministic:

| Trigger | Threshold | Logic |
|---------|-----------|-------|
| `lowResults` | ≤ 10 results | `resultsAfterFilters <= 10` |
| `relaxUsed` | Any relaxation | `priceIntent OR minRating relaxed` |
| `manyOpenUnknown` | ≥ 40% unknown | `unknownCount >= 0.4 * resultsAfterFilters` |
| `dominatedByOneFactor` | Weight ≥ 0.55 | `max(rating, reviews, distance, openBoost) >= 0.55` |

### Dominant Factor Logic

The `dominantFactor` is derived from the **highest weight**:

1. Find `max(rating, reviews, distance, openBoost)`
2. If `max < 0.55` → `NONE` (no clear dominance)
3. Else → Return the factor with max weight:
   - `distance === max` → `DISTANCE`
   - `rating === max` → `RATING`
   - `reviews === max` → `REVIEWS`
   - `openBoost === max` → `OPEN`

## Integration Points

### 1. Orchestrator (route2.orchestrator.ts)

After post-filters and ranking:

```typescript
const rankingResult = await applyRankingIfEnabled(
  postFilterResult.resultsFiltered,
  intentDecision,
  finalFilters,
  postFilterResult.stats.before,    // resultsBeforeFilters
  postFilterResult.relaxed || {},    // relaxApplied
  ctx
);

const finalResults = rankingResult.rankedResults;
const rankingSignals = rankingResult.signals;  // ← Always present
```

### 2. Response Builder (orchestrator.response.ts)

Signals are attached to response metadata:

```typescript
meta: {
  tookMs: totalDurationMs,
  mode: ...,
  appliedFilters: ...,
  confidence: ...,
  source: 'route2',
  failureReason: 'NONE',
  ...(rankingSignals && { rankingSignals })  // ← Conditionally included
}
```

### 3. Ranking Module (orchestrator.ranking.ts)

Computes signals in all code paths:

- **Ranking enabled:** Uses LLM-selected profile + weights
- **Ranking disabled:** Uses default BALANCED profile
- **Empty results:** Still computes signals with count=0
- **Error case:** Falls back to BALANCED profile

## Example Outputs

### Example 1: Low Results with Relaxation

**Input:**
- Query: "best sushi restaurants"
- Results: 8 after filters (originally 30)
- minRating filter relaxed (R45 → none)

**Output:**
```json
{
  "profile": "QUALITY",
  "dominantFactor": "RATING",
  "triggers": {
    "lowResults": true,
    "relaxUsed": true,
    "manyOpenUnknown": false,
    "dominatedByOneFactor": true
  },
  "facts": {
    "shownNow": 8,
    "totalPool": 30,
    "hasUserLocation": false
  }
}
```

### Example 2: Nearby with Unknown OpenNow

**Input:**
- Query: "pizza near me"
- Results: 20 (12 unknown, 6 open, 2 closed)
- No relaxation

**Output:**
```json
{
  "profile": "NEARBY",
  "dominantFactor": "DISTANCE",
  "triggers": {
    "lowResults": false,
    "relaxUsed": false,
    "manyOpenUnknown": true,
    "dominatedByOneFactor": true
  },
  "facts": {
    "shownNow": 20,
    "totalPool": 50,
    "hasUserLocation": true
  }
}
```

### Example 3: Balanced Profile

**Input:**
- Query: "italian restaurants"
- Results: 25 (all known openNow status)
- No filters or relaxation

**Output:**
```json
{
  "profile": "BALANCED",
  "dominantFactor": "NONE",
  "triggers": {
    "lowResults": false,
    "relaxUsed": false,
    "manyOpenUnknown": false,
    "dominatedByOneFactor": false
  },
  "facts": {
    "shownNow": 25,
    "totalPool": 30,
    "hasUserLocation": true
  }
}
```

## Testing

### Unit Tests (21 total)

**Threshold Tests:**
- lowResults detection (≤10 boundary)
- relaxUsed detection (priceIntent, minRating, both)
- manyOpenUnknown detection (40% threshold)
- dominatedByOneFactor detection (0.55 threshold)

**Dominant Factor Tests:**
- DISTANCE dominance
- RATING dominance
- REVIEWS dominance
- OPEN dominance
- NONE (balanced/weak weights)

**Edge Cases:**
- Zero results handling
- Multiple triggers simultaneously
- Profile preservation
- Facts population

**Run Tests:**
```bash
npm test -- src/services/search/route2/ranking/ranking-signals.test.ts
```

## Future Use Cases

**Potential applications (not yet implemented):**

1. **UX Improvements:**
   - Show "few results" message when `lowResults=true`
   - Suggest relaxing filters when `relaxUsed=true`
   - Show "openNow data incomplete" when `manyOpenUnknown=true`

2. **Analytics:**
   - Track profile distribution (NEARBY vs QUALITY vs etc.)
   - Measure relaxation frequency
   - Monitor openNow data coverage

3. **A/B Testing:**
   - Compare user behavior across different profiles
   - Test impact of relaxation strategies
   - Evaluate ranking quality metrics

4. **Assistant Guidance:**
   - LLM assistant can use signals to provide better context
   - "I found 8 results (relaxed rating filter to expand options)"
   - "Most places don't have real-time hours data"

## Hard Constraints Met

✅ **No behavior change** - Results are identical with/without signals  
✅ **Metadata only** - Signals never affect ranking or filtering  
✅ **Always computed** - Present even when ranking disabled  
✅ **Deterministic** - No LLM, pure thresholds and logic  
✅ **Tested** - 21 unit tests covering all thresholds  

## Files

- `ranking-signals.ts` - Core implementation (buildRankingSignals)
- `ranking-signals.test.ts` - Unit tests (21 tests)
- `orchestrator.ranking.ts` - Integration + open stats computation
- `route2.orchestrator.ts` - Wiring (post-filter → signals → response)
- `orchestrator.response.ts` - Metadata attachment

## Summary

RankingSignals provides **zero-overhead observability** into ranking decisions and result pool quality. It's **deterministic, well-tested, and metadata-only** - making it safe to deploy and iterate on without affecting user-facing behavior.
