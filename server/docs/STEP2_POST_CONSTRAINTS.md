# ✅ Step 2 Complete: Post-Constraints Stage

## File Created

### `server/src/services/search/route2/stages/post-constraints/post-constraints.stage.ts`

**Purpose**: LLM stage that extracts post-Google constraints from user query

**Function Signature**:
```typescript
async function executePostConstraintsStage(
  request: SearchRequest,
  context: Route2Context
): Promise<PostConstraints>
```

---

## Implementation Details

### 1. **LLM Call**
```typescript
const response = await llmProvider.completeJSON(
  messages,
  PostConstraintsSchema,  // Zod validation
  {
    temperature: 0,
    timeout: 3500,  // 3.5 seconds
    stage: 'post_constraints',
    promptVersion, promptHash, schemaHash
  },
  POST_CONSTRAINTS_JSON_SCHEMA  // Static schema for OpenAI
);
```

### 2. **Timing Instrumentation**
- ✅ `startStage(context, 'post_constraints', { queryLen, queryHash })`
- ✅ `endStage(context, 'post_constraints', startTime)`
- ✅ Duration stored in `context.timings.postconstraintsMs`

### 3. **Logging Events**
- ✅ `stage_started` - With queryLen, queryHash
- ✅ `stage_completed` - With extracted constraints + token usage
- ✅ `constraints_extracted` - Detailed constraint breakdown
- ✅ `stage_failed` - On error/timeout with fallback notice

### 4. **Error Handling**
- ✅ Try-catch around entire function
- ✅ On any error → returns `buildDefaultPostConstraints()` (all-null)
- ✅ Logs warning with error message + timeout detection
- ✅ Non-fatal (doesn't crash pipeline)

---

## Example Logs

### Success Case
```json
{
  "event": "stage_started",
  "stage": "post_constraints",
  "queryLen": 25,
  "queryHash": "a3f2b4c6d8e1"
}

{
  "event": "stage_completed",
  "stage": "post_constraints",
  "durationMs": 1234,
  "openState": "OPEN_NOW",
  "priceLevel": null,
  "isKosher": true,
  "hasAccessibleReq": false,
  "hasParkingReq": false,
  "hasOpenAt": false,
  "hasOpenBetween": false,
  "tokenUsage": {
    "input": 245,
    "output": 42,
    "total": 287,
    "model": "gpt-4o-mini"
  }
}

{
  "event": "constraints_extracted",
  "stage": "post_constraints",
  "constraints": {
    "openState": "OPEN_NOW",
    "hasOpenAt": false,
    "hasOpenBetween": false,
    "priceLevel": null,
    "isKosher": true,
    "requirements": {
      "accessible": null,
      "parking": null
    }
  },
  "msg": "[ROUTE2] Post-constraints extracted"
}
```

### Error/Timeout Case
```json
{
  "event": "stage_failed",
  "stage": "post_constraints",
  "error": "Request timeout after 3500ms",
  "isTimeout": true,
  "fallback": "default_constraints",
  "msg": "[ROUTE2] Post-constraints extraction failed, using defaults"
}

// Returns:
{
  "openState": null,
  "openAt": null,
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "requirements": {
    "accessible": null,
    "parking": null
  }
}
```

---

## Integration Point (Step 3)

### How to Call (in orchestrator)
```typescript
import { executePostConstraintsStage } from './stages/post-constraints/post-constraints.stage.js';

// Inside route2.orchestrator.ts
const postConstraints = await executePostConstraintsStage(request, context);

// Store in context for post-filters
context.postConstraints = postConstraints;
```

### Timing in Pipeline
```
GATE2              ~800ms
INTENT             ~600ms
BASE_FILTERS      ~1200ms  (parallel candidate)
POST_CONSTRAINTS  ~1200ms  ← NEW (parallel candidate)
ROUTE_LLM         ~1500ms
GOOGLE_MAPS       ~400ms
POST_FILTERS      ~3ms     ← Uses postConstraints here
```

**Optimization**: POST_CONSTRAINTS can run in parallel with BASE_FILTERS (both analyze same query)

---

## Differences from BASE_FILTERS

| Aspect | BASE_FILTERS | POST_CONSTRAINTS |
|--------|--------------|------------------|
| **Fields** | language, openState, openAt, openBetween, regionHint | openState, openAt, openBetween, priceLevel, isKosher, requirements |
| **Output** | PreGoogleBaseFilters | PostConstraints |
| **Applied** | Pre-Google (language/region) + Post (opening hours) | Post-Google only |
| **Timeout** | 4000ms | 3500ms |
| **Fallback** | Used by filter resolver | All-null defaults |
| **Parallelizable** | Yes (with POST_CONSTRAINTS) | Yes (with BASE_FILTERS) |

---

## Build Status

✅ **TypeScript compilation passes**
✅ **No linter errors**
✅ **Proper error handling**
✅ **Timing instrumentation complete**
✅ **Ready for orchestrator integration**

---

## Testing

### Manual Test (after Step 3)
```bash
# Query with constraints
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "cheap kosher pizza open now",
    "sessionId": "test"
  }'

# Expected in logs:
# - stage_started: post_constraints
# - stage_completed: openState=OPEN_NOW, priceLevel=1, isKosher=true
```

### Unit Test Template
```typescript
import { executePostConstraintsStage } from './post-constraints.stage.js';

describe('Post-Constraints Stage', () => {
  it('extracts openState=OPEN_NOW from Hebrew query', async () => {
    const request = { query: 'פתוחות עכשיו', sessionId: 'test' };
    const context = {
      requestId: 'test-123',
      llmProvider: mockLLMProvider,
      startTime: Date.now()
    };

    const result = await executePostConstraintsStage(request, context);

    expect(result.openState).toBe('OPEN_NOW');
    expect(result.priceLevel).toBe(null);
  });

  it('returns defaults on timeout', async () => {
    const mockLLM = {
      completeJSON: jest.fn().mockRejectedValue(new Error('timeout'))
    };
    const context = {
      requestId: 'test-123',
      llmProvider: mockLLM,
      startTime: Date.now()
    };

    const result = await executePostConstraintsStage(request, context);

    expect(result).toEqual(buildDefaultPostConstraints());
  });
});
```

---

## Next Steps (Step 3)

1. ✅ Wire into `route2.orchestrator.ts`
2. ✅ Store result in context: `context.postConstraints = ...`
3. ✅ Pass to post-filters stage
4. ✅ Add to pipeline timing decomposition
5. ✅ Optional: Run in parallel with BASE_FILTERS

---

## Performance Considerations

### Current (Sequential)
```
BASE_FILTERS (4000ms) → POST_CONSTRAINTS (3500ms) = ~7500ms
```

### Optimized (Parallel)
```
Promise.all([
  BASE_FILTERS (4000ms),
  POST_CONSTRAINTS (3500ms)
]) = ~4000ms (max of both)

Savings: ~3500ms
```

**Recommendation**: Execute in parallel with BASE_FILTERS in Step 3.

---

## File Locations

```
server/src/services/search/route2/
├── stages/
│   └── post-constraints/
│       └── post-constraints.stage.ts  ← NEW (Step 2)
├── shared/
│   └── post-constraints.types.ts      ← (Step 1)
└── prompts/
    └── post-constraints.prompt.ts     ← (Step 1)
```
