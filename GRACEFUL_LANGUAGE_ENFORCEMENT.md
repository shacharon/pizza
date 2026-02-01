# Graceful Language Enforcement for Assistant Publishing

## Problem Statement

When `langCtx` is missing during assistant message publishing (due to bugs or race conditions), the system would:

1. Fall back to hardcoded `"en"`
2. Create a mismatch between expected and actual language
3. Trigger strict enforcement violation
4. **Block the entire publish**, preventing users from seeing the assistant message

This caused **total publish failure** for a working assistant message just because context was lost.

---

## Solution: Graceful Degradation

Implement **two-tier language enforcement**:

### Tier 1: Strict Enforcement (langCtx present)

- **Behavior**: Language mismatch → throws error
- **Use case**: Normal flow with full context
- **Example**: `langCtx.assistantLanguage='en'` but message is 'he' → ❌ FAIL

### Tier 2: Graceful Degradation (langCtx missing)

- **Behavior**: Attempt to derive expected language from fallback sources
  - Priority 1: `storedLanguageContext.assistantLanguage`
  - Priority 2: `fallbackSources.queryLanguage`
  - Priority 3: `fallbackSources.uiLanguage`
  - Priority 4: If all fail → `'unknown'`
- **Enforcement**:
  - ✅ Match found → allow publish with info log
  - ⚠️ Mismatch found → **still allow** publish with warning
  - ⚠️ Unknown → **still allow** publish with warning
- **Result**: **Never blocks publish** due to missing context

---

## Implementation

### 1. New Function: `verifyAssistantLanguageGraceful`

**File**: `language-enforcement.ts`

**Signature**:

```typescript
function verifyAssistantLanguageGraceful(
  langCtx: LangCtx | undefined,
  payloadLanguage: LangCode | string | undefined,
  requestId: string,
  context: string,
  fallbackSources?: {
    uiLanguage?: "he" | "en";
    queryLanguage?: LangCode;
    storedLanguageContext?: any;
  }
): {
  allowed: boolean; // Always true
  expectedLanguage: LangCode | "unknown";
  actualLanguage: LangCode;
  source: string;
  wasEnforced: boolean; // true if strict, false if graceful
  warning?: string; // Present if issue detected
};
```

**Key Features**:

- ✅ Strict enforcement when `langCtx` present (throws on mismatch)
- ✅ Graceful fallback when `langCtx` missing (never throws)
- ✅ Derives expected from multiple fallback sources (priority order)
- ✅ Always allows publish (`allowed: true`)
- ✅ Structured logs for observability

---

### 2. Updated Publisher Flow

**File**: `assistant-publisher.ts`

**Changes**:

```typescript
// OLD (breaks on missing langCtx):
assertAssistantLanguage(langCtx, payload.language, requestId, context);

// NEW (graceful degradation):
const verification = verifyAssistantLanguageGraceful(
  langCtx,
  payload.language,
  requestId,
  context,
  {
    ...(uiLanguageFallback && { uiLanguage: uiLanguageFallback }),
    ...(langCtx?.assistantLanguage && {
      queryLanguage: langCtx.assistantLanguage,
    }),
  }
);

// Determine final language (always 'he' | 'en', never blocks)
let enforcedLanguage: "he" | "en";
if (langCtx) {
  enforcedLanguage = langCtx.assistantLanguage === "he" ? "he" : "en";
} else if (verification.actualLanguage === "he") {
  enforcedLanguage = "he";
} else if (verification.actualLanguage === "en") {
  enforcedLanguage = "en";
} else {
  // Fallback to en for unknown/other languages
  enforcedLanguage = verification.expectedLanguage === "he" ? "he" : "en";
}

// Publish succeeds with determined language
```

---

## Structured Logs

### Success Path (langCtx present):

```json
{
  "event": "assistant_publish_langCtx_present",
  "source": "captured_snapshot",
  "uiLanguage": "he",
  "assistantLanguage": "he",
  "queryLanguage": "he"
}
```

### Graceful Match (langCtx missing, derived matches):

```json
{
  "event": "assistant_language_derived_match",
  "expected": "he",
  "actual": "he",
  "context": "assistant_type:SUMMARY",
  "source": "ui_language"
}
```

### Graceful Mismatch (langCtx missing, derived != actual):

```json
{
  "event": "assistant_language_derived_mismatch",
  "expected": "en",
  "actual": "he",
  "context": "assistant_type:SUMMARY",
  "source": "ui_language"
}
// ⚠️ Warning logged, but publish STILL SUCCEEDS
```

### Graceful Unknown (langCtx missing, no fallback sources):

```json
{
  "event": "assistant_language_unverified",
  "actual": "he",
  "expected": "unknown",
  "context": "assistant_type:SUMMARY",
  "source": "no_fallback_sources"
}
// ⚠️ Warning logged, but publish STILL SUCCEEDS
```

---

## Test Coverage

**File**: `__tests__/language-enforcement-graceful.test.ts`

### Test Suites:

#### 1. Strict Enforcement (langCtx present)

- ✅ Allows matching language
- ✅ Throws on mismatch

#### 2. Graceful Degradation (langCtx missing)

- ✅ Allows publish when derived language matches
- ✅ Allows publish when derived from `queryLanguage` matches
- ✅ **Allows publish with warning when mismatch** (critical test)
- ✅ **Allows publish with warning when unknown** (critical test)
- ✅ Prioritizes `storedLanguageContext` over other sources

#### 3. Edge Cases

- ✅ Normalizes `undefined` payload language to 'en'
- ✅ Handles other language codes (ru, ar, etc.)

#### 4. Integration Flow

- ✅ End-to-end graceful degradation for SUMMARY generation

**Test Results**: 10/10 passing ✅

---

## Files Changed

### Modified:

1. **`language-enforcement.ts`**

   - Added `verifyAssistantLanguageGraceful` function (140 lines)
   - Kept existing `assertAssistantLanguage` for strict enforcement

2. **`assistant-publisher.ts`**
   - Replaced strict `assertAssistantLanguage` with graceful `verifyAssistantLanguageGraceful`
   - Added import for new function
   - Updated language determination logic to use verification result
   - Added warning logs for graceful degradation cases

### New:

3. **`__tests__/language-enforcement-graceful.test.ts`** (300 lines)
   - Comprehensive test coverage for all graceful degradation scenarios

---

## Behavior Comparison

### Before (Strict Only):

```
langCtx present + mismatch  → ❌ THROW → Publish blocked
langCtx missing             → ❌ Fallback to "en" → Mismatch → Publish blocked
```

### After (Graceful Degradation):

```
langCtx present + match     → ✅ Strict pass → Publish succeeds
langCtx present + mismatch  → ❌ Strict fail → Publish blocked (unchanged)
langCtx missing + derived match    → ✅ Graceful pass → Publish succeeds
langCtx missing + derived mismatch → ⚠️ Graceful warn → Publish STILL succeeds
langCtx missing + unknown          → ⚠️ Graceful warn → Publish STILL succeeds
```

---

## Impact

### Fixed:

- ✅ Assistant messages no longer blocked by missing `langCtx`
- ✅ Graceful degradation allows publish even with language mismatches when context missing
- ✅ Users always see assistant messages (unless strict violation when langCtx present)

### Observability:

- ✅ New structured logs: `assistant_language_derived_match`, `assistant_language_derived_mismatch`, `assistant_language_unverified`
- ✅ Clear distinction between strict enforcement and graceful degradation (`wasEnforced` field)
- ✅ Source tracking shows which fallback was used

### Backward Compatibility:

- ✅ Existing strict enforcement behavior unchanged when `langCtx` present
- ✅ No breaking changes to public API
- ✅ All existing tests pass

---

## Constraints Met

✅ **Minimal code changes** - Added one new function, modified publisher call site  
✅ **No large refactor** - Existing strict enforcement preserved  
✅ **Graceful degradation** - Never blocks publish when `langCtx` missing  
✅ **Structured logs** - All degradation paths logged with context  
✅ **Test coverage** - 10 comprehensive tests covering all scenarios

---

## Example Scenarios

### Scenario 1: Happy Path (langCtx present)

```typescript
langCtx = { assistantLanguage: 'he', ... }
message.language = 'he'

Result: ✅ Strict enforcement passes, publish succeeds
```

### Scenario 2: Strict Violation (langCtx present, mismatch)

```typescript
langCtx = { assistantLanguage: 'en', ... }
message.language = 'he'  // Mismatch!

Result: ❌ Throws LANG_ENFORCEMENT_VIOLATION, publish blocked
```

### Scenario 3: Graceful Match (langCtx missing, derived matches)

```typescript
langCtx = undefined  // Bug!
message.language = 'he'
fallbackSources = { uiLanguage: 'he' }

Result: ✅ Derives expected='he', actual='he' → match → publish succeeds
Log: assistant_language_derived_match
```

### Scenario 4: Graceful Mismatch (langCtx missing, derived != actual)

```typescript
langCtx = undefined  // Bug!
message.language = 'he'
fallbackSources = { uiLanguage: 'en' }

Result: ⚠️ Derives expected='en', actual='he' → mismatch → publish STILL succeeds
Log: assistant_language_derived_mismatch (warning)
```

### Scenario 5: Graceful Unknown (langCtx missing, no fallbacks)

```typescript
langCtx = undefined  // Bug!
message.language = 'he'
fallbackSources = {}  // No fallbacks!

Result: ⚠️ Expected='unknown', actual='he' → publish STILL succeeds
Log: assistant_language_unverified (warning)
```

---

## Summary

This implementation prevents **total assistant publish failure** when `langCtx` is missing while maintaining **strict enforcement** when context is available. The graceful degradation ensures users always see assistant messages, even when bugs cause context loss, with appropriate warnings logged for debugging.

**Key Principle**: When in doubt (context missing), **allow publish** and warn. Only block when we have full context and detect an actual violation.
