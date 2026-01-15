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
└── stages/
    ├── gate2.stage.ts           # Stage 1: Pre-filter
    ├── intent2.stage.ts         # Stage 2: Intent extraction
    ├── route-llm.stage.ts       # Stage 3: Routing decision
    └── google-maps.stage.ts     # Stage 4: Google search
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
[ROUTE2] Pipeline completed { requestId, pipelineVersion:"route2", event:"pipeline_completed", durationMs:X }
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
