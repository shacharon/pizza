# Ranking Profile Selection Schema Fix + Score Breakdown Logs

## Summary

Fixed schema validation bug causing ranking profile selection to fail, and added minimal score breakdown logging for debugging.

## Root Cause

**Bug:** `schema-converter.ts` used `target: 'openApi3'` in `zodToJsonSchema()`, which produces an OpenAPI-formatted schema where the root `type` is `undefined` instead of `"object"`. OpenAI's Structured Outputs API requires standard JSON Schema with `type: "object"` at the root level.

**Why it failed:** The validator in `schema-converter.ts` line 108 checks `if (jsonSchema.type !== 'object')` and throws an error. OpenAPI 3 schemas wrap the actual JSON Schema differently, causing `jsonSchema.type` to be `undefined`.

## Changes Made

### 1. Fixed Schema Conversion (schema-converter.ts)

**File:** `server/src/llm/schema-converter.ts`

**Change:** Line 43 - Changed target from `'openApi3'` to `'jsonSchema7'`

```typescript
// BEFORE
const jsonSchema = zodToJsonSchema(schema as any, {
  target: 'openApi3',
  $refStrategy: 'none'
}) as any;

// AFTER
const jsonSchema = zodToJsonSchema(schema as any, {
  target: 'jsonSchema7',  // ← Fixed: Use JSON Schema Draft 7 for OpenAI
  $refStrategy: 'none'
}) as any;
```

**Impact:** All LLM calls using Zod schemas now generate valid JSON Schema objects with `type: "object"` at root level.

### 2. Added Score Breakdown Function (results-ranker.ts)

**File:** `server/src/services/search/route2/ranking/results-ranker.ts`

**Added:**
- `ScoreBreakdown` interface (exported)
- `computeScoreBreakdown()` function (exported)

**Purpose:** Compute and expose detailed ranking score components for logging/debugging without changing the ranking algorithm.

**Returns:**
```typescript
{
  placeId: string;
  rating: number | null;
  userRatingCount: number | null;
  distanceMeters: number | null;  // In meters (km * 1000)
  openNow: boolean | 'UNKNOWN' | null;
  weights: RankingWeights;
  components: {
    ratingScore: number;      // Weighted rating component
    reviewsScore: number;     // Weighted reviews component
    distanceScore: number;    // Weighted distance component
    openBoostScore: number;   // Weighted open/closed component
  };
  totalScore: number;         // Sum of all components
}
```

### 3. Added Score Breakdown Logging (orchestrator.ranking.ts)

**File:** `server/src/services/search/route2/orchestrator.ranking.ts`

**Changes:**
1. Import `computeScoreBreakdown` from `results-ranker.ts`
2. After `ranking_output_order` log, compute breakdown for top 10 results
3. Emit new log event: `ranking_score_breakdown`

**Location:** Line ~145, after ranked results are produced

**Log format:**
```typescript
{
  requestId: string;
  event: 'ranking_score_breakdown';
  profile: RankingProfile;  // e.g., 'BALANCED', 'QUALITY', 'NEARBY'
  top10: ScoreBreakdown[];  // Array of 10 breakdown objects
}
```

## Example Logs

### Before (Schema Error)

```json
{
  "level": "error",
  "msg": "[LLM] Invalid JSON Schema: root type must be \"object\"",
  "hasProperties": false
}
{
  "level": "error",
  "event": "ranking_profile_failed",
  "error": "Invalid JSON Schema: root type is \"undefined\", expected \"object\"",
  "msg": "[RANKING] Failed to select profile, using BALANCED fallback"
}
```

### After (Schema Fixed + Score Breakdown)

```json
{
  "level": "info",
  "event": "ranking_profile_selected",
  "profile": "QUALITY",
  "weights": {
    "rating": 0.4,
    "reviews": 0.3,
    "distance": 0.2,
    "openBoost": 0.1
  },
  "msg": "[RANKING] Profile selected by LLM"
}
{
  "level": "info",
  "event": "ranking_output_order",
  "count": 20,
  "first10": [
    {"idx": 0, "placeId": "ChIJ...", "rating": 4.6, "userRatingCount": 8849},
    {"idx": 1, "placeId": "ChIJ...", "rating": 4.8, "userRatingCount": 1022},
    ...
  ],
  "msg": "[RANKING] Output order (ranked)"
}
{
  "level": "info",
  "event": "ranking_score_breakdown",
  "profile": "QUALITY",
  "top10": [
    {
      "placeId": "ChIJpUyrouW2AhURRs2jQaW45D4",
      "rating": 4.6,
      "userRatingCount": 8849,
      "distanceMeters": 3245,
      "openNow": true,
      "weights": {"rating": 0.4, "reviews": 0.3, "distance": 0.2, "openBoost": 0.1},
      "components": {
        "ratingScore": 0.368,    // 0.4 * (4.6/5)
        "reviewsScore": 0.239,   // 0.3 * log10(8850)/5
        "distanceScore": 0.061,  // 0.2 * 1/(1+3.245)
        "openBoostScore": 0.1    // 0.1 * 1 (open=true)
      },
      "totalScore": 0.768
    },
    {
      "placeId": "ChIJ_S7mBQC7AhURwexf1P3Wrp8",
      "rating": 4.8,
      "userRatingCount": 1022,
      "distanceMeters": 5120,
      "openNow": null,
      "weights": {"rating": 0.4, "reviews": 0.3, "distance": 0.2, "openBoost": 0.1},
      "components": {
        "ratingScore": 0.384,    // 0.4 * (4.8/5)
        "reviewsScore": 0.181,   // 0.3 * log10(1023)/5
        "distanceScore": 0.033,  // 0.2 * 1/(1+5.12)
        "openBoostScore": 0.05   // 0.1 * 0.5 (open=unknown)
      },
      "totalScore": 0.648
    },
    ...
  ],
  "msg": "[RANKING] Score breakdown for top 10 results"
}
```

## No Behavior Changes

✅ Ranking algorithm unchanged (same weights, same normalization formulas)
✅ Ranking order unchanged (same sorting logic, same tie-breakers)
✅ Profile fallback unchanged (still falls back to BALANCED on error)
✅ Existing logs unchanged (kept `ranking_input_order` and `ranking_output_order`)
✅ No new dependencies or helpers files

## Testing Recommendations

1. **Verify Schema Fix:**
   - Search for "ranking_profile_failed" in logs → should be GONE
   - Search for "ranking_profile_selected" in logs → should appear with actual profile (not always BALANCED)
   - Verify different profiles are selected based on query intent

2. **Verify Score Breakdown:**
   - Check logs for event `ranking_score_breakdown`
   - Verify top 10 results have detailed score components
   - Verify `totalScore` matches sum of components
   - Verify distanceMeters is in meters (not lat/lng)

3. **Regression Check:**
   - Verify ranking output order is identical to before (same placeIds in same order)
   - Verify no new errors in schema validation
   - Verify fallback behavior still works if LLM call fails (non-schema errors)

## Files Modified

1. `server/src/llm/schema-converter.ts` - Fixed JSON Schema target
2. `server/src/services/search/route2/ranking/results-ranker.ts` - Added score breakdown function
3. `server/src/services/search/route2/orchestrator.ranking.ts` - Added score breakdown logging

## Files NOT Modified

- No changes to ranking weights or defaults
- No changes to score computation formulas
- No changes to profile selection prompts
- No changes to fallback behavior (BALANCED remains fallback)
