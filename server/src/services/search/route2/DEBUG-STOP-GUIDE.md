# Route2 Debug STOP-after-Stage Feature

## Overview

The debug STOP-after-stage feature allows developers to force the Route2 pipeline to return early after specific stages for debugging purposes. This is useful for:

- Inspecting intermediate pipeline state
- Debugging LLM routing decisions
- Analyzing query transformations
- Investigating filter applications
- Testing pipeline stages in isolation

## Supported Stages

| Stage          | Description                          | Artifacts Included                                    |
| -------------- | ------------------------------------ | ----------------------------------------------------- |
| `gate2`        | After gate2 validation (food signal) | Full gate result                                      |
| `intent`       | After intent routing decision        | Gate + intent results                                 |
| `route_llm`    | After route-LLM mapping              | Gate + intent + mapping summary                       |
| `google`       | After Google Maps API results        | + Google count, duration, first 5 placeIds            |
| `cuisine`      | After cuisine enforcement            | + Cuisine flags, counts, scores indicator             |
| `post_filters` | After post-constraints filters       | + Post-filter stats, applied filters, relaxation info |
| `ranking`      | After ranking/reordering             | + Ranking applied flag, counts, order explanation     |
| `response`     | Before final response building       | All summary artifacts (lightweight)                   |

## Usage

### HTTP Request

```bash
POST /api/v1/search
Content-Type: application/json

{
  "query": "sushi in tel aviv",
  "debug": {
    "stopAfter": "google"
  }
}
```

### Response Format

```json
{
  "requestId": "req-1234567890-abc123",
  "sessionId": "session-xyz",
  "query": {
    "original": "sushi in tel aviv",
    "parsed": null,
    "language": "en"
  },
  "results": [],
  "chips": [],
  "assist": {
    "type": "debug",
    "message": "DEBUG STOP after google"
  },
  "meta": {
    "tookMs": 1234,
    "mode": "textsearch",
    "appliedFilters": [],
    "confidence": 0.95,
    "source": "route2_debug_stop",
    "failureReason": "NONE"
  },
  "debug": {
    "stopAfter": "google",
    "gate": { /* full gate result */ },
    "intent": { /* full intent result */ },
    "mapping": {
      "providerMethod": "textSearch",
      "region": "IL",
      "language": "en"
    },
    "google": {
      "count": 20,
      "durationMs": 456,
      "providerMethod": "textSearch",
      "firstFivePlaceIds": ["ChIJabc...", "ChIJdef...", ...]
    }
  }
}
```

## Implementation Details

### Data Flow

1. **Request → Controller**

   ```typescript
   // search.controller.ts
   const route2Context: Route2Context = {
     // ... other fields
     ...(queryData.debug &&
       typeof queryData.debug === "object" &&
       queryData.debug.stopAfter && {
         debug: { stopAfter: queryData.debug.stopAfter },
       }),
   };
   ```

2. **Context → Orchestrator**

   ```typescript
   // route2.orchestrator.ts
   async function searchRoute2Internal(request: SearchRequest, ctx: Route2Context) {
     // ... stage execution

     if (shouldDebugStop(ctx, 'google')) {
       return buildDebugResponse(...);
     }

     // ... continue pipeline
   }
   ```

3. **Helper Check**
   ```typescript
   // orchestrator.helpers.ts
   export function shouldDebugStop(
     ctx: Route2Context,
     stopAfter: DebugStage
   ): boolean {
     return ctx.debug?.stopAfter === stopAfter;
   }
   ```

### Debug Artifacts

Each stage includes progressively more artifacts:

- **Early stages (gate2, intent, route_llm)**: Full objects for complete inspection
- **Google stage**: Lightweight summary (count + first 5 IDs) to avoid large payloads
- **Later stages (cuisine, post_filters, ranking)**: Statistics and flags only

This ensures debug responses remain small and fast, even for large result sets.

### Safety Guarantees

1. **No Business Logic Changes**: Only early returns, no modifications to pipeline behavior
2. **Promise Cleanup**: Parallel promises still drained in `finally` block
3. **Type Safety**: `DebugStage` enum enforces valid stage names
4. **Production Safe**: Lightweight responses prevent memory/bandwidth issues
5. **No Side Effects**: Helper function is stateless and pure

## Example Use Cases

### 1. Inspect Route-LLM Mapping

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "מסעדות איטלקיות בתל אביב",
    "debug": { "stopAfter": "route_llm" }
  }'
```

**Use case**: Verify how the LLM interprets Hebrew queries and maps to Google API parameters.

### 2. Debug Google Results

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "best sushi near me",
    "userLocation": { "lat": 32.0853, "lng": 34.7818 },
    "debug": { "stopAfter": "google" }
  }'
```

**Use case**: Check raw Google Maps API results before any filtering/ranking.

### 3. Analyze Cuisine Enforcement

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "kosher chinese food",
    "debug": { "stopAfter": "cuisine" }
  }'
```

**Use case**: Inspect how LLM-based cuisine enforcement filters results.

### 4. Review Post-Filter Effects

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "open restaurants now",
    "filters": { "openNow": true },
    "debug": { "stopAfter": "post_filters" }
  }'
```

**Use case**: See which filters were applied and how many results were removed.

### 5. Check Ranking Logic

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "romantic dinner place",
    "debug": { "stopAfter": "ranking" }
  }'
```

**Use case**: Verify ranking was applied and understand result ordering.

## Limitations

1. **Sync Mode Only**: Debug stop works best with `mode=sync` (default). Async mode works but requires polling.
2. **No Full Results**: Google and later stages don't include full place objects (only summaries).
3. **No State Persistence**: Each request is independent; no cross-request debug state.
4. **Type Coercion**: Debug responses use `as any` for compatibility with SearchResponse type.

## Best Practices

1. **Use Specific Stages**: Stop at the earliest relevant stage to minimize overhead
2. **Combine with Logs**: Cross-reference debug artifacts with structured logs (use `requestId`)
3. **Test in Development**: Don't enable in production without understanding performance impact
4. **Iterate Quickly**: Use sync mode for fastest debugging iteration

## Code Locations

| File                      | Purpose                                    |
| ------------------------- | ------------------------------------------ |
| `search-request.dto.ts`   | Zod schema for `debug` field               |
| `types.ts`                | Route2Context interface with debug field   |
| `orchestrator.helpers.ts` | `shouldDebugStop()` helper + documentation |
| `route2.orchestrator.ts`  | All 8 debug stop points                    |
| `search.controller.ts`    | Request → Context debug field mapping      |

## Testing

### Manual Test

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Test debug stop
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza", "debug": {"stopAfter": "intent"}}' | jq .
```

### Expected Output

```json
{
  "requestId": "req-...",
  "results": [],
  "assist": {
    "type": "debug",
    "message": "DEBUG STOP after intent"
  },
  "meta": {
    "source": "route2_debug_stop"
  },
  "debug": {
    "stopAfter": "intent",
    "gate": { ... },
    "intent": { ... }
  }
}
```

## Future Enhancements

Potential improvements:

1. **Stage Timing**: Add per-stage duration metrics to debug artifacts
2. **Diff Mode**: Compare artifacts between two queries side-by-side
3. **Export Format**: Support JSON/CSV export for analysis tools
4. **Live Streaming**: Stream stage artifacts via WebSocket as they complete
5. **Conditional Stops**: Stop only if certain conditions are met (e.g., `stopIf: { confidence < 0.7 }`)

---

**Last Updated**: January 2026  
**Author**: Route2 Team  
**Status**: Production Ready
