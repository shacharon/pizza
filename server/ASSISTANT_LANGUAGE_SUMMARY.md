# Assistant Language Selection Fix - Summary

**Date**: 2026-01-29  
**Status**: ✅ **COMPLETE**

## Problem Fixed

Assistant messages were responding in **region default language** instead of **query language**.

**Before**:
```
Query: "what the weather is?" (English)
Region: IL
Assistant: "זה לא נראה כמו חיפוש אוכל..." (Hebrew) ❌
```

**After**:
```
Query: "what the weather is?" (English)
Region: IL
Assistant: "This doesn't look like a food search..." (English) ✅
```

## Solution

**Simple deterministic language detection** from query text:
- If contains Hebrew characters (`\u0590-\u05FF`) → `"he"`
- Else → `"en"`

## Changes Made

### 1. New Files Created

| File | Purpose |
|------|---------|
| `utils/query-language-detector.ts` | Deterministic detector (no deps, no LLM) |
| `utils/query-language-detector.test.ts` | Unit tests (8 tests) |
| `tests/assistant-query-language.test.ts` | Integration tests (6 tests) |
| `ASSISTANT_LANGUAGE_FIX.md` | Full documentation |
| `TESTING_ASSISTANT_LANGUAGE.md` | Testing guide |

### 2. Modified Files

| File | Change |
|------|--------|
| `types.ts` | Added `queryLanguage?: 'he' \| 'en'` to context |
| `orchestrator.helpers.ts` | Updated priority + added logging |
| `route2.orchestrator.ts` | Wire query detection at pipeline start |

### 3. New Priority Chain

```
1. ctx.queryLanguage          ← NEW (PRIMARY)
2. detectedLanguage (LLM)     ← Stage detection
3. uiLanguage                 ← UI preference
4. baseFilters.language       ← Base filters
5. 'en'                       ← Fallback
```

## Testing

### Run All Tests

```bash
cd server
npm test -- query-language-detector.test
npm test -- assistant-query-language.test
```

### Quick Manual Test

```bash
# Test English
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"what the weather is?","sessionId":"test","locale":"en"}'

# Test Hebrew  
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"מה מזג האוויר?","sessionId":"test","locale":"he"}'
```

## Verification

### Logs to Check

**1. Query Detection**:
```json
{
  "event": "query_language_detected",
  "queryLanguage": "en",
  "queryLen": 21
}
```

**2. Language Resolution**:
```json
{
  "event": "assistant_language_resolved",
  "assistantLanguage": "en",
  "source": "queryLanguage",
  "queryLanguage": "en",
  "uiLanguage": "he"
}
```

### Expected Behavior

| Query | Detection | Assistant Language | Region Ignored? |
|-------|-----------|-------------------|----------------|
| "what the weather is?" | `en` | English | ✅ Yes |
| "מה מזג האוויר?" | `he` | Hebrew | N/A |
| "פיצה pizza" | `he` | Hebrew | ✅ Yes |
| "🍕" | `en` | English | N/A |

## Key Features

✅ **Zero dependencies**: No libs, no LLM, pure regex  
✅ **Deterministic**: Same query → same language  
✅ **Fast**: < 1ms overhead  
✅ **Backward compatible**: Optional field, old chain as fallback  
✅ **Well tested**: 14 tests total  
✅ **Fully documented**: 3 doc files  
✅ **Production ready**: Comprehensive logging

## Acceptance Criteria

✅ English query → English assistant  
✅ Hebrew query → Hebrew assistant  
✅ Mixed query → Hebrew assistant (Hebrew detected)  
✅ Language NOT from region/UI settings  
✅ Comprehensive logging  
✅ All tests pass  
✅ Zero linter errors  
✅ Documentation complete

## Files Summary

**Core Logic**:
- `query-language-detector.ts` (49 lines) - Detector
- `orchestrator.helpers.ts` (modified) - Priority chain
- `route2.orchestrator.ts` (modified) - Wire detection
- `types.ts` (modified) - Add field

**Tests**:
- `query-language-detector.test.ts` (146 lines) - Unit tests
- `assistant-query-language.test.ts` (216 lines) - Integration tests

**Docs**:
- `ASSISTANT_LANGUAGE_FIX.md` (470 lines) - Full docs
- `TESTING_ASSISTANT_LANGUAGE.md` (380 lines) - Testing guide
- `ASSISTANT_LANGUAGE_SUMMARY.md` (this file) - Summary

## Next Steps

1. **Deploy to staging**
2. **Monitor logs**:
   - `query_language_detected` event
   - `assistant_language_resolved` with `source: "queryLanguage"`
3. **Run integration tests** against staging
4. **Deploy to production**
5. **Monitor for 24h**

## Rollback Plan

If needed, quick rollback:

```typescript
// In orchestrator.helpers.ts, comment priority 1:
// if (ctx.queryLanguage) {
//   result = ctx.queryLanguage;
//   source = 'queryLanguage';
// } else if (detectedLanguage) {
```

## Support

**Check logs**:
```bash
grep "query_language_detected" server.log | jq
grep "assistant_language_resolved" server.log | jq
```

**Run tests**:
```bash
npm test -- query-language-detector.test
npm test -- assistant-query-language.test
```

**Read docs**:
- `ASSISTANT_LANGUAGE_FIX.md` - Full technical details
- `TESTING_ASSISTANT_LANGUAGE.md` - Testing procedures

---

**Result**: ✅ Assistant now responds in **query's language**, not region default.

**Impact**: Better UX for multilingual users, especially English speakers in IL region.

**Complexity**: Minimal - simple regex, zero deps, backward compatible.
