# Cuisine Enforcement Implementation

## Overview

Implemented LLM-only enforcement for explicit cuisine queries (e.g., "מסעדות איטלקיות בגדרה") to ensure results actually match the requested cuisine.

**Key Principle**: NO hardcoded cuisine lists or deterministic keyword tables. Pure LLM understanding of cuisine signals via name/types/address.

## Architecture

### Step A: Extended TextSearch Mapper Output

**Modified Files:**
- `server/src/services/search/route2/stages/route-llm/schemas.ts`
- `server/src/services/search/route2/stages/route-llm/static-schemas.ts`
- `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`

**Schema Extension:**
```typescript
export const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1),
  // NEW: Cuisine enforcement fields
  requiredTerms: z.array(z.string()).default([]),
  preferredTerms: z.array(z.string()).default([]),
  strictness: z.enum(['STRICT', 'RELAX_IF_EMPTY']).default('RELAX_IF_EMPTY'),
  typeHint: z.enum(['restaurant', 'cafe', 'bar', 'any']).default('restaurant')
}).strict();
```

**LLM Prompt Rules:**
```
6) If the query contains EXPLICIT cuisine intent (examples: "איטלקיות", "Italian", "sushi"):
   - Set strictness = "STRICT"
   - Set requiredTerms = [cuisine term(s) from query]
   - Set preferredTerms = [related terms if applicable]
   
7) If no explicit cuisine (generic query like "מסעדות בחיפה"):
   - Set strictness = "RELAX_IF_EMPTY"
   - Leave requiredTerms = []
```

### Step B: New Stage - Cuisine Enforcer (LLM)

**New Files:**
- `server/src/services/search/route2/stages/cuisine-enforcer/cuisine-enforcer.schema.ts`
- `server/src/services/search/route2/stages/cuisine-enforcer/cuisine-enforcer.service.ts`
- `server/src/services/search/route2/stages/cuisine-enforcer/cuisine-enforcer.test.ts`
- `server/src/services/search/route2/stages/cuisine-enforcer/index.ts`

**Input:**
```typescript
interface CuisineEnforcerInput {
  requiredTerms: string[];
  preferredTerms: string[];
  strictness: 'STRICT' | 'RELAX_IF_EMPTY';
  places: PlaceInput[];  // from Google Maps
}
```

**Output:**
```typescript
interface CuisineEnforcementResponse {
  keepPlaceIds: string[];  // in best-first order
  relaxApplied: boolean;
  relaxStrategy: 'none' | 'fallback_preferred' | 'drop_required_once';
}
```

**LLM Logic:**
- **STRICT mode**: Keep only places that STRONGLY match requiredTerms via name/types/address signals
- **Relaxation**: If keepPlaceIds.length < 5, apply relaxation ONCE:
  - Try "fallback_preferred": include places matching preferredTerms
  - If still < 5, try "drop_required_once": relax to broader cuisine category
- **RELAX_IF_EMPTY mode**: Prioritize requiredTerms but keep top places even if no strong match
- Always return keepPlaceIds in best-first order

### Step C: Integration into Orchestrator

**Modified Files:**
- `server/src/services/search/route2/route2.orchestrator.ts`
- `server/src/services/search/route2/orchestrator.response.ts`
- `server/src/lib/llm/llm-purpose.ts`
- `server/src/lib/llm/llm-config.ts`

**Pipeline Position:**
```
GATE → INTENT → ROUTE_LLM → GOOGLE_MAPS → [CUISINE_ENFORCER] → POST_FILTERS → RANKING → RESPONSE
```

**Integration Logic:**
```typescript
// After Google results fetched (line 340+)
if (mapping.providerMethod === 'textSearch' && 
    mapping.requiredTerms && 
    mapping.requiredTerms.length > 0) {
  
  const enforcementResult = await executeCuisineEnforcement(
    { requiredTerms, preferredTerms, strictness, places },
    ctx.llmProvider,
    requestId
  );
  
  // Apply enforcement: filter and reorder by keepPlaceIds
  if (enforcementResult.keepPlaceIds.length > 0) {
    enforcedResults = enforcementResult.keepPlaceIds
      .map(placeId => googleResult.results.find(r => r.placeId === placeId))
      .filter(r => r !== undefined);
  }
}
```

**Response Metadata:**
```typescript
meta: {
  // ... existing fields
  cuisineEnforcementFailed: boolean  // true if enforcement failed (non-blocking)
}
```

## Logging Events

### New Events

1. **cuisine_enforcement_started**
```json
{
  "requestId": "req-xxx",
  "event": "cuisine_enforcement_started",
  "strictness": "STRICT",
  "requiredTerms": ["איטלקית", "איטלקי"],
  "preferredTerms": ["פסטה", "פיצה"],
  "countIn": 25
}
```

2. **cuisine_enforcement_completed**
```json
{
  "requestId": "req-xxx",
  "event": "cuisine_enforcement_completed",
  "countIn": 25,
  "countOut": 12,
  "relaxApplied": false,
  "relaxStrategy": "none"
}
```

3. **cuisine_enforcement_llm_call**
```json
{
  "requestId": "req-xxx",
  "event": "cuisine_enforcement_llm_call",
  "version": "cuisine_enforcer_v1",
  "strictness": "STRICT",
  "requiredTermsCount": 2,
  "preferredTermsCount": 2,
  "placesCount": 25,
  "model": "gpt-4o-mini"
}
```

4. **cuisine_enforcement_empty** (warning)
```json
{
  "requestId": "req-xxx",
  "event": "cuisine_enforcement_empty",
  "strictness": "STRICT"
}
```

5. **cuisine_enforcement_failed_after_relax** (warning)
```json
{
  "requestId": "req-xxx",
  "event": "cuisine_enforcement_failed_after_relax",
  "relaxStrategy": "fallback_preferred"
}
```

## Environment Variables

New optional configuration:
```bash
# Model override for cuisine enforcer (defaults to LLM_DEFAULT_MODEL)
FILTER_ENFORCER_MODEL=gpt-4o-mini

# Timeout override for cuisine enforcer (defaults to 4000ms)
FILTER_ENFORCER_TIMEOUT_MS=4000
```

## Testing

### Unit Tests

Run cuisine enforcer tests:
```bash
cd server
npm test -- cuisine-enforcer.test.ts
```

**Test Cases:**
1. ✅ STRICT mode keeps only Italian restaurants when "Italian" required
2. ✅ Relaxation applied when STRICT returns < 5 results
3. ✅ RELAX_IF_EMPTY keeps all places when no required terms
4. ✅ Empty result when no places provided
5. ✅ Graceful failure returns all places on LLM error

### Integration Testing

**Example Query:** "מסעדות איטלקיות בגדרה"

Expected behavior:
1. TextSearch mapper identifies explicit cuisine:
   - `requiredTerms: ["איטלקית", "איטלקי"]`
   - `strictness: "STRICT"`
2. Google returns 25 places (Italian + non-Italian)
3. Cuisine enforcer filters to ~12 Italian places
4. Results show only Italian restaurants
5. Logs show `cuisine_enforcement_completed` with `countOut: 12`

**Example Query:** "מסעדות בחיפה" (generic)

Expected behavior:
1. TextSearch mapper:
   - `requiredTerms: []`
   - `strictness: "RELAX_IF_EMPTY"`
2. Cuisine enforcer skips (early exit)
3. All places returned (no filtering)

## Code Diffs

### 1. schemas.ts - Add enforcement fields

```diff
export const TextSearchLLMResponseSchema = z.object({
  providerMethod: z.literal('textSearch'),
  textQuery: z.string().min(1),
  region: z.string().regex(/^[A-Z]{2}$/),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  reason: z.string().min(1),
+ // Cuisine enforcement fields (LLM-only, no hardcoded rules)
+ requiredTerms: z.array(z.string()).default([]),
+ preferredTerms: z.array(z.string()).default([]),
+ strictness: z.enum(['STRICT', 'RELAX_IF_EMPTY']).default('RELAX_IF_EMPTY'),
+ typeHint: z.enum(['restaurant', 'cafe', 'bar', 'any']).default('restaurant')
}).strict();
```

### 2. textsearch.mapper.ts - Update prompt

```diff
const TEXTSEARCH_MAPPER_PROMPT = `...
+CUISINE ENFORCEMENT (NO HARDCODED RULES - USE LLM UNDERSTANDING ONLY):
+6) If the query contains EXPLICIT cuisine intent (examples: "איטלקיות", "Italian", "sushi"):
+   - Set strictness = "STRICT"
+   - Set requiredTerms = [cuisine term(s) from query]
+   - Set preferredTerms = [related terms if applicable]
+   - Set typeHint based on query context
+   
+7) If no explicit cuisine:
+   - Set strictness = "RELAX_IF_EMPTY"
+   - Leave requiredTerms = []
`;
```

### 3. route2.orchestrator.ts - Integrate enforcer

```diff
+import { executeCuisineEnforcement } from './stages/cuisine-enforcer/index.js';

+// STAGE 5.5: CUISINE ENFORCEMENT (LLM-based post-Google filtering)
+let enforcedResults = googleResult.results;
+let cuisineEnforcementFailed = false;
+
+if (mapping.providerMethod === 'textSearch' && 
+    mapping.requiredTerms && 
+    mapping.requiredTerms.length > 0) {
+  
+  const enforcementResult = await executeCuisineEnforcement(...);
+  
+  if (enforcementResult.keepPlaceIds.length > 0) {
+    enforcedResults = enforcementResult.keepPlaceIds
+      .map(placeId => googleResult.results.find(r => r.placeId === placeId))
+      .filter(r => r !== undefined);
+  }
+}

-const postFilterResult = applyPostFiltersToResults(googleResult.results, ...);
+const postFilterResult = applyPostFiltersToResults(enforcedResults, ...);
```

### 4. llm-purpose.ts - Add new purpose

```diff
export type LLMPurpose =
  | 'gate'
  | 'intent'
  | 'baseFilters'
  | 'routeMapper'
+ | 'filterEnforcer'  // Cuisine enforcement
  | 'ranking_profile'
  | 'assistant';
```

## Performance Impact

- **Additional LLM call**: ~500-1000ms (only when requiredTerms present)
- **Optimization**: Early exit when no requiredTerms or RELAX_IF_EMPTY with empty terms
- **Timeout**: 4000ms default (configurable via `FILTER_ENFORCER_TIMEOUT_MS`)
- **Fail-safe**: On error, returns all places (no blocking)

## Migration Notes

1. **Backward Compatible**: Existing queries work unchanged (requiredTerms defaults to [])
2. **Gradual Rollout**: Feature activates automatically when LLM identifies explicit cuisine
3. **Monitoring**: Watch for `cuisine_enforcement_*` events in logs
4. **Tuning**: Adjust `FILTER_ENFORCER_TIMEOUT_MS` if timeouts occur

## Future Enhancements

1. **Caching**: Cache enforcement results for identical query+places combinations
2. **Feedback Loop**: Learn from user clicks to improve cuisine matching
3. **Multi-Cuisine**: Support queries like "Italian or Japanese restaurants"
4. **Dietary Restrictions**: Extend to enforce dietary requirements (vegan, kosher, etc.)
