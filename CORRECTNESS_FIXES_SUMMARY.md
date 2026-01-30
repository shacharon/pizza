# Correctness Fixes - Quick Summary

**Date:** 2026-01-30  
**Status:** ✅ COMPLETE - All tests passing, ready for PR

---

## What Was Fixed

### 1. **Bias Logging Clarity** ✅
- **Before:** Confusing `hasBias` field meant different things
- **After:** Clear fields: `hasBiasCandidate`, `hasBiasPlanned`, `hasBiasApplied`
- **Why:** Logs now accurately reflect when bias exists at each pipeline stage

### 2. **LocationBias Preservation** ✅
- **Before:** LLM-provided locationBias was dropped when cityText existed
- **After:** LLM bias is preserved; geocoded bias only used as fallback
- **Why:** Improves search relevance when LLM provides precise location

### 3. **Assistant Telemetry** ✅
- **Before:** `promptVersion: "unknown"` in logs
- **After:** Always shows actual version (e.g., `"assistant_v2"`)
- **Why:** Better telemetry for tracking prompt changes

### 4. **SUMMARY Invariant** ✅
- **Before:** LLM could return `blocksSearch=true` for SUMMARY
- **After:** Prompt explicitly forbids it; enforcement logs violations
- **Why:** Prevents logical inconsistencies (SUMMARY shown after search completes)

---

## Quick Verification

### Test One Search Request

```bash
# 1. Start server
cd server && npm start

# 2. Make a search request
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "פיצה בתל אביב",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'

# 3. Check logs
tail -100 server/logs/server.log | grep -E "hasBias|promptVersion|blocksSearch"
```

**Expected in logs:**
- ✅ `"hasBiasCandidate": true` (schema supports it)
- ✅ `"hasBiasPlanned": true` (will apply bias)
- ✅ `"hasBiasApplied": true` (request has locationBias)
- ✅ `"promptVersion": "assistant_v2"` (not "unknown")
- ✅ `"biasSource": "llm_locationBias"` or `"cityText_geocoded"`

---

## Files Changed

### Code (3 files):
1. `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
2. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`
3. `server/src/services/search/route2/assistant/assistant-llm.service.ts`

### Tests (3 new files):
1. `server/src/services/search/route2/stages/google-maps/__tests__/bias-preservation.test.ts`
2. `server/src/services/search/route2/assistant/__tests__/assistant-telemetry.test.ts`
3. `server/src/services/search/route2/assistant/__tests__/summary-invariant.test.ts`

---

## Test Results

```
✅ Bias preservation: 5/5 tests passed
✅ Assistant telemetry: 4/4 tests passed
✅ SUMMARY invariant: 7/7 tests passed
✅ Linter: 0 errors

Total: 16/16 tests passed
```

---

## Run Tests

```bash
cd server

# Run all new tests
node --test --import tsx \
  src/services/search/route2/stages/google-maps/__tests__/bias-preservation.test.ts \
  src/services/search/route2/assistant/__tests__/assistant-telemetry.test.ts \
  src/services/search/route2/assistant/__tests__/summary-invariant.test.ts

# Check linter
npm run lint
```

---

## API/WS Contracts ✅

**NO BREAKING CHANGES:**
- API request/response: unchanged
- WebSocket messages: unchanged
- Only internal logging field names changed
- All changes are backward compatible

---

## Next Steps

1. ✅ All fixes complete
2. ✅ All tests passing
3. ✅ Linter clean
4. ⏳ Create PR
5. ⏳ Deploy to staging
6. ⏳ Verify in production logs

---

**Ready for PR** 🚀

For detailed technical info, see: `CORRECTNESS_FIXES_CHANGELOG.md`
