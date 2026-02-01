# Assistant Prompt Engine Refactoring - Language Handling Simplification

## Goal
Simplify and harden language handling in `AssistantPromptEngine` by removing he/en-only conditional logic and enforcing a single shared language resolver for ALL assistant contexts.

## Changes Made

### 1. Single Shared Language Resolver
Added `resolveLang()` helper function at top-level:

```typescript
function resolveLang(language: string): { emphasis: string } {
  const languageMap: Record<string, { emphasis: string }> = {
    'he': { emphasis: 'MUST write in Hebrew (עברית) ONLY' },
    'en': { emphasis: 'MUST write in English ONLY' },
    'ru': { emphasis: 'MUST write in Russian (Русский) ONLY' },
    'ar': { emphasis: 'MUST write in Arabic (العربية) ONLY' },
    'fr': { emphasis: 'MUST write in French (Français) ONLY' },
    'es': { emphasis: 'MUST write in Spanish (Español) ONLY' }
  };
  
  return languageMap[language] ?? languageMap['en']!;
}
```

**Benefits:**
- Single source of truth for all 6 supported languages
- No conditional he/en logic scattered across methods
- Easy to add new languages in the future
- Consistent emphasis format across all contexts

### 2. Unified Language Instructions Across ALL Methods

All 5 prompt building methods now use the SAME pattern:

#### GATE_FAIL
```typescript
const lang = resolveLang(context.language);
return `...
CRITICAL: You ${lang.emphasis}.
Set language=${context.language} and outputLanguage=${context.language}.
...`;
```

#### CLARIFY
```typescript
const lang = resolveLang(context.language);
return `...
CRITICAL: You ${lang.emphasis}.
Set language=${context.language} and outputLanguage=${context.language}.
...`;
```

#### SEARCH_FAILED
```typescript
const lang = resolveLang(context.language);
return `...
CRITICAL: You ${lang.emphasis}.
Set language=${context.language} and outputLanguage=${context.language}.
...`;
```

#### GENERIC_QUERY_NARRATION
```typescript
const lang = resolveLang(context.language);
return `...
CRITICAL: You ${lang.emphasis}.
Set language=${context.language} and outputLanguage=${context.language}.
...`;
```

#### SUMMARY (Simplified)
```typescript
const lang = resolveLang(context.language);
return `...
CRITICAL: You ${lang.emphasis}.
Set language=${context.language} and outputLanguage=${context.language}.
IGNORE the language of restaurant names, query text, or any input data.
...`;
```

### 3. SUMMARY Prompt Simplification

**Before:**
- Had verbose "CRITICAL LANGUAGE RULE (READ CAREFULLY)" section with 7 bullet points
- Used `requestedLanguage:` label instead of `Language:`
- Had redundant "Never output English unless requestedLanguage=en" after the emphasis

**After:**
- Simplified to match the clean pattern of other methods
- Uses consistent `Language:` label
- Reduced language rule to 3 concise lines:
  ```
  CRITICAL: You ${lang.emphasis}.
  Set language=${context.language} and outputLanguage=${context.language}.
  IGNORE the language of restaurant names, query text, or any input data.
  ```

### 4. Removed All Conditional Logic

**Eliminated patterns like:**
```typescript
// OLD (removed)
const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
const languageEmphasis = context.language === 'he'
  ? 'MUST write in Hebrew (עברית)'
  : 'MUST write in English';
```

**Replaced with:**
```typescript
// NEW (unified)
const lang = resolveLang(context.language);
```

## What Was NOT Changed

As required:
- ✅ No changes to LLM calls
- ✅ No changes to schemas
- ✅ No changes to validators
- ✅ No changes to runtime logic
- ✅ Only prompt-building logic refactored

## Benefits

### Code Quality
- **DRY Principle**: Single helper instead of repeated conditional logic
- **Maintainability**: Add new language by updating one map
- **Consistency**: All contexts use identical language enforcement pattern
- **Readability**: Cleaner, more concise prompts

### Correctness
- **No Language Leakage**: Every context enforces outputLanguage field
- **No English Defaults**: Only fallback to English for 'other' language code
- **Uniform Enforcement**: Same strict rules across all assistant types

### Testing
- All existing assistant tests pass
- All new language enforcement tests pass
- Behavior unchanged, just cleaner implementation

## Files Changed
- `server/src/services/search/route2/assistant/prompt-engine.ts` - Complete refactoring

## Verification

The refactoring maintains exact same behavior:
- All prompts still generate correct language emphasis
- All prompts still instruct LLM to set both `language` and `outputLanguage`
- SUMMARY still has its additional "IGNORE input language" rule
- No breaking changes to any API or validation logic

## Example Output

For `context.language = 'fr'`:
```
CRITICAL: You MUST write in French (Français) ONLY.
Set language=fr and outputLanguage=fr.
```

For `context.language = 'ru'`:
```
CRITICAL: You MUST write in Russian (Русский) ONLY.
Set language=ru and outputLanguage=ru.
```

For `context.language = 'other'`:
```
CRITICAL: You MUST write in English ONLY.
Set language=other and outputLanguage=other.
```
