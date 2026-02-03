# Language Field Audit - Route2 Pipeline

**Date**: 2026-02-03  
**Status**: ✅ AUDITED - ISSUE IDENTIFIED

## Executive Summary

Audited all language fields across Gate2, Intent, BaseFilters, and Assistant stages to ensure `intent.language` is the single source of truth. Found that `base_filters.language` creates potential conflicts in assistant language resolution.

**Issue**: `base_filters.language` can override `intent.language` in the assistant priority chain (priority 3), creating language drift when intent language is 'other' or missing.

**Solution**: Deprecate `base_filters.language` usage for assistant resolution. Use `intent.language` as single source of truth.

---

## Language Fields Inventory

### 1. Gate2 Stage

**File**: `server/src/services/search/route2/stages/gate2.stage.ts`  
**Field**: `language: Gate2Language`  
**Values**: `'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'`  
**Status**: ❌ **NOT USED** (Always returns `'other'` - hardcoded)

```typescript
return {
  foodSignal: "NO",
  language: "other", // ← Hardcoded, not useful
  route: "STOP",
  confidence: 0.1,
};
```

**Verdict**: Gate2 language is ignored everywhere. Safe to leave as-is.

---

### 2. Intent Stage (SINGLE SOURCE OF TRUTH ✅)

**File**: `server/src/services/search/route2/stages/intent/intent.stage.ts`  
**Field**: `language: Gate2Language`  
**Values**: `'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other'`  
**Status**: ✅ **PRIMARY SOURCE**

```typescript
export interface IntentResult {
  route: MappingRoute;
  confidence: number;
  reason: string;
  language: Gate2Language; // ← SINGLE SOURCE OF TRUTH
  regionCandidate: string | null;
  regionConfidence: number;
  regionReason: string;
  cityText?: string | null;
}
```

**Detection Method**: LLM-based language detection in intent prompt  
**Usage**:

- ✅ Derives `finalFilters.uiLanguage` and `finalFilters.providerLanguage`
- ✅ Used in all assistant context calls
- ✅ Used in language resolution guards
- ✅ Logged in HTTP response

**Verdict**: This is the authoritative language field. All other fields should defer to this.

---

### 3. Base Filters Stage (CONFLICTING ⚠️)

**File**: `server/src/services/search/route2/shared/base-filters-llm.ts`  
**Field**: `language: 'he' | 'en' | 'auto'`  
**Values**: Only 3 values (different from Intent's 7 values)  
**Status**: ⚠️ **POTENTIAL CONFLICT**

```typescript
export interface PreGoogleBaseFilters {
  language: "he" | "en" | "auto"; // ← DUPLICATE detection
  openState: OpenState;
  openAt: OpenAt;
  openBetween: OpenBetween;
  regionHint: string | null;
}
```

**Detection Method**: Separate LLM call with different prompt (BASE_FILTERS_PROMPT)  
**Purpose**: Originally intended to detect language for filter extraction  
**Problem**: Creates second language detection that can conflict with `intent.language`

**Current Usage**:

1. ❌ Used in `resolveAssistantLanguage` (priority 3)
   ```typescript
   baseFilters: ctx.sharedFilters?.preGoogle?.language
     ? toAssistantLanguage(ctx.sharedFilters.preGoogle.language)
     : undefined,
   ```
2. ✅ Logged in `filters_resolved` event (informational only)
3. ❌ NOT used in final filters derivation (correct - intent.language is used)

**Verdict**: Should be DEPRECATED or marked as informational only. Should NOT influence assistant language.

---

### 4. Final Shared Filters (DERIVED FROM INTENT ✅)

**File**: `server/src/services/search/route2/shared/shared-filters.types.ts`  
**Fields**: `uiLanguage` + `providerLanguage`  
**Status**: ✅ **CORRECTLY DERIVED**

```typescript
export interface FinalSharedFilters {
  uiLanguage: "he" | "en"; // ← Simplified for UI
  providerLanguage: "he" | "en" | "ar" | "fr" | "es" | "ru"; // ← Preserves intent
  openState: OpenState;
  openAt: OpenAt;
  openBetween: OpenBetween;
  regionCode: string;
  disclaimers: { hours: true; dietary: true };
}
```

**Derivation** (`filters-resolver.ts` lines 27-34):

```typescript
// 1. Resolve UI language (he or en only)
const uiLanguage: "he" | "en" = intent.language === "he" ? "he" : "en";

// 2. Resolve provider language (preserve intent language)
const providerLanguage: "he" | "en" | "ar" | "fr" | "es" | "ru" = [
  "he",
  "en",
  "ar",
  "fr",
  "es",
  "ru",
].includes(intent.language)
  ? (intent.language as any)
  : "he"; // fallback
```

**Verdict**: ✅ Correctly uses `intent.language`. No changes needed.

---

### 5. Assistant Language Resolution (MIXED ⚠️)

**File**: `server/src/services/search/route2/orchestrator.helpers.ts`  
**Function**: `resolveAssistantLanguage()`  
**Status**: ⚠️ **USES BASE_FILTERS AS FALLBACK**

**Priority Chain**:

1. ✅ Intent language (detectedLanguage param) - CORRECT
2. ✅ Query language detection (ctx.queryLanguage) - CORRECT
3. ⚠️ **Base filters language** - SHOULD BE REMOVED
4. ✅ UI language (last resort) - CORRECT
5. ✅ Fallback: 'en' - CORRECT

**Current Code** (lines 68-92):

```typescript
const candidates = {
  intent: detectedLanguage ? toAssistantLanguage(detectedLanguage) : undefined,
  queryDetected: ctx.queryLanguage
    ? toAssistantLanguage(ctx.queryLanguage)
    : undefined,
  baseFilters: ctx.sharedFilters?.preGoogle?.language // ← PROBLEM
    ? toAssistantLanguage(ctx.sharedFilters.preGoogle.language)
    : undefined,
  uiLanguage: ctx.sharedFilters?.final?.uiLanguage
    ? toAssistantLanguage(ctx.sharedFilters.final.uiLanguage)
    : undefined,
};

// Priority 3: Base filters language
if (!chosen && candidates.baseFilters && candidates.baseFilters !== "other") {
  chosen = candidates.baseFilters;
  source = "baseFilters"; // ← Can override intent
}
```

**Problem Scenario**:

```
User Query: "رستوران" (Arabic)
intent.language: 'ar' (detected correctly)
base_filters.language: 'en' (LLM error or 'auto' mapped to 'en')

If resolveAssistantLanguage() is called WITHOUT detectedLanguage param:
  → Priority 1 (intent): undefined ❌
  → Priority 2 (queryDetected): 'ar' ✅
  → Would choose 'ar' correctly

BUT if queryLanguage is also undefined:
  → Priority 3 (baseFilters): 'en'
  → Would choose 'en' ❌ (WRONG - should use intent.language)
```

**Verdict**: ⚠️ Remove `base_filters.language` from priority chain.

---

## Recommended Changes

### Change 1: Remove base_filters.language from Assistant Resolution

**File**: `server/src/services/search/route2/orchestrator.helpers.ts`

**Before** (lines 68-92):

```typescript
const candidates = {
  intent: detectedLanguage ? toAssistantLanguage(detectedLanguage) : undefined,
  queryDetected: ctx.queryLanguage
    ? toAssistantLanguage(ctx.queryLanguage)
    : undefined,
  baseFilters: ctx.sharedFilters?.preGoogle?.language
    ? toAssistantLanguage(ctx.sharedFilters.preGoogle.language)
    : undefined,
  uiLanguage: ctx.sharedFilters?.final?.uiLanguage
    ? toAssistantLanguage(ctx.sharedFilters.final.uiLanguage)
    : undefined,
};

// ... priority checks ...

// 3. Base filters language
if (!chosen && candidates.baseFilters && candidates.baseFilters !== "other") {
  chosen = candidates.baseFilters;
  source = "baseFilters";
}
```

**After**:

```typescript
const candidates = {
  intent: detectedLanguage ? toAssistantLanguage(detectedLanguage) : undefined,
  queryDetected: ctx.queryLanguage
    ? toAssistantLanguage(ctx.queryLanguage)
    : undefined,
  // REMOVED: baseFilters.language (deprecated - intent.language is single source of truth)
  uiLanguage: ctx.sharedFilters?.final?.uiLanguage
    ? toAssistantLanguage(ctx.sharedFilters.final.uiLanguage)
    : undefined,
};

// ... priority checks ...

// Priority 3 removed (was base filters language)

// 3. UI language — LAST RESORT ONLY (renumbered from 4)
if (!chosen && candidates.uiLanguage && candidates.uiLanguage !== "other") {
  chosen = candidates.uiLanguage;
  source = "uiLanguage";
}
```

**Impact**: Assistant language will now only use:

1. Intent language (if provided)
2. Query language detection (deterministic)
3. UI language (last resort)
4. Fallback: 'en'

This ensures `intent.language` is always the source of truth.

---

### Change 2: Add Deprecation Comment to PreGoogleBaseFilters

**File**: `server/src/services/search/route2/shared/shared-filters.types.ts`

**Before** (lines 55-70):

```typescript
/**
 * Pre-Google Base Filters
 *
 * Applied before calling Google Places API
 * - language can be 'auto' (will be resolved before final)
 * - regionHint is optional but must be in schema as nullable
 * - openState: null unless explicitly requested
 */
export const PreGoogleBaseFiltersSchema = z.object({
  language: z.enum(["he", "en", "auto"]),
  openState: OpenStateSchema,
  // ...
});
```

**After**:

```typescript
/**
 * Pre-Google Base Filters
 *
 * Applied before calling Google Places API
 *
 * IMPORTANT - Language Field:
 * - language field is INFORMATIONAL ONLY (used for logging)
 * - DEPRECATED for decision-making - use intent.language instead
 * - intent.language is the single source of truth
 * - This field exists for historical reasons and filter extraction context
 *
 * - regionHint is optional but must be in schema as nullable
 * - openState: null unless explicitly requested
 */
export const PreGoogleBaseFiltersSchema = z.object({
  language: z.enum(["he", "en", "auto"]), // DEPRECATED: Use intent.language
  openState: OpenStateSchema,
  // ...
});
```

---

### Change 3: Update BASE_FILTERS_PROMPT Comment

**File**: `server/src/services/search/route2/shared/base-filters-llm.ts`

**Add Comment** (after line 17):

```typescript
const BASE_FILTERS_PROMPT = `You are a filter extractor for restaurant search queries.

IMPORTANT: The 'language' field is informational only. It does NOT override intent.language.
Intent stage already detected language - this is for filter extraction context only.

Output ONLY JSON with ALL 5 fields (NEVER omit any field):
{
  "language": "he|en|auto",  // INFORMATIONAL: For logging only, use intent.language for decisions
  "openState": "OPEN_NOW"|"CLOSED_NOW"|"OPEN_AT"|"OPEN_BETWEEN"|null,
  // ...
}
```

---

## Call Sites That Use Language Fields

### ✅ Correct Usage (Using intent.language)

1. **filters-resolver.ts** (lines 28-34)

   ```typescript
   const uiLanguage: "he" | "en" = intent.language === "he" ? "he" : "en";
   const providerLanguage = ["he", "en", "ar", "fr", "es", "ru"].includes(
     intent.language
   )
     ? (intent.language as any)
     : "he";
   ```

2. **orchestrator.guards.ts** (lines 230, 376, 485)

   ```typescript
   const uiLanguageGuard = mapQueryLanguageToUILanguage(
     intentDecision.language
   );
   const googleLanguageGuard: "he" | "en" =
     intentDecision.language === "he" ? "he" : "en";
   ```

3. **orchestrator.response.ts** (lines 40-44)

   ```typescript
   const detectedLanguageRaw = intentDecision.language;
   const detectedLanguage = toRequestLanguage(detectedLanguageRaw);
   ```

4. **orchestrator.early-context.ts** (lines 56-59)

   ```typescript
   const providerLanguage: ProviderLanguage = isProviderLanguage(
     intent.language
   )
     ? intent.language
     : "he";
   const uiLanguage: RequestLanguage = toRequestLanguage(intent.language);
   ```

5. **All assistant context calls** (multiple files)
   ```typescript
   language: resolveAssistantLanguage(ctx, request, intentDecision.language);
   ```

### ⚠️ Problematic Usage (Using base_filters.language)

1. **orchestrator.helpers.ts** (lines 68-92) - FLAGGED FOR REMOVAL
   ```typescript
   baseFilters: ctx.sharedFilters?.preGoogle?.language
     ? toAssistantLanguage(ctx.sharedFilters.preGoogle.language)
     : undefined,
   ```

---

## Testing Scenarios

### Scenario 1: Arabic Query with Conflicting base_filters

**Setup**:

- User query: "رستوران"
- intent.language: 'ar'
- base_filters.language: 'en' (LLM error)

**Before Fix**:

- If resolveAssistantLanguage called without intent param → might use base_filters → 'en' ❌

**After Fix**:

- Priority 1: Intent (if provided) → 'ar' ✅
- Priority 2: Query detection → 'ar' ✅
- Priority 3: UI language (was base_filters) → skipped
- Result: 'ar' ✅

### Scenario 2: Russian Query with 'auto' base_filters

**Setup**:

- User query: "ресторан"
- intent.language: 'ru'
- base_filters.language: 'auto'

**Before Fix**:

- toAssistantLanguage('auto') → 'other'
- Priority 3 skipped (candidates.baseFilters === 'other')
- Would correctly use intent or queryDetected ✅

**After Fix**:

- Same behavior (base_filters removed doesn't impact this)
- Result: 'ru' ✅

### Scenario 3: Hebrew Query with Missing Context

**Setup**:

- User query: "מסעדה"
- intent.language: 'he'
- resolveAssistantLanguage called WITHOUT detectedLanguage param
- ctx.queryLanguage: undefined (edge case)

**Before Fix**:

- Priority 1 (intent): undefined ❌
- Priority 2 (queryDetected): undefined ❌
- Priority 3 (baseFilters): 'he' (might work by accident)
- Would use base_filters → 'he' ✅ (correct but fragile)

**After Fix**:

- Priority 1 (intent): undefined ❌
- Priority 2 (queryDetected): undefined ❌
- Priority 3 (uiLanguage): 'he' ✅
- Result: 'he' ✅ (more reliable source)

---

## UX Impact

**Zero UX Changes Expected**:

1. All visible call sites already use `intent.language` correctly
2. `resolveAssistantLanguage()` already prioritizes intent language (priority 1)
3. Removing base_filters from priority chain only affects edge cases where:
   - Intent language is not passed as param (should always be passed)
   - Query language detection fails (rare)
   - In these cases, UI language is now used instead of base_filters (safer)

**Logging Changes**:

- `assistant_language_resolved` event will no longer show `candidates.baseFilters`
- No user-visible impact

---

## Files to Modify

1. ✅ `server/src/services/search/route2/orchestrator.helpers.ts`

   - Remove base_filters from resolveAssistantLanguage priority chain

2. ✅ `server/src/services/search/route2/shared/shared-filters.types.ts`

   - Add deprecation comment to PreGoogleBaseFilters.language

3. ✅ `server/src/services/search/route2/shared/base-filters-llm.ts`

   - Add comment clarifying language field is informational only

4. ✅ Update test: `server/src/services/search/route2/__tests__/orchestrator.helpers.test.ts`
   - Remove tests that check base_filters priority
   - Verify new priority chain (intent → queryDetected → uiLanguage → fallback)

---

## Validation Checklist

- [ ] All call sites using `intent.language` (verified - no changes needed)
- [ ] `resolveAssistantLanguage` no longer uses `base_filters.language`
- [ ] Deprecation comments added
- [ ] Tests updated
- [ ] No linter errors
- [ ] Zero UX changes

---

## Related Documentation

- `server/ASSISTANT_LANGUAGE_FIX.md` - Previous language drift fix
- `server/ASSISTANT_LANGUAGE_SUMMARY.md` - Language resolution architecture

---

## Conclusion

**Root Cause**: `base_filters.language` creates duplicate language detection that can conflict with `intent.language`.

**Fix**: Remove `base_filters.language` from assistant resolution priority chain. Mark as deprecated/informational.

**Benefit**: Ensures `intent.language` is the single source of truth, preventing language drift in edge cases.

**Risk**: Low - base_filters was only priority 3 fallback, rarely used in practice.
