# P0 Refactor Summary: Remove Keyword-Gated LLM Bypass (Task 3/3)

**Date**: 2026-01-31  
**Task**: Remove FILTER_KEYWORDS optimization, replace with language-agnostic structural rule

---

## What Was Changed

**File**: `server/src/services/search/route2/orchestrator.parallel-tasks.ts`

### Removed Code (Lines 19-75)

**1. FILTER_KEYWORDS Array (47 lines)**
```typescript
const FILTER_KEYWORDS = [
  // Open/Hours (Hebrew + English)
  'פתוח', 'פתוחות', 'סגור', 'סגורות', 'עכשיו',
  'open', 'closed', 'now', 'hours',
  // ... 60+ keywords in Hebrew and English
];
```

**2. containsFilterKeywords() Function**
```typescript
function containsFilterKeywords(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return FILTER_KEYWORDS.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
}
```

**3. Keyword-Based Gating Logic**
```typescript
const hasFilterKeywords = containsFilterKeywords(request.query);
// ...
const baseFiltersPromise = (isGenericWithLocation && !hasFilterKeywords) ? ...
```

---

### Added Code

**1. New Structural Rule Function**
```typescript
/**
 * Determine if base_filters LLM should be skipped (P0 FIX - Language-Agnostic)
 * 
 * NEW RULE (Structural, no query text parsing):
 * Skip base_filters LLM ONLY when:
 * 1. Route is NEARBY (location-focused, not text-focused)
 * 2. User location is available (no need to infer location from query)
 * 3. No explicit city text (means query is purely location-based, not text-based)
 */
function shouldSkipBaseFiltersLLM(
  intentDecision: IntentResult,
  ctx: Route2Context
): boolean {
  return (
    intentDecision.route === 'NEARBY' &&
    !!ctx.userLocation &&
    !intentDecision.cityText
  );
}
```

**2. Updated Gating Logic**
```typescript
const skipBaseFilters = shouldSkipBaseFiltersLLM(intentDecision, ctx);
// ...
const baseFiltersPromise = skipBaseFilters ? ... // Use structural rule
```

---

## Why This Change Was Made

### Problem with Old Approach (Keyword-Based)

1. **Language-Specific**: Required maintaining parallel Hebrew/English keyword lists
2. **Brittle**: Missed variations ("פתוח" vs "פתוחה" vs "פתוחות"), misspellings, synonyms
3. **False Positives**: Generic words like "now" triggered LLM unnecessarily
4. **False Negatives**: Missed complex filter expressions not in the keyword list
5. **Maintenance Burden**: Adding new cuisines/filters required updating keyword lists in multiple places

### Solution (Structural Rule)

**New Rule**: Skip base_filters LLM ONLY when:
```
route === 'NEARBY' AND hasUserLocation === true AND cityText === null
```

**Rationale**:
- **NEARBY route** = GPS-based search (user wants nearby places, minimal text parsing)
- **TEXTSEARCH route** = Text-driven search (always parse query for filters/constraints)
- **cityText present** = User specified location in text (parse for additional context)
- **Language-agnostic** = Works identically for Hebrew, English, Arabic, or any language

---

## Behavior Changes

### Before (Keyword-Based)

| Query | Route | GPS | cityText | Keywords? | Skip? |
|-------|-------|-----|----------|-----------|-------|
| "מה יש לאכול" | NEARBY | ✓ | ✗ | ✗ | ✓ Skip |
| "מה פתוח עכשיו" | NEARBY | ✓ | ✗ | ✓ ("פתוח") | ✗ Run LLM |
| "what to eat" | NEARBY | ✓ | ✗ | ✗ | ✓ Skip |
| "what's open now" | NEARBY | ✓ | ✗ | ✓ ("open") | ✗ Run LLM |
| "פיצה בתל אביב" | TEXTSEARCH | ✓ | ✓ | ✓ ("פיצה") | ✗ Run LLM |

### After (Structural Rule)

| Query | Route | GPS | cityText | Skip? | Reason |
|-------|-------|-----|----------|-------|--------|
| "מה יש לאכול" | NEARBY | ✓ | ✗ | ✓ | NEARBY + GPS + no cityText |
| "מה פתוח עכשיו" | NEARBY | ✓ | ✗ | ✓ | NEARBY + GPS + no cityText |
| "what to eat" | NEARBY | ✓ | ✗ | ✓ | NEARBY + GPS + no cityText |
| "what's open now" | NEARBY | ✓ | ✗ | ✓ | NEARBY + GPS + no cityText |
| "מה פתוח עכשיו" | TEXTSEARCH | ✓ | ✗ | ✗ | TEXTSEARCH always runs LLM |
| "פיצה בתל אביב" | TEXTSEARCH | ✓ | ✓ | ✗ | TEXTSEARCH always runs LLM |
| "מסעדות בגדרה" | NEARBY | ✓ | ✓ | ✗ | cityText present |

**Key Difference**: Language/keywords no longer affect gating decision. Only route + location context matters.

---

## Tests Updated

**File**: `server/src/services/search/route2/__tests__/parallel-tasks-optimization.test.ts`

### Tests Modified

1. **Test 1**: "should skip both LLM calls for NEARBY route with GPS location (Hebrew query)"
   - Updated description to emphasize structural rule
   - Validates Hebrew query with NEARBY + GPS + no cityText → skip

2. **Test 2**: "should run base_filters for TEXTSEARCH route even with GPS location"
   - Previously tested filter keyword "פתוח"
   - Now tests TEXTSEARCH route always runs LLM (regardless of query text)

3. **Test 3** (NEW): "should run base_filters when cityText present (even for NEARBY route)"
   - Validates cityText overrides NEARBY optimization
   - Ensures text-based queries always parse

4. **Test 4** (NEW): "should behave identically for Hebrew vs English queries (language-agnostic)"
   - **CRITICAL TEST**: Validates P0 requirement
   - Same intent (NEARBY + GPS + no cityText) → same behavior
   - Hebrew "מה יש לאכול" vs English "what to eat" → both skip LLM
   - Proves no language/keyword dependencies

---

## Public API Impact

### Unchanged
- Function signatures: `fireParallelTasks()` signature unchanged
- Return types: Same promise types
- Call sites: No changes needed

### Log Events

**Kept (with updated reason)**:
```json
{
  "event": "base_filters_skipped",
  "reason": "nearby_with_gps_location",  // NEW: was "generic_query_no_filter_keywords"
  "route": "NEARBY",
  "hasUserLocation": true,
  "hasCityText": false
}
```

**New Log Fields**:
```json
{
  "event": "parallel_started",
  "skipBaseFilters": true,  // NEW: explicitly logs skip decision
  "hasUserLocation": true,  // NEW: structural context
  "hasCityText": false      // NEW: structural context
}
```

**Removed Fields**:
- `hasFilterKeywords` (no longer relevant)

---

## Migration Impact

### Queries That Will Now Skip LLM (Lower Cost)

Previously ran LLM due to keywords, now skip due to structural rule:

1. **"מה פתוח עכשיו"** (what's open now) - route=NEARBY + GPS
   - Old: Ran LLM (keyword "פתוח")
   - New: Skip (NEARBY + GPS + no cityText)
   - Impact: Faster response, lower cost, but might miss "open now" filter

2. **"what's open now"** - route=NEARBY + GPS
   - Old: Ran LLM (keyword "open")
   - New: Skip (NEARBY + GPS + no cityText)
   - Impact: Same as Hebrew case

**Mitigation**: If users explicitly say "open now" with NEARBY route, consider:
- Route decision: Intent stage might route to TEXTSEARCH if "open now" is prominent
- Default filters: Can add `openState: 'OPEN_NOW'` to DEFAULT_BASE_FILTERS if needed
- Future enhancement: Intent stage can extract openState hint

### Queries That Will Now Run LLM (Higher Cost, Better Accuracy)

Previously skipped due to no keywords, now run due to structural rule:

1. **"מה יש לאכול"** (what to eat) - route=TEXTSEARCH
   - Old: Skip (no keywords)
   - New: Run LLM (TEXTSEARCH always parses)
   - Impact: Better filter extraction, slightly slower

**Net Effect**: More consistent behavior, better accuracy for text-driven queries.

---

## Validation Checklist

✅ **Code Changes**
- [x] Removed `FILTER_KEYWORDS` array
- [x] Removed `containsFilterKeywords()` function
- [x] Added `shouldSkipBaseFiltersLLM()` function
- [x] Updated gating logic in `fireParallelTasks()`
- [x] Updated log events

✅ **Tests**
- [x] Updated existing tests to reflect structural rule
- [x] Added language-agnostic test (Hebrew vs English)
- [x] Added cityText override test
- [x] All tests pass

✅ **Documentation**
- [x] Inline comments explain new structural rule
- [x] Deprecation notes for removed code
- [x] Summary document (this file)

---

## Testing Guide

### Test Case 1: NEARBY + GPS (Skip LLM)

**Query**: "מה יש לאכול" OR "what to eat"  
**Route**: NEARBY  
**GPS**: Available  
**cityText**: None

**Expected**:
```json
{
  "event": "base_filters_skipped",
  "reason": "nearby_with_gps_location"
}
```

**Validation**: Check that base_filters uses defaults (no LLM call).

---

### Test Case 2: TEXTSEARCH (Always Run LLM)

**Query**: "מה פתוח עכשיו" OR "what's open now"  
**Route**: TEXTSEARCH  
**GPS**: Available  
**cityText**: None

**Expected**:
```json
{
  "event": "base_filters_llm_started"
}
```

**Validation**: Check that base_filters LLM extracts filters (e.g., `openState: 'OPEN_NOW'`).

---

### Test Case 3: NEARBY + cityText (Run LLM)

**Query**: "מסעדות בגדרה"  
**Route**: NEARBY  
**GPS**: Available  
**cityText**: "גדרה"

**Expected**:
```json
{
  "event": "base_filters_llm_started"
}
```

**Validation**: cityText overrides NEARBY optimization.

---

### Test Case 4: Language-Agnostic Validation

**Hebrew Query**: "מה יש לאכול"  
**English Query**: "what to eat"  
**Route**: NEARBY (both)  
**GPS**: Available (both)  
**cityText**: None (both)

**Expected**: Both queries skip base_filters LLM (identical behavior).

**Validation**: Verify logs show same `base_filters_skipped` event for both.

---

## Rollback Instructions

If issues are discovered, revert with:

```bash
git revert <commit-sha>
```

Or manually restore:

1. Add back `FILTER_KEYWORDS` array (lines 19-65 in git history)
2. Add back `containsFilterKeywords()` function (lines 67-75)
3. Change line 88: `const skipBaseFilters = shouldSkipBaseFiltersLLM(...)` → `const hasFilterKeywords = containsFilterKeywords(request.query)`
4. Change line 136: `skipBaseFilters` → `(isGenericWithLocation && !hasFilterKeywords)`
5. Revert test changes

---

## Success Metrics

**Latency**:
- NEARBY + GPS queries: Should see slight latency reduction (skip LLM)
- TEXTSEARCH queries: May see slight latency increase (always run LLM)

**Cost**:
- Expected reduction: ~20% fewer base_filters LLM calls for NEARBY + GPS queries
- Expected increase: ~10% more base_filters LLM calls for TEXTSEARCH queries

**Accuracy**:
- TEXTSEARCH queries: Better filter extraction (always parse)
- NEARBY + GPS queries: Minimal impact (GPS location is primary signal)

**Monitoring**:
- Track `base_filters_skipped` event frequency
- Monitor `reason: 'nearby_with_gps_location'` vs old `reason: 'generic_query_no_filter_keywords'`
- Validate language distribution (Hebrew vs English) doesn't affect skip rate

---

## Next Steps

1. **Deploy & Monitor**: Watch logs for new skip patterns
2. **A/B Test** (Optional): Compare user satisfaction for NEARBY + GPS queries with/without LLM parsing
3. **Intent Stage Enhancement**: Consider extracting explicit filter hints (openState, priceLevel) in intent stage
4. **Default Filters Review**: Validate DEFAULT_BASE_FILTERS are appropriate for skipped queries

---

**Summary**: Replaced brittle, language-specific keyword matching with clean, structural rule based on route + location context. Hebrew/English queries now behave identically, reducing complexity and improving maintainability.

**Total Lines Removed**: ~60 (keywords + logic)  
**Total Lines Added**: ~35 (new structural function + updated logic)  
**Net Change**: Simplified, language-agnostic, easier to reason about.
