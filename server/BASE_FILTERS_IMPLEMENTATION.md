# Route2 BaseFilters LLM + Tightening - Implementation Complete

## Overview

Implemented fast LLM-based base filters resolution and deterministic tightening logic, integrated into Route2 pipeline between ROUTE_LLM and GOOGLE_MAPS stages.

## Flow

```
GATE2 → INTENT → ROUTE_LLM
                     ↓
         ┌───────────────────────┐
         │ BASE_FILTERS_LLM      │ (900ms timeout)
         │ → PreGoogleBaseFilters│
         └───────────┬───────────┘
                     ↓
         ┌───────────────────────┐
         │ TIGHTEN_FILTERS       │ (deterministic)
         │ → FinalSharedFilters  │
         └───────────┬───────────┘
                     ↓
                ctx.sharedFilters
                     ↓
              GOOGLE_MAPS → RESPONSE
```

## Files Implemented

### 1. `server/src/services/search/route2/shared/base-filters-llm.ts`

**Purpose**: Fast LLM call to resolve PreGoogleBaseFilters

**Key Features**:
- Timeout: 900ms (enforced)
- Prompt outputs ONLY JSON (no prose)
- Zod validation on LLM response
- Fallback on failure: `{language:'auto', openNow:false}`

**Function**:
```typescript
async function resolveBaseFiltersLLM(params: {
  query: string;
  route: MappingRoute;
  llmProvider: LLMProvider;
  requestId: string;
  traceId?: string;
  sessionId?: string;
}): Promise<PreGoogleBaseFilters>
```

**Prompt Rules**:
- `language`: 'he' (Hebrew primary) | 'en' (English primary) | 'auto' (mixed/unclear)
- `openNow`: true ONLY if explicit "open now" / "פתוח עכשיו"
- `regionHint`: Extract from explicit location (e.g., "Paris" → "FR") or null

**Examples**:
```json
// Query: "פיצה פתוחה עכשיו בתל אביב"
{
  "language": "he",
  "openNow": true,
  "regionHint": "IL"
}

// Query: "restaurant in Paris"
{
  "language": "en",
  "openNow": false,
  "regionHint": "FR"
}

// Query: "מסעדה איטלקית" (no location)
{
  "language": "he",
  "openNow": false,
  "regionHint": null
}
```

**Error Handling**:
- LLM timeout → fallback
- Zod validation failure → fallback
- Any error → fallback
- Log all errors for monitoring

### 2. `server/src/services/search/route2/shared/shared-filters.tighten.ts`

**Purpose**: Deterministic resolution PreGoogleBaseFilters → FinalSharedFilters

**Function**:
```typescript
function tightenSharedFilters(params: {
  base: PreGoogleBaseFilters;
  uiLanguage?: 'he' | 'en';
  gateLanguage: Gate2Language;
  defaultRegion?: string;
  requestId?: string;
}): FinalSharedFilters
```

**Resolution Logic**:

**Language** (resolved, no 'auto'):
1. `uiLanguage` if provided (highest priority)
2. `base.language` if 'he' or 'en'
3. `gateLanguage` → 'he' if 'he', else 'en'

**Region** (required, uppercase):
1. TODO: `geocode(locationText)` → countryCode
2. TODO: `reverseGeocode(userLocation)` → countryCode
3. `base.regionHint` if present
4. `defaultRegion` (fallback, usually 'IL')

**Disclaimers** (always present):
```json
{
  "hours": true,
  "dietary": true
}
```

**Example**:
```typescript
// Input
base: { language: 'auto', openNow: true, regionHint: null }
gateLanguage: 'he'
defaultRegion: 'IL'

// Output
{
  language: 'he',  // Resolved from gateLanguage
  openNow: true,
  regionCode: 'IL',  // Fallback to defaultRegion
  disclaimers: { hours: true, dietary: true }
}
```

### 3. `server/src/services/search/route2/route2.orchestrator.ts` (Modified)

**Changes**:
1. Added imports for new modules
2. Added filters resolution BETWEEN ROUTE_LLM and GOOGLE_MAPS
3. Store results in `ctx.sharedFilters`

**Integration Point** (lines ~192-218):
```typescript
// STAGE 3: ROUTE_LLM
const mapping = await executeRouteLLM(intentDecision, request, ctx);

// SHARED FILTERS: Resolve base filters via LLM
const baseFilters = await resolveBaseFiltersLLM({
  query: request.query,
  route: intentDecision.route,
  llmProvider: ctx.llmProvider,
  requestId: ctx.requestId,
  ...(ctx.traceId && { traceId: ctx.traceId }),
  ...(ctx.sessionId && { sessionId: ctx.sessionId })
});

// SHARED FILTERS: Tighten to final filters
const finalFilters = tightenSharedFilters({
  base: baseFilters,
  gateLanguage: gateResult.gate.language,
  defaultRegion: ctx.userRegionCode || 'IL',
  requestId: ctx.requestId
});

// Store in context
ctx.sharedFilters = {
  preGoogle: baseFilters,
  final: finalFilters
};

// STAGE 4: GOOGLE_MAPS
const googleResult = await executeGoogleMapsStage(mapping, request, ctx);
```

**No New Stages**: Integration happens inline, no new stage functions

## Context Updates

**Route2Context** now contains:
```typescript
ctx.sharedFilters = {
  preGoogle: {
    language: 'he' | 'en' | 'auto',
    openNow: boolean,
    regionHint?: string
  },
  final: {
    language: 'he' | 'en',
    openNow: boolean,
    regionCode: string,
    disclaimers: { hours: true, dietary: true }
  }
}
```

**Available to**:
- Google Maps stage (can apply filters)
- Response builder (can include in response)
- Future stages

## Logging

**Base Filters LLM**:
```json
{
  "event": "base_filters_llm_started",
  "query": "...",
  "route": "NEARBY"
}

{
  "event": "base_filters_llm_completed",
  "durationMs": 345,
  "language": "he",
  "openNow": true,
  "regionHint": "IL"
}

// On failure:
{
  "event": "base_filters_llm_failed",
  "error": "timeout",
  "isTimeout": true
}
```

**Tightening**:
```json
{
  "event": "shared_filters_tightened",
  "base": {
    "language": "auto",
    "openNow": false,
    "regionHint": null
  },
  "final": {
    "language": "he",
    "openNow": false,
    "regionCode": "IL"
  }
}
```

## Performance Impact

**Added Latency**:
- Base Filters LLM: ~300-900ms (capped at 900ms timeout)
- Tightening: <1ms (deterministic, no I/O)
- **Total**: ~300-900ms additional

**Cost**:
- 1 additional LLM call per search
- Minimal prompt size (~400 chars)
- Input tokens: ~150-200
- Output tokens: ~20-30

## Future Enhancements

**Not Yet Implemented** (marked as TODO):
1. Geocoding integration for `locationText`
2. Reverse geocoding for `userLocation`
3. Apply filters in Google Maps stage
4. Include `final` filters in SearchResponse
5. UI language override parameter

## Validation

✅ No TypeScript errors  
✅ No linter errors  
✅ Build passes  
✅ Minimal orchestrator changes  
✅ No new stages added  
✅ Fallback on LLM failure  
✅ Logging complete  

## Testing Recommendations

### Test Case 1: Explicit Open Now
**Query**: `"פיצה פתוחה עכשיו בתל אביב"`
**Expected**:
```json
base: { language: "he", openNow: true, regionHint: "IL" }
final: { language: "he", openNow: true, regionCode: "IL", disclaimers: {...} }
```

### Test Case 2: Foreign Location
**Query**: `"restaurant in Paris"`
**Expected**:
```json
base: { language: "en", openNow: false, regionHint: "FR" }
final: { language: "en", openNow: false, regionCode: "FR", disclaimers: {...} }
```

### Test Case 3: No Explicit Filters
**Query**: `"מסעדה איטלקית"`
**Expected**:
```json
base: { language: "he", openNow: false, regionHint: null }
final: { language: "he", openNow: false, regionCode: "IL", disclaimers: {...} }
```

### Test Case 4: LLM Timeout
**Scenario**: LLM takes >900ms
**Expected**:
```json
base: { language: "auto", openNow: false }  // Fallback
final: { language: "he", openNow: false, regionCode: "IL", disclaimers: {...} }
```

## Files Summary

| File | Status | Lines | Purpose |
|------|--------|-------|---------|
| `base-filters-llm.ts` | ✅ NEW | 145 | LLM call with 900ms timeout |
| `shared-filters.tighten.ts` | ✅ NEW | 68 | Deterministic tightening |
| `route2.orchestrator.ts` | ✅ MODIFIED | +27 | Integration point |

**Status**: ✅ **COMPLETE - Ready for testing**
