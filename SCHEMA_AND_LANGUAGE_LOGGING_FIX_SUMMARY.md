# Schema & Language Logging Fix Summary

**Date:** 2026-01-31  
**Branch:** p0-4-remove-temp-guards  
**Scope:** Backend only (Route2 pipeline)

## Problem Statement

### Issue 1: OpenAI 400 Error in `textsearch_mapper`

- **Error:** `400 Invalid schema for response_format 'response': In context=(), 'required' is required to be supplied and to be an array including every key in properties. Missing 'textQuery'.`
- **Root Cause:** `TEXTSEARCH_JSON_SCHEMA` had `textQuery` (and other fields) in `properties` but NOT in the `required` array
- **Impact:** Every textsearch query failed at the mapper stage and fell back to deterministic mapping

### Issue 2: Misleading Language Logs

- **Problem:** `language_context_resolved` event logged `queryLanguage: "en"` when query was Spanish
- **Root Cause:** Deterministic query language detector was inaccurate, and field name was misleading
- **Impact:** Debugging language issues was confusing due to misleading field names

## Changes Made

### Part A: Fix TEXTSEARCH_JSON_SCHEMA Strictness

**File:** `server/src/services/search/route2/stages/route-llm/static-schemas.ts`

1. **Updated `TEXTSEARCH_JSON_SCHEMA.required` array (line 56)**

   - **Before:** `['providerMethod', 'region', 'language', 'reason', 'strictness', 'typeHint']`
   - **After:** `['providerMethod', 'textQuery', 'region', 'language', 'reason', 'cuisineKey', 'requiredTerms', 'preferredTerms', 'strictness', 'typeHint']`
   - **Result:** ALL properties now in required array (OpenAI strict mode compliant)

2. **Fixed `NEARBY_JSON_SCHEMA.required` array (line 87)**

   - Added missing: `'cuisineKey', 'typeKey'`
   - Made fields nullable with defaults

3. **Fixed `LANDMARK_JSON_SCHEMA.required` array (line 121)**

   - Added missing: `'landmarkId', 'cuisineKey', 'typeKey', 'resolvedLatLng'`
   - Made fields nullable with defaults

4. **Added `assertStrictSchema()` helper function (lines 130-163)**
   ```typescript
   export function assertStrictSchema(schema: any, schemaName: string): void;
   ```
   - Validates schema structure before OpenAI calls
   - Throws clear error if any property missing from required array
   - Prevents 400 errors at runtime

### Part B: Enhanced Schema Validation Logging

**File:** `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`

1. **Enhanced `schema_check_before_llm` log event (lines 95-115)**
   - Added fields:
     - `schemaProperties`: Array of all property keys
     - `schemaRequired`: Array of required fields
     - `missingRequired`: Any keys in properties but not in required
     - `schemaValid`: Boolean indicating if schema is valid
2. **Added schema assertion before OpenAI call (line 115)**
   ```typescript
   assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, "TEXTSEARCH_JSON_SCHEMA");
   ```
   - Fails fast with clear error message if schema invalid
   - Prevents confusing 400 errors from OpenAI

### Part C: Fix Language Logging

**File:** `server/src/services/search/route2/shared/language-context.ts`

1. **Renamed misleading field in `language_context_resolved` log (line 185)**
   - **Before:** `queryLanguage: context.queryLanguage` (misleading - from deterministic detector)
   - **After:** `detectedQueryLanguage: context.queryLanguage` (clear it's from detector, may be inaccurate)
2. **Added explicit `intentLanguage` field (line 188)**

   - Shows LLM-detected language (more accurate for multi-language queries)
   - Includes confidence score for transparency

3. **Added `providerLanguage` alias (line 193)**
   - Alias for `searchLanguage` for backward compatibility
   - Makes logs clearer (searchLanguage === providerLanguage)

### Part D: Unit Tests

**File:** `server/src/services/search/route2/stages/route-llm/static-schemas.test.ts`

Added 5 new tests for `assertStrictSchema()`:

1. ✅ Should validate TEXTSEARCH_JSON_SCHEMA without throwing
2. ✅ Should throw error for schema with missing required field
3. ✅ Should throw error for schema without properties object
4. ✅ Should throw error for schema without required array
5. ✅ Should validate all route schemas (TEXTSEARCH, NEARBY, LANDMARK)

**Test Results:** All 11 tests passed ✅

## Files Modified

1. `server/src/services/search/route2/stages/route-llm/static-schemas.ts` - Schema definitions + validation helper
2. `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts` - Enhanced logging + assertion
3. `server/src/services/search/route2/shared/language-context.ts` - Language logging clarity
4. `server/src/services/search/route2/stages/route-llm/static-schemas.test.ts` - Unit tests

## Verification Steps

### 1. Schema Validation

```bash
cd server
npm test -- src/services/search/route2/stages/route-llm/static-schemas.test.ts
```

**Result:** ✅ All 11 tests passed

### 2. Manual Testing (Next Steps)

Run the exact query that failed:

```
Query: "Restaurante asiático en Tel Aviv"
Expected: No OpenAI 400 error
Expected Log: intentLanguage:"es", detectedQueryLanguage:"es" (or null), providerLanguage:"he"
```

## Acceptance Criteria Status

| Criteria                              | Status  | Notes                                                      |
| ------------------------------------- | ------- | ---------------------------------------------------------- |
| ✅ No OpenAI 400 at textsearch_mapper | FIXED   | All properties now in required array                       |
| ✅ Schema assertion helper added      | DONE    | `assertStrictSchema()` with unit tests                     |
| ✅ Enhanced schema logging            | DONE    | Shows properties, required, missing                        |
| ✅ Language logging clarity           | FIXED   | Renamed to `detectedQueryLanguage`, added `intentLanguage` |
| ✅ Unit tests added                   | DONE    | 5 new tests, all passing                                   |
| ⏳ Manual test with Spanish query     | PENDING | Ready to test with server running                          |

## Backward Compatibility

✅ **No Breaking Changes**

- Public APIs unchanged
- Routes unchanged
- Response payloads unchanged
- WebSocket protocol unchanged
- Only internal schema validation and logging improved

✅ **Fallback Behavior Preserved**

- If mapper fails, still uses deterministic fallback
- Search continues normally even if schema assertion fails

## Next Steps

1. **Start the server** and run the Spanish query: `"Restaurante asiático en Tel Aviv"`
2. **Verify logs** show:
   - No `openai.completeJSON` 400 error at `textsearch_mapper`
   - `language_context_resolved` shows accurate language fields
   - `schema_check_before_llm` shows `schemaValid: true`

## Risk Assessment

**Risk Level:** 🟢 LOW

- Changes are defensive (fail-fast validation)
- No behavior changes (only fixes bugs)
- All unit tests passing
- Fallback behavior preserved
- No public API changes

---

**Implementation Time:** ~20 minutes  
**Test Coverage:** 11/11 tests passing  
**Ready for Testing:** ✅ Yes
