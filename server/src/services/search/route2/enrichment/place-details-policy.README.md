# Place Details Enrichment Policy (cost control)

Policy only: **no Google Place Details API calls**. Use when adding vibe/dietary extraction later.

## Decision function signature

```ts
function shouldRunPlaceDetailsEnrichment(
  intentInput: PlaceDetailsEnrichmentIntentInput,
  config: { enabled: boolean }
): boolean;

function getPlaceDetailsEnrichmentPlan(
  results: Array<{ placeId?: string }>,
  config: Pick<PlaceDetailsEnrichmentConfig, 'maxResultsToEnrich'>,
  cachedPlaceIds?: Set<string>
): PlaceDetailsEnrichmentPlan;

function decidePlaceDetailsEnrichment(
  intentInput: PlaceDetailsEnrichmentIntentInput,
  results: Array<{ placeId?: string }>,
  config: PlaceDetailsEnrichmentConfig,
  cachedPlaceIds?: Set<string>
): PlaceDetailsEnrichmentPlan;

function buildPlaceDetailsIntentInput(params: {
  dietaryPreferences?: string[];
  isKosher?: boolean | null;
  isGlutenFree?: boolean | null;
  hasVibeIntent?: boolean;
}): PlaceDetailsEnrichmentIntentInput;
```

## Config shape

```ts
// route2.config.ts → route2Config.placeDetailsEnrichment
{
  enabled: boolean;           // PLACE_DETAILS_ENRICHMENT_ENABLED !== 'false'
  maxResultsToEnrich: number; // PLACE_DETAILS_ENRICHMENT_MAX (default 5, clamp 1–10)
  cacheTtlMs: number;         // PLACE_DETAILS_CACHE_TTL_MS (default 24h)
  cacheKeyPrefix: string;     // PLACE_DETAILS_CACHE_KEY_PREFIX (default 'pd:hints')
}
```

Env: `PLACE_DETAILS_ENRICHMENT_ENABLED`, `PLACE_DETAILS_ENRICHMENT_MAX`, `PLACE_DETAILS_CACHE_TTL_MS`, `PLACE_DETAILS_CACHE_KEY_PREFIX`.

## Integration hook point

**File:** `route2.orchestrator.ts`  
**Place:** After provider enrichment (Wolt/10bis/Mishloha), before STAGE 7 BUILD RESPONSE.

1. Build `PlaceDetailsEnrichmentIntentInput` from intent + post-constraints (dietary, kosher, gluten-free, vibe).
2. Call `decidePlaceDetailsEnrichment(intentInput, finalResults, pdConfig, cachedPlaceIds)`.
3. Emit structured log `place_details_enrichment_decision` with requested, skippedReason, enrichedCount, cacheHits, cacheMisses.
4. **Future:** If `plan.requested && plan.placeIdsToEnrich.length > 0`, call Place Details for those placeIds and merge hints (TTL cache key: `{cacheKeyPrefix}:{placeId}`).

## Example logs

**Enrichment requested (dietary intent), no cache:**

```json
{
  "event": "place_details_enrichment_decision",
  "requestId": "req-abc",
  "requested": true,
  "skippedReason": null,
  "enrichedCount": 5,
  "candidateCount": 5,
  "cacheHits": 0,
  "cacheMisses": 5
}
```

**Enrichment requested, some cache hits:**

```json
{
  "event": "place_details_enrichment_decision",
  "requestId": "req-def",
  "requested": true,
  "skippedReason": null,
  "enrichedCount": 2,
  "candidateCount": 5,
  "cacheHits": 3,
  "cacheMisses": 2
}
```

**Enrichment skipped (intent does not require vibe/dietary):**

```json
{
  "event": "place_details_enrichment_decision",
  "requestId": "req-ghi",
  "requested": false,
  "skippedReason": "not_requested",
  "enrichedCount": 0,
  "candidateCount": 0,
  "cacheHits": 0,
  "cacheMisses": 0
}
```

**Enrichment requested but no candidates:**

```json
{
  "event": "place_details_enrichment_decision",
  "requestId": "req-jkl",
  "requested": true,
  "skippedReason": "no_candidates",
  "enrichedCount": 0,
  "candidateCount": 0,
  "cacheHits": 0,
  "cacheMisses": 0
}
```
