# Quick Verification Guide - KEYED/FREE_TEXT Mode Implementation

## 1. Check Schema Changes

### Verify Static Schema

```bash
# Check that TEXTSEARCH_PROPERTIES includes new fields
grep -A 30 "const TEXTSEARCH_PROPERTIES" server/src/services/search/route2/stages/route-llm/static-schemas.ts
```

**Expected to see:**

- `mode: { type: 'string', enum: ['KEYED', 'FREE_TEXT'] }`
- `cuisineKey: { type: ['string', 'null'], enum: [...] }`
- `placeTypeKey: { type: ['string', 'null'] }`
- `cityText: { type: ['string', 'null'] }`
- **NO** `textQuery` in properties (removed from LLM output)

### Verify Zod Schema

```bash
grep -A 20 "TextSearchLLMResponseSchema" server/src/services/search/route2/stages/route-llm/schemas.ts
```

**Expected:**

- `mode: z.enum(['KEYED', 'FREE_TEXT'])`
- `cuisineKey: z.enum([...]).nullable()`
- `cityText: z.string().nullable()`

---

## 2. Test Mapper Behavior

### Start Server

```bash
cd server
npm run dev
```

### Test Queries

**Test 1: KEYED Mode with Cuisine + City**

```
Query: "מסעדות איטלקיות בגדרה"
Expected Logs:
  - stage: "textsearch_mapper"
  - mode: "KEYED"
  - cuisineKey: "italian"
  - cityText: "גדרה"
  - providerTextQuery: "Italian restaurant in גדרה"
  - providerLanguage: "en"
  - source: "deterministic_builder_keyed"
```

**Test 2: FREE_TEXT Mode (Generic)**

```
Query: "מסעדות טובות"
Expected Logs:
  - mode: "FREE_TEXT"
  - cuisineKey: null
  - cityText: null
  - providerTextQuery: "מסעדות טובות" (cleaned original)
  - providerLanguage: "he"
  - source: "deterministic_builder_freetext"
```

**Test 3: KEYED Mode with Cuisine Only**

```
Query: "Italian restaurants"
Expected Logs:
  - mode: "KEYED"
  - cuisineKey: "italian"
  - cityText: null
  - providerTextQuery: "Italian restaurant"
  - providerLanguage: "en"
```

---

## 3. Verify Google Stage

### Check Logs for Google Call

**Expected log structure:**

```json
{
  "event": "google_call_language",
  "providerMethod": "textSearch",
  "providerTextQuery": "Italian restaurant in Gedera",
  "providerLanguage": "en",
  "mode": "KEYED",
  "languageSource": "mapper_deterministic_builder"
}
```

### Check Request Payload

```json
{
  "event": "textsearch_request_payload",
  "providerTextQuery": "Italian restaurant in Gedera",
  "mode": "KEYED",
  "languageCode": "en"
}
```

### Verify NO canonicalTextQuery

```bash
# Should NOT see this log anymore:
grep "canonical_query_applied" server/logs/server.log
# (Should return no results or old logs only)
```

---

## 4. Test Cuisine Enforcement

### Test Small Sample Guard (< 5 results)

**Query:** "מסעדות איטלקיות בגדרה" (small city, 1-2 results expected)

**Expected Logs:**

```json
{
  "event": "enforcement_skipped",
  "reason": "small_sample",
  "countIn": 1,
  "threshold": 5
}
```

**Outcome:** Results should NOT be wiped (user sees the 1-2 Italian restaurants)

### Test Relaxation Strategy

**Scenario:** STRICT enforcement returns 0 results

**Query:** "מסעדות איטלקיות" with 5+ generic results, no Italian matches

**Expected Log Sequence:**

1. Initial enforcement:

   ```json
   {
     "event": "cuisine_enforcement_completed",
     "countIn": 8,
     "countOut": 0,
     "relaxApplied": false
   }
   ```

2. Relax #1 (STRICT → SOFT):

   ```json
   {
     "event": "relax_strategy_soft",
     "attempt": 1
   }
   ```

3. If still 0, Relax #2 (Google rerun):
   ```json
   {
     "event": "relax_strategy_google_rerun",
     "attempt": 2,
     "cityText": "Tel Aviv"
   }
   {
     "event": "google_rerun_broader_query",
     "providerTextQuery": "restaurants in Tel Aviv",
     "providerLanguage": "en"
   }
   ```

---

## 5. Run Unit Tests

### Run Cuisine Enforcer Edge Case Tests

```bash
cd server
npm test -- cuisine-enforcer-edge-cases
```

**Expected:** All tests pass

- Small sample guard tests (3 tests)
- Zero results scenarios (2 tests)
- Relaxation strategies (2 tests)
- Error handling (2 tests)
- Integration scenarios (2 tests)

### Check Test Output

```
✓ should skip enforcement when countIn = 1 (never reduce to 0)
✓ should skip enforcement when countIn = 4 (below threshold)
✓ should run enforcement when countIn >= 5 (at threshold)
✓ should handle 0 results gracefully (no crash)
✓ should annotate results with cuisineMatch when enforcement skipped
✓ should use fallback_preferred strategy when STRICT returns < 5
✓ should use drop_required_once strategy when fallback_preferred insufficient
✓ should fail gracefully on LLM error (return all places)
✓ should handle empty input gracefully
✓ should handle real-world "1 Italian result in small city" scenario
✓ should handle "5 generic results, 0 Italian matches" scenario with relaxation
```

---

## 6. Validate No Regressions

### Check for Old Field References

**Should NOT find these:**

```bash
# Check for old canonicalTextQuery references
grep -r "canonicalTextQuery" server/src/services/search/route2/stages/google-maps/

# Check for old textQuery usage in Google stage
grep -r "mapping.textQuery" server/src/services/search/route2/stages/google-maps/text-search.handler.ts
```

### Verify Assertions Fire

**Temporarily add old field to test assertion:**

```typescript
// In mapper, add this line to test:
(mapping as any).canonicalTextQuery = "test";
```

**Expected:** Google stage should throw error:

```
Error: canonicalTextQuery field found in mapping - use providerTextQuery instead
```

---

## 7. Integration Test Scenarios

### Scenario 1: Small City Italian Restaurant

```
Query: "מסעדות איטלקיות בגדרה"
Expected:
  - Mode: KEYED
  - Google returns: 1-2 Italian restaurants
  - Enforcement: SKIPPED (small sample guard)
  - Final results: 1-2 restaurants (not wiped)
```

### Scenario 2: Generic Restaurant Search

```
Query: "מסעדות טובות בתל אביב"
Expected:
  - Mode: FREE_TEXT
  - providerTextQuery: "מסעדות טובות בתל אביב" (cleaned)
  - providerLanguage: "he"
  - Enforcement: SKIPPED (no cuisineKey)
```

### Scenario 3: Italian in Big City

```
Query: "Italian restaurants in Tel Aviv"
Expected:
  - Mode: KEYED
  - cuisineKey: "italian"
  - cityText: "Tel Aviv"
  - providerTextQuery: "Italian restaurant in Tel Aviv"
  - providerLanguage: "en"
  - Google returns: 40+ results
  - Enforcement: RUNS (countIn > 5)
  - Final results: Filtered Italian only
```

### Scenario 4: Zero Italian Matches with Relaxation

```
Query: "מסעדות איטלקיות" (but Google returns only shawarma/burger)
Expected:
  - Initial enforcement: 0 results
  - Relax #1 (SOFT): Try with preferredTerms only
  - If still 0, Relax #2: Rerun Google with "restaurants in <city>"
  - Final results: Broader restaurant set with SOFT filtering
```

---

## 8. Log Monitoring Dashboard

### Key Logs to Watch

**1. Mapper Stage:**

```bash
grep "textsearch_mapper" server/logs/server.log | tail -20
```

Look for: `mode`, `cuisineKey`, `cityText`, `providerTextQuery`, `providerLanguage`

**2. Google Stage:**

```bash
grep "google_call_language" server/logs/server.log | tail -10
```

Look for: `providerTextQuery`, `providerLanguage`, `mode`

**3. Cuisine Enforcement:**

```bash
grep "cuisine_enforcement" server/logs/server.log | tail -20
```

Look for: `enforcementSkipped`, `relaxApplied`, `relaxStrategy`

**4. Relaxation Events:**

```bash
grep "relax_strategy" server/logs/server.log
```

Look for: `relax_strategy_soft`, `google_rerun_broader`

---

## 9. Performance Validation

### Measure LLM Calls

**Before (old system):**

- 1 LLM call for mapper
- 1 LLM call for canonical query generation
- 1 LLM call for cuisine enforcement (if applicable)
- **Total: 2-3 LLM calls per request**

**After (new system):**

- 1 LLM call for mapper (extracts mode + keys)
- 0 LLM calls for query building (deterministic)
- 1 LLM call for cuisine enforcement (if applicable)
- **Total: 1-2 LLM calls per request**

**Expected:** ~33% reduction in LLM calls

### Check Latency

```bash
grep "tookMs" server/logs/server.log | tail -10
```

**Expected:** Faster overall pipeline (removed 1 LLM call)

---

## 10. Rollback Plan (If Issues Found)

### Critical Files to Revert

```bash
# 1. Revert schemas
git checkout HEAD~1 server/src/services/search/route2/stages/route-llm/static-schemas.ts
git checkout HEAD~1 server/src/services/search/route2/stages/route-llm/schemas.ts

# 2. Revert mapper
git checkout HEAD~1 server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts

# 3. Revert Google stage
git checkout HEAD~1 server/src/services/search/route2/stages/google-maps/text-search.handler.ts

# 4. Revert orchestrator
git checkout HEAD~1 server/src/services/search/route2/route2.orchestrator.ts

# 5. Restart server
npm run dev
```

---

## Success Criteria Checklist

- [ ] Schema includes `mode`, `cuisineKey`, `placeTypeKey`, `cityText`
- [ ] Schema does NOT include `textQuery` in required fields
- [ ] Mapper logs show `mode: "KEYED"` or `mode: "FREE_TEXT"`
- [ ] Google stage uses `providerTextQuery` and `providerLanguage`
- [ ] No `canonicalTextQuery` references in Google stage
- [ ] Small sample guard triggers for countIn < 5
- [ ] Relaxation strategy runs when enforcement returns 0
- [ ] All unit tests pass
- [ ] No TypeScript errors (`npm run build`)
- [ ] Integration tests show correct query construction
- [ ] Logs show deterministic query building

---

## Support

If you encounter issues:

1. Check logs for error messages
2. Verify schema changes are correct
3. Run unit tests to isolate failing component
4. Use rollback plan if needed
5. Review KEYED_FREETEXT_MODE_IMPLEMENTATION.md for detailed explanation
