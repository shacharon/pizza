# Correctness Fixes - Changelog

**Date:** 2026-01-30  
**Goal:** Fix logging inconsistencies and correctness issues without changing API/WS contracts

---

## ✅ Bugs Fixed

### 1. **Bias Logging Inconsistency** ✅

**Problem:**
- Logs showed `hasBias=false` before LLM call but `hasBias=true` after city geocode
- Field name `hasBias` was ambiguous - didn't indicate *when* bias exists

**Root Cause:**
- `hasBias` was used to mean different things in different places:
  - In mapper: checking if schema has bias field (always false)
  - In handler before geocode: checking if mapping will have bias
  - In handler after geocode: checking if request body has locationBias

**Solution:**
- Renamed fields for clarity:
  - `hasBiasCandidate`: Schema supports locationBias field (LLM can return it)
  - `hasBiasPlanned`: Will attempt to apply bias (from LLM or city geocode)
  - `hasBiasApplied`: Final request body includes locationBias
- Added `biasSource` field to track origin: `llm_locationBias`, `cityText_pending_geocode`, or `cityText_geocoded`

**Files Changed:**
- `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
- `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

**Tests Added:**
- `server/src/services/search/route2/stages/google-maps/__tests__/bias-preservation.test.ts` (5 tests)

---

### 2. **LocationBias Dropped When cityText Exists** ✅

**Problem:**
- When LLM returned both `locationBias` AND `cityText`, the geocoding code would REPLACE the LLM bias with geocoded coords
- This dropped the more precise LLM-provided locationBias, reducing search relevance

**Root Cause:**
```typescript
// BEFORE (WRONG):
enrichedMapping = {
  ...mapping,
  bias: { // Always replaces original bias
    type: 'locationBias',
    center: geocodedCoords,
    radiusMeters: 20000
  }
};
```

**Solution:**
```typescript
// AFTER (CORRECT):
enrichedMapping = {
  ...mapping,
  bias: mapping.bias || { // Preserve original if exists
    type: 'locationBias',
    center: geocodedCoords,
    radiusMeters: 20000
  }
};
```

**Impact:**
- LLM-provided locationBias is now preserved when cityText exists
- Geocoded bias is only used as fallback when LLM didn't provide bias
- Improves search relevance when LLM provides precise location hint

**Files Changed:**
- `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

**Tests Added:**
- Tests verify original bias is preserved
- Tests verify geocoded bias is used as fallback

---

### 3. **Assistant promptVersion Shows "unknown"** ✅

**Problem:**
- `llm_gate_timing` logs for assistant showed `promptVersion: 'unknown'`
- Made telemetry less useful for tracking prompt changes

**Root Cause:**
- `buildLLMOptions()` was called without passing `promptVersion` or `schemaHash`
- These were logged separately but not passed to the LLM call options

**Solution:**
```typescript
// AFTER (CORRECT):
const llmOpts = buildLLMOptions('assistant', {...});
llmOpts.promptVersion = ASSISTANT_PROMPT_VERSION; // ✅ Added
llmOpts.schemaHash = ASSISTANT_SCHEMA_HASH;       // ✅ Added
```

**Impact:**
- All assistant LLM calls now emit `promptVersion` and `schemaHash`
- Telemetry accurately tracks which prompt/schema version was used
- Easier to correlate behavior changes with prompt updates

**Files Changed:**
- `server/src/services/search/route2/assistant/assistant-llm.service.ts`

**Tests Added:**
- `server/src/services/search/route2/assistant/__tests__/assistant-telemetry.test.ts` (4 tests)

---

### 4. **SUMMARY Invariant Violation** ✅

**Problem:**
- LLM returned `blocksSearch=true` for SUMMARY type
- Code enforced it to `false` but prompt didn't explicitly forbid this
- Logging didn't indicate this was a prompt violation

**Root Cause:**
- System prompt said "YOU decide" without explicit rules for SUMMARY
- Post-processing enforced the rule silently
- LLM could violate the invariant without clear guidance

**Solution:**

**A. Updated Prompt:**
```
- "blocksSearch": 
  * SUMMARY type: MUST be false (search already completed, showing results)
  * GENERIC_QUERY_NARRATION type: MUST be false (search already completed)
  * CLARIFY/GATE_FAIL type: MUST be true (search cannot proceed)
  * SEARCH_FAILED type: usually true (search failed, user should try again)
```

**B. Enhanced Enforcement:**
```typescript
// Added severity logging
logger.warn({
  event: 'assistant_invariant_violation_enforced',
  severity: 'PROMPT_VIOLATION', // ✅ Indicates LLM ignored prompt
  llmValue: true,
  enforcedValue: false
}, '[ASSISTANT] CRITICAL: LLM returned blocksSearch=true for SUMMARY (violates prompt)');
```

**Impact:**
- LLM has clear explicit rules in prompt
- Post-processing enforcement remains as safety net
- Violations are logged with high severity for monitoring
- Easier to detect if LLM starts ignoring prompt rules

**Files Changed:**
- `server/src/services/search/route2/assistant/assistant-llm.service.ts`

**Tests Added:**
- `server/src/services/search/route2/assistant/__tests__/summary-invariant.test.ts` (7 tests)

---

## Test Results ✅

All tests passing:

```bash
# Bias preservation tests
✅ 5/5 tests passed

# Assistant telemetry tests
✅ 4/4 tests passed

# Summary invariant tests
✅ 7/7 tests passed

Total: 16/16 tests passed
```

---

## Verification Steps

### Verify Bias Logging Fix:

```bash
# 1. Start server
npm start

# 2. Make a search request with city
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "פיצה בתל אביב", "userLocation": {"lat": 32.0, "lng": 34.7}}'

# 3. Check logs for bias fields:
grep "schema_check_before_llm" server/logs/server.log | tail -1
# Should see: "hasBiasCandidate": true

grep "textsearch_request_payload" server/logs/server.log | tail -1
# Should see: "hasBiasApplied": true, "biasSource": "llm_locationBias" or "cityText_geocoded"
```

### Verify LocationBias Preservation:

```bash
# Enable DEBUG logging to see bias values
LOG_LEVEL=debug npm start

# Make request
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "פיצה בתל אביב", "userLocation": {"lat": 32.0853, "lng": 34.7818}}'

# Check logs for "city_geocoded_for_bias"
grep "city_geocoded_for_bias" server/logs/server.log | tail -1
# Should see: "hadOriginalBias": true/false

# If hadOriginalBias=true, the LLM bias was preserved
```

### Verify Assistant promptVersion:

```bash
# 1. Make a search request that triggers assistant (e.g., results found)
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "מסעדות", "userLocation": {"lat": 32.0, "lng": 34.7}}'

# 2. Check logs for assistant LLM calls
grep "llm_gate_timing.*assistant_llm" server/logs/server.log | tail -1
# Should see: "promptVersion": "assistant_v2" (NOT "unknown")
```

### Verify SUMMARY Invariant:

```bash
# Monitor for prompt violations
grep "PROMPT_VIOLATION" server/logs/server.log

# If violations occur frequently:
# - LLM may be ignoring prompt rules
# - May need to adjust prompt wording
# - Post-processing enforcement ensures correctness
```

---

## Files Changed

### Modified (3 files):
1. `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
   - Changed `hasBias` → `hasBiasCandidate` in schema logging

2. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`
   - Changed `hasBias` → `hasBiasPlanned` (before geocode)
   - Changed `hasBias` → `hasBiasApplied` (after geocode)
   - Added `biasSource` field
   - Fixed bias preservation: `mapping.bias ||` (preserve original)
   - Added `hadOriginalBias` logging

3. `server/src/services/search/route2/assistant/assistant-llm.service.ts`
   - Added `llmOpts.promptVersion` and `llmOpts.schemaHash`
   - Updated system prompt with explicit SUMMARY rules
   - Enhanced violation logging with `severity: 'PROMPT_VIOLATION'`

### New Test Files (3 files):
1. `server/src/services/search/route2/stages/google-maps/__tests__/bias-preservation.test.ts`
2. `server/src/services/search/route2/assistant/__tests__/assistant-telemetry.test.ts`
3. `server/src/services/search/route2/assistant/__tests__/summary-invariant.test.ts`

---

## API/WS Contract Preservation ✅

**No breaking changes:**
- API request/response formats unchanged
- WebSocket message formats unchanged
- Only logging field names changed (internal observability)
- Only bug fixes to internal logic

**Backward compatible:**
- Existing clients work without changes
- New log fields are additive (old parsers ignore them)
- Behavior improvements (bias preservation, telemetry) are transparent

---

## Performance Impact

**Negligible:**
- Bias preservation: No extra work (just conditional logic)
- Telemetry fields: 2 string assignments per assistant call
- Prompt changes: Slightly longer prompt (~50 chars), minimal token impact

---

## Next Steps

1. ✅ Run all tests
2. ✅ Check linter
3. ⏳ Create PR with these changes
4. ⏳ Deploy to staging
5. ⏳ Monitor logs for:
   - `hasBiasApplied=true` when expected
   - `promptVersion` not "unknown"
   - `PROMPT_VIOLATION` frequency (should be rare)
6. ⏳ Deploy to production

---

**Status:** ✅ COMPLETE  
**Tests:** ✅ 16/16 passing  
**Linter:** ✅ 0 errors  
**Ready for:** PR Review
