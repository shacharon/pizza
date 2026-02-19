# ROUTE2 Pipeline

**Status:** SKELETON IMPLEMENTED ✅

ROUTE2 is a clean, new search pipeline with no V1/V2 dependencies.

## Architecture

```
POST /api/v1/search
  ↓
search.controller.ts (checks ROUTE2_ENABLED)
  ↓
route2.orchestrator.ts
  ↓
┌─────────────────────────────────────────┐
│ 1. GATE2        (Pre-filter)            │
│ 2. INTENT2      (Extract food/location) │
│ 3. ROUTE_LLM    (Determine mode)        │
│ 4. GOOGLE_MAPS  (Execute search)        │
│ 5. POST_FILTER  (Deterministic filters) │
└─────────────────────────────────────────┘
  ↓
SearchResponse
```

## Files Structure

```
route2/
├── types.ts                      # Type definitions
├── route2.orchestrator.ts        # Main pipeline orchestrator
├── index.ts                      # Exports
├── stages/
│   ├── gate2.stage.ts           # Stage 1: Pre-filter
│   ├── intent2.stage.ts         # Stage 2: Intent extraction
│   ├── route-llm.stage.ts       # Stage 3: Routing decision
│   └── google-maps.stage.ts     # Stage 4: Google search
└── post-filters/
    ├── post-results.filter.ts   # Stage 5: Post-result filtering (openNow)
    └── __tests__/
        ├── post-results.filter.test.ts
        └── integration.test.ts
```

## Feature Flag

**Default:** ENABLED (ROUTE2 is the primary path)

```bash
# To disable ROUTE2 and use V1:
ROUTE2_ENABLED=false
```

## Current Status: SKELETON

All stages are **placeholders** with:
- ✅ Proper TypeScript types
- ✅ Structured logging (stage_started/stage_completed)
- ✅ Valid SearchResponse output
- ❌ No real LLM logic yet
- ❌ No Google Places API calls yet
- ❌ No heuristics/parsing yet

## Expected Logs

When ROUTE2 runs, you'll see:

```
[ROUTE2] Pipeline selected { requestId, pipelineVersion:"route2", event:"pipeline_selected" }
[ROUTE2] gate2 started { requestId, pipelineVersion:"route2", stage:"gate2", event:"stage_started" }
[ROUTE2] gate2 completed { requestId, pipelineVersion:"route2", stage:"gate2", event:"stage_completed", durationMs:X }
[ROUTE2] intent2 started { requestId, pipelineVersion:"route2", stage:"intent2", event:"stage_started" }
[ROUTE2] intent2 completed { requestId, pipelineVersion:"route2", stage:"intent2", event:"stage_completed", durationMs:X }
[ROUTE2] route_llm started { requestId, pipelineVersion:"route2", stage:"route_llm", event:"stage_started" }
[ROUTE2] route_llm completed { requestId, pipelineVersion:"route2", stage:"route_llm", event:"stage_completed", durationMs:X }
[ROUTE2] google_maps started { requestId, pipelineVersion:"route2", stage:"google_maps", event:"stage_started" }
[ROUTE2] google_maps completed { requestId, pipelineVersion:"route2", stage:"google_maps", event:"stage_completed", durationMs:X }
[ROUTE2] Post-filters applied { requestId, pipelineVersion:"route2", event:"post_filter_applied", openNow:true/false, stats:{before:N, after:M} }
[ROUTE2] Pipeline completed { requestId, pipelineVersion:"route2", event:"pipeline_completed", durationMs:X, resultCount:M }
```

## Next Steps

1. Implement real GATE2 logic (LLM-based pre-filter)
2. Implement real INTENT2 logic (LLM intent extraction)
3. Implement real ROUTE_LLM logic (deterministic routing)
4. Implement real GOOGLE_MAPS logic (PlacesProviderService integration)
5. Add response building with proper ranking/filtering

## Testing

```bash
# Start server
npm run dev

# Test ROUTE2 (default)
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza in tel aviv"}'

# Test V1 (set ROUTE2_ENABLED=false)
ROUTE2_ENABLED=false npm run dev
```

## Post-Result Filtering

**Stage 5: POST_FILTER** applies deterministic filters to results after Google API call.

### Open/Closed State Filter (Tri-State)

**OpenState Filter** supports three modes:
- `ANY`: No filtering (default - return all results)
- `OPEN_NOW`: Return only currently open places
- `CLOSED_NOW`: Return only currently closed places

**Filtering Rules:**
- `ANY` → no filtering
- `OPEN_NOW` → keep only places where `currentOpeningHours?.openNow === true`
- `CLOSED_NOW` → keep only places where `currentOpeningHours?.openNow === false`
- Missing `currentOpeningHours` → filtered out for `OPEN_NOW` and `CLOSED_NOW` (defensive)

**Trigger Examples:**
- "open restaurants" / "פתוח עכשיו" → `openState: OPEN_NOW`
- "closed restaurants" / "סגור עכשיו" / "cloesed" (typo) → `openState: CLOSED_NOW`
- "pizza in tel aviv" → `openState: ANY` (no filter)

**Flow:**
1. `base-filters-llm.ts` detects open/closed intent → sets `openState`
2. `shared-filters.tighten.ts` copies to `FinalSharedFilters`
3. `google-maps.stage.ts` executes search (no filter sent to Google)
4. `post-results.filter.ts` filters results server-side
5. Filtered results flow to response, WebSocket, and JobStore

**Example:**
```typescript
// OPEN_NOW: Input 5 results (2 open, 2 closed, 1 unknown)
// Output: 2 results (only open)
{
  "resultsFiltered": [...],
  "applied": { "openState": "OPEN_NOW" },
  "stats": { "before": 5, "after": 2 }
}

// CLOSED_NOW: Input 5 results (2 open, 2 closed, 1 unknown)
// Output: 2 results (only closed)
{
  "resultsFiltered": [...],
  "applied": { "openState": "CLOSED_NOW" },
  "stats": { "before": 5, "after": 2 }
}
```

**Tests:**
```bash
# Tri-state unit tests
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-tristate.test.ts
```


