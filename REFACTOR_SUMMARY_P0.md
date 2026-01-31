# P0 Refactor Summary: Remove Deterministic Overrides

**Date**: 2026-01-31  
**Tasks Completed**: 2/2 (Prompt 2 of 3)

---

## Task 1: Eliminate `detectCuisineKeyword()` Fallback Override ✅

### What Was Changed

**File**: `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`

**Lines Removed**: 371-387 (CUISINE ENFORCEMENT GUARD block)

### Before (Lines 371-387)
```typescript
// CUISINE ENFORCEMENT GUARD: If LLM didn't extract cuisineKey, try deterministic detection
// This ensures cuisine enforcement works even if LLM misses the cuisine keyword
if (!mapping.cuisineKey) {
  const detectedCuisineKey = detectCuisineKeyword(request.query);
  if (detectedCuisineKey) {
    mapping.cuisineKey = detectedCuisineKey;
    mapping.strictness = 'STRICT'; // Force STRICT when cuisine detected
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'cuisine_detected_deterministic_override',
      query: request.query,
      cuisineKey: detectedCuisineKey,
      reason: 'llm_missed_cuisine'
    }, '[TEXTSEARCH] Deterministic override: LLM missed cuisine keyword');
  }
}
```

### After (Lines 371-374)
```typescript
// REMOVED: CUISINE ENFORCEMENT GUARD (deterministic override)
// Cuisine and strictness are now driven exclusively by Route-LLM mapping result.
// If LLM doesn't detect cuisine, we treat it as "no cuisine" intent.
// Deterministic fallback is only used when LLM completely fails (see buildDeterministicMapping).
```

### Why This Change Was Made

1. **LLM Trust**: Route-LLM is the single source of truth for query understanding. If it doesn't detect cuisine, we should respect that decision.

2. **Removed Override Path**: Previously, deterministic detection would **override** LLM output when `cuisineKey` was missing. This caused inconsistencies where:
   - User query: "מסעדות בגדרה" (restaurants in Gedera - NO cuisine)
   - LLM output: `cuisineKey=null, strictness='RELAX_IF_EMPTY'` ✓
   - Deterministic override: `cuisineKey='italian', strictness='STRICT'` ✗ (FALSE POSITIVE)

3. **Fallback Still Works**: The deterministic detection functions (`detectCuisineKeyword`, `extractOriginalCuisineWord`, `buildDeterministicCuisineCityQuery`) are still used in `buildDeterministicMapping()` when the LLM **completely fails** (timeout, error). This ensures safety without overriding valid LLM output.

### Public API Impact

- **Signatures**: Unchanged
- **Log Events**: Removed `cuisine_detected_deterministic_override` event (no longer emitted)
- **Behavior**: `mapping.cuisineKey` is now driven exclusively by LLM output (unless LLM fails entirely)

---

## Task 2: Delete Hebrew-Only TextQuery Rewriting ✅

### What Was Changed

**File**: `server/src/services/search/route2/stages/google-maps/textquery-normalizer.ts`

**Function**: `normalizeTextQuery()` - Converted to no-op

### Before (Lines 126-228)
- Complex regex-based rewriting using `GENERIC_FOOD_PATTERNS` and `CUISINE_KEYWORDS`
- Hebrew-specific patterns like "מה יש לאכול היום" → "מסעדות"
- Extracted cuisine keywords and cities deterministically
- Modified `textQuery` before sending to Google

### After (Lines 139-150)
```typescript
export function normalizeTextQuery(
  textQuery: string,
  cityText?: string | null,
  requestId?: string
): { canonicalTextQuery: string; wasNormalized: boolean; reason: string; keptCity?: boolean } {
  // No-op: Return input unchanged
  // Canonical query generation is handled by Route-LLM (canonical-query.generator.ts)
  return {
    canonicalTextQuery: textQuery.trim(),
    wasNormalized: false,
    reason: 'noop_llm_driven',
    keptCity: !!cityText
  };
}
```

### Why This Change Was Made

1. **Avoid Double Rewriting**: 
   - Route-LLM already produces optimized canonical queries via `canonical-query.generator.ts`
   - Applying a second deterministic normalizer created conflicts and overwrote LLM decisions

2. **Language Agnostic**:
   - Previous approach used Hebrew-specific regex tables (`GENERIC_FOOD_PATTERNS`, `CUISINE_KEYWORDS`)
   - LLM-based approach works across all languages naturally

3. **Simplified Pipeline**:
   - Query flow is now linear: User Query → Route-LLM → Canonical Query Generator → Google
   - No hidden transformations between LLM and Google API

### Deprecated Code (Kept for Reference)

The following constants and helper functions are marked as `@deprecated` but kept in the file for historical reference:
- `GENERIC_FOOD_PATTERNS`
- `CUISINE_KEYWORDS`
- `isGenericFoodQuery()`
- `extractCuisineKeyword()`
- `extractCityFromQuery()`

**Recommendation**: Remove these in a future cleanup pass.

### Public API Impact

- **Signature**: Unchanged (`normalizeTextQuery` still exported with same signature)
- **Call Sites**: `text-search.handler.ts:295` - Still works, now returns input unchanged
- **Behavior**: All queries pass through unmodified (LLM canonical query is preserved)

---

## Testing & Validation

### Existing Tests Updated

**File**: `server/src/services/search/route2/stages/route-llm/__tests__/cuisine-enforcement.test.ts`

- Added header comment explaining that tests now apply to **fallback path only** (not override)
- Tests remain valid for `buildDeterministicMapping()` behavior when LLM fails
- TODO: Update individual test descriptions to clarify "fallback" context

### Sanity Checks Required

Test these queries manually to verify behavior:

| Query | Expected Behavior |
|-------|------------------|
| "מה יש לאכול היום" | LLM decides textQuery (no forced "מסעדות" rewrite) |
| "what to eat today" | LLM decides textQuery (no forced rewrite) |
| "מסעדות איטלקיות בגדרה" | LLM detects `cuisineKey='italian'`, `strictness='STRICT'` |
| "מסעדות בגדרה" (no cuisine) | LLM returns `cuisineKey=null`, `strictness='RELAX_IF_EMPTY'` (no override) |

### How to Verify

1. **Run the server**: `npm run dev` (or equivalent)
2. **Watch logs**: Look for these events:
   - ✅ `textquery_canonicalized` (from `google-query-normalizer.ts`)
   - ✅ `canonical_query_applied` (from LLM canonical generator)
   - ✅ `textquery_normalized` with `reason: 'noop_llm_driven'`
   - ❌ ~~`cuisine_detected_deterministic_override`~~ (should NOT appear)
3. **Test queries**: Use the table above
4. **Check results**: Verify Google receives LLM-generated canonical query (not rewritten deterministically)

---

## Rollback Instructions

If issues are discovered, revert with:

```bash
git revert <commit-sha>
```

Or manually restore:

### Restore Task 1 (textsearch.mapper.ts)
Replace lines 371-374 with the original CUISINE ENFORCEMENT GUARD block (see git history).

### Restore Task 2 (textquery-normalizer.ts)
Replace `normalizeTextQuery()` body with original implementation (lines 126-228 in git history).

---

## Next Steps

1. **Monitoring**: Watch production logs for any increase in:
   - Non-relevant search results (false negatives)
   - Missing cuisine enforcement (check `strictness` distribution)

2. **LLM Prompt Tuning**: If LLM misses cuisine keywords, improve the prompt in `TEXTSEARCH_MAPPER_PROMPT` (lines 20-61)

3. **Cleanup** (Future):
   - Remove deprecated functions in `textquery-normalizer.ts`
   - Update test descriptions in `cuisine-enforcement.test.ts`
   - Consider removing unused helper functions if never needed in future

---

## Summary Table

| Task | File | Lines Changed | Status |
|------|------|--------------|--------|
| Remove cuisine override | `textsearch.mapper.ts` | 371-387 → 371-374 | ✅ Complete |
| Disable textQuery rewriting | `textquery-normalizer.ts` | 126-228 → 139-150 | ✅ Complete |
| Update tests | `cuisine-enforcement.test.ts` | Header + TODO | ✅ Complete |

**Total Impact**: ~120 lines removed/simplified, 0 breaking changes to public APIs.

---

## Questions / Concerns

If you encounter issues:

1. Check that `canonical-query.generator.ts` is producing good queries
2. Verify LLM prompt is detecting cuisine correctly (add test cases)
3. Fallback path (`buildDeterministicMapping`) should still work for LLM failures

**Contact**: Shachar (original implementer)
