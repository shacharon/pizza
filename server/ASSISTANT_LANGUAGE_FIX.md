# Assistant Language Selection Fix

**Date**: 2026-01-29  
**Scope**: Backend only (server)  
**Status**: ✅ Complete

## Problem

Assistant messages (GATE_FAIL, CLARIFY, SUMMARY) were responding in the **region's default language** instead of the **query's language**.

**Example Issue**:
- User types: "what the weather is?" (English query)
- Region: IL
- Assistant responds: "זה לא נראה כמו חיפוש אוכל..." (Hebrew) ❌

**Expected**:
- User types: "what the weather is?" (English query)
- Assistant responds: "This doesn't look like a food search..." (English) ✅

## Solution

Introduced **deterministic query language detection** as the PRIMARY source for assistant language.

### Core Changes

1. **Created Query Language Detector** (`utils/query-language-detector.ts`)
   - Simple, deterministic, no dependencies
   - Returns "he" if contains Hebrew characters (`\u0590-\u05FF`)
   - Returns "en" otherwise

2. **Added `queryLanguage` to Context**
   - Added field to `Route2Context`: `queryLanguage?: 'he' | 'en'`
   - Computed at pipeline start from query text

3. **Updated Language Resolution Priority**
   - **NEW Priority (2026-01-29)**:
     1. `ctx.queryLanguage` ← **DETERMINISTIC query detection** (PRIMARY)
     2. `detectedLanguage` from stage (gate/intent/mapping)
     3. `sharedFilters.final.uiLanguage` (UI preference)
     4. `sharedFilters.preGoogle.language` (base filters)
     5. Final fallback: `'en'`

4. **Added Comprehensive Logging**
   - Log query language detection
   - Log assistant language resolution with source

5. **Added Tests**
   - Unit tests for language detector
   - Integration tests for English/Hebrew queries

## Files Changed

### New Files
- `server/src/services/search/route2/utils/query-language-detector.ts` - Deterministic detector
- `server/src/services/search/route2/utils/query-language-detector.test.ts` - Unit tests
- `server/tests/assistant-query-language.test.ts` - Integration tests

### Modified Files
- `server/src/services/search/route2/types.ts` - Added `queryLanguage` field
- `server/src/services/search/route2/orchestrator.helpers.ts` - Updated priority & logging
- `server/src/services/search/route2/route2.orchestrator.ts` - Wire query detection

## Language Detection Algorithm

```typescript
function detectQueryLanguage(query: string): 'he' | 'en' {
  if (!query || typeof query !== 'string') {
    return 'en';
  }

  // Check for Hebrew characters (Unicode range \u0590-\u05FF)
  const hebrewRegex = /[\u0590-\u05FF]/;
  
  if (hebrewRegex.test(query)) {
    return 'he';
  }

  return 'en';
}
```

### Examples

| Query | Detection | Reason |
|-------|-----------|--------|
| "what the weather is?" | `en` | No Hebrew chars |
| "מה מזג האוויר?" | `he` | Contains Hebrew |
| "פיצה pizza" | `he` | Contains Hebrew (even mixed) |
| "🍕🍔" | `en` | No Hebrew chars |
| "" | `en` | Default fallback |

## Resolution Flow

```
Query: "what the weather is?"
    ↓
Detect queryLanguage: "en"
    ↓
resolveAssistantLanguage():
  1. Check ctx.queryLanguage → "en" ✅
  2. (Skip other sources)
    ↓
Assistant Context:
  { type: 'GATE_FAIL', language: 'en', query: "..." }
    ↓
LLM generates message in English
    ↓
Response: "This doesn't look like a food search..."
```

## Logging

### Query Detection
```
[ROUTE2] Query language detected (deterministic)
{
  requestId: "...",
  pipelineVersion: "route2",
  event: "query_language_detected",
  queryLanguage: "en",
  queryLen: 21
}
```

### Language Resolution
```
[ASSISTANT] Language resolved for assistant message
{
  requestId: "...",
  event: "assistant_language_resolved",
  assistantLanguage: "en",
  source: "queryLanguage",
  queryLanguage: "en",
  uiLanguage: "he",
  detectedLanguage: undefined
}
```

## Testing

### Run Unit Tests
```bash
cd server
npm test -- query-language-detector.test
```

### Run Integration Tests
```bash
cd server
npm test -- assistant-query-language.test
```

### Expected Results

**Test: English Query**
```typescript
Query: "what the weather is?"
Expected:
  - ctx.queryLanguage = "en"
  - assistantLanguage = "en"
  - message contains NO Hebrew characters
  - message contains English words
```

**Test: Hebrew Query**
```typescript
Query: "מה מזג האוויר?"
Expected:
  - ctx.queryLanguage = "he"
  - assistantLanguage = "he"
  - message contains Hebrew characters
```

**Test: Mixed Query**
```typescript
Query: "פיצה pizza"
Expected:
  - ctx.queryLanguage = "he" (Hebrew detected)
  - assistantLanguage = "he"
  - message in Hebrew (ignores UI locale)
```

## Invariants Enforced

1. **Query language ALWAYS takes priority** over region/UI language
2. **Deterministic detection**: Same query → same language (no LLM randomness)
3. **Hebrew detection**: ANY Hebrew char → Hebrew language
4. **Default to English**: No Hebrew → English
5. **Fallback chain**: Only used if queryLanguage missing

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Empty query | Default to `en` |
| Null/undefined query | Default to `en` |
| Emoji only | Default to `en` (no Hebrew) |
| Mixed Hebrew + English | Detect as `he` (Hebrew present) |
| Numbers only | Default to `en` |
| Special chars only | Default to `en` |

## Backward Compatibility

- ✅ No breaking changes
- ✅ Old priority chain still works as fallback
- ✅ Existing tests unaffected
- ✅ Optional field (won't break if missing)

## Performance

- **Zero dependencies**: No libs, no LLM calls
- **O(n) complexity**: Single regex pass over query
- **< 1ms execution**: Simple Unicode check
- **No network calls**: Fully local

## Future Improvements

If needed (but keep it simple):
1. Support more languages (ru, ar, fr, es) with similar detection
2. Add language confidence score
3. Cache detection results (probably unnecessary)

## Acceptance Criteria

✅ **For query "what the weather is?"**:
- queryLanguage = "en"
- assistantLanguage = "en"
- Message in English

✅ **For query "מה מזג האוויר?"**:
- queryLanguage = "he"
- assistantLanguage = "he"
- Message in Hebrew

✅ **Language is NOT derived from**:
- regionCode (IL)
- uiLanguage preference
- User device settings

✅ **Logging shows**:
- Query language detection
- Assistant language resolution
- Source used for resolution

✅ **Tests pass**:
- Unit tests for detector
- Integration tests for English/Hebrew queries

## Rollback Plan

If issues arise:

1. **Quick fix**: Comment out priority 1 in `resolveAssistantLanguage()`
   ```typescript
   // Priority 1: Deterministic query language detection (NEW - highest priority)
   // if (ctx.queryLanguage) {
   //   return ctx.queryLanguage;
   // }
   ```

2. **Full rollback**: Revert all changes, restore old priority chain

## Monitoring

Check logs for:

1. **Detection accuracy**:
   - Filter by `event: "query_language_detected"`
   - Verify queryLanguage matches expected

2. **Resolution source**:
   - Filter by `event: "assistant_language_resolved"`
   - Check `source: "queryLanguage"` is most common

3. **Language mismatches**:
   - Compare `queryLanguage` vs `uiLanguage` in logs
   - Verify assistant uses queryLanguage

## Summary

**What changed**: Assistant now responds in **query's detected language**, not region default.

**How it works**: Simple Hebrew char detection at pipeline start.

**Impact**: Better UX for multilingual users, especially English speakers in IL region.

**Complexity**: Minimal - single regex check, no deps, no breaking changes.
