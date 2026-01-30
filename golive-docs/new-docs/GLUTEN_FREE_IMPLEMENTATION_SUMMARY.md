# Gluten-Free Dietary Preference Implementation Summary

**Date**: 2026-01-28  
**Type**: Backend Feature - SOFT Hint  
**Pipeline**: Route2 Post-Constraints

---

## Overview

Added `isGlutenFree` as a new dietary preference in the Route2 pipeline, implemented as a **SOFT hint** (no result removal). The field is extracted post-Google API call and available for future soft ranking/metadata enrichment.

---

## Implementation Details

### 1. Schema & Types (`post-constraints.types.ts`)

**Added field to PostConstraints schema:**
```typescript
isGlutenFree: z.boolean().nullable()
```

**Updated default builder:**
```typescript
buildDefaultPostConstraints(): PostConstraints {
  return {
    // ... other fields
    isGlutenFree: null,
    // ... other fields
  }
}
```

**Type**: `boolean | null`  
- `true`: User requested gluten-free  
- `null`: Not mentioned (default)  
- `false`: **NEVER SET** (SOFT hints only express positive intent)

---

### 2. LLM Prompt (`post-constraints.prompt.ts`)

**Added extraction rules:**
```
isGlutenFree (default: null):
• true: "ללא גלוטן", "gluten-free", "gluten free", "sin gluten", 
        "sans gluten", "celiac-friendly"
• NEVER set false
• null: not mentioned
```

**Multi-language keywords supported:**
- Hebrew: "ללא גלוטן"
- English: "gluten-free", "gluten free", "celiac-friendly"
- Spanish: "sin gluten"
- French: "sans gluten"

**Updated JSON schema** to include `isGlutenFree` in:
- Output format examples (6 examples updated)
- OpenAI structured output schema
- Required fields list

---

### 3. Orchestrator Wiring

#### `orchestrator.filters.ts`
- **Stage telemetry**: Added `isGlutenFree` to post_filter stage metadata
- **Filter merging**: Wire `isGlutenFree` from post-constraints to final filters
- **usedPostConstraints**: Include `isGlutenFree !== null` check
- **Applied filters**: Add `"gluten-free:soft"` to `meta.appliedFilters` when `isGlutenFree === true`

#### `route2.orchestrator.ts`
- **Response building**: Include `isGlutenFree` in `filtersForPostFilter` object

#### `failure-messages.ts`
- **Default value**: Set `isGlutenFree: null` in `DEFAULT_POST_CONSTRAINTS`

---

### 4. Test Coverage

**New test file**: `tests/post-constraints-gluten-free.test.ts`

**Test suites:**
1. **Schema validation** (5 tests)
   - Accept `isGlutenFree: true`
   - Accept `isGlutenFree: null`
   - Reject missing field
   - Reject invalid types
   
2. **Default builder** (2 tests)
   - Defaults to `null`
   - Includes all required fields

3. **Type safety** (1 test)
   - TypeScript type inference

4. **Integration with other dietary preferences** (2 tests)
   - Multiple dietary preferences (kosher + gluten-free)
   - Mixed values

**Test results**: ✅ 10 tests, 5 suites, all passing

---

## What Was NOT Changed

As per requirements, the following remain **unchanged**:

1. ❌ **Google API calls** - No changes to Maps/Places API parameters
2. ❌ **Caching logic** - Cache keys/TTL remain the same
3. ❌ **Result filtering** - No results are removed based on gluten-free
4. ❌ **Post-results stage** - No filtering logic implemented yet
5. ❌ **Frontend** - No UI changes (backend-only)

---

## Applied Filters Metadata

When `isGlutenFree === true`, the response includes:

```json
{
  "meta": {
    "appliedFilters": ["gluten-free:soft"]
  }
}
```

The `:soft` suffix indicates this is a **soft hint** (affects ranking/metadata, not filtering).

---

## Data Flow

```
User Query
    ↓
[GATE] → [INTENT] → [ROUTE-LLM]
    ↓
[PARALLEL: BaseFilters + PostConstraints (LLM)]
    ↓
[GOOGLE MAPS] ← uses BaseFilters only
    ↓
[POST-FILTER] ← merges PostConstraints (isGlutenFree)
    ↓
[RESPONSE] ← meta.appliedFilters includes "gluten-free:soft"
```

---

## Example Usage

### Input Query (Hebrew)
```
"מסעדות איטלקיות ללא גלוטן בתל אביב"
```

### Post-Constraints LLM Output
```json
{
  "openState": null,
  "openAt": null,
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "isGlutenFree": true,
  "requirements": {
    "accessible": null,
    "parking": null
  }
}
```

### Search Response Metadata
```json
{
  "results": [...],
  "meta": {
    "appliedFilters": ["gluten-free:soft"],
    ...
  }
}
```

---

## Files Modified

### Core Implementation
1. `server/src/services/search/route2/shared/post-constraints.types.ts`
2. `server/src/services/search/route2/prompts/post-constraints.prompt.ts`
3. `server/src/services/search/route2/orchestrator.filters.ts`
4. `server/src/services/search/route2/route2.orchestrator.ts`
5. `server/src/services/search/route2/failure-messages.ts`

### Tests
6. `server/src/services/search/route2/__tests__/near-me-hotfix.test.ts` (mock updated)
7. `server/tests/post-constraints-gluten-free.test.ts` (NEW)

**Total**: 7 files (5 modified, 2 updated/created)

---

## Next Steps (Future Work)

The field is now available for:

1. **Soft ranking** - Boost restaurants with gluten-free options
2. **Metadata enrichment** - Add gluten-free indicators to results
3. **Analytics** - Track gluten-free query volume
4. **Assistant hooks** - Mention gluten-free context in LLM responses

**Note**: No filtering/removal logic should be added (SOFT hint contract).

---

## Verification Commands

```bash
# Run gluten-free test
npm test tests/post-constraints-gluten-free.test.ts

# Check linter
# (No errors expected in modified files)

# Type check
tsc --noEmit
```

---

## Migration Notes

- **Backward compatible**: Existing queries default to `isGlutenFree: null`
- **No schema migration needed**: New field is nullable
- **No cache invalidation needed**: Cache keys unchanged
- **Frontend can ignore**: Field is optional in response metadata

---

## Technical Decisions

1. **Why SOFT hint?**  
   - Google Places doesn't reliably provide dietary restriction data
   - Removing results could filter out restaurants with gluten-free options
   - Better to keep all results and use hints for ranking

2. **Why multi-language keywords?**  
   - App serves Hebrew, English, Spanish, French users
   - LLM can extract intent from any language query

3. **Why never set false?**  
   - Absence of keyword means "don't care", not "exclude gluten-free"
   - Consistent with other SOFT hints (accessible, parking)

---

**Status**: ✅ Complete - Ready for production
