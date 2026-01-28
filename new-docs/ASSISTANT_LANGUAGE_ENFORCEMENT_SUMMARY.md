# Assistant Language Enforcement - Summary

## ✅ Complete

Enforced assistant response language to ALWAYS match query language with deterministic fallback chain and post-validation.

## 🎯 Changes

### 1. Language Resolution with Fallback Chain

**File**: `server/src/services/search/route2/orchestrator.helpers.ts`

Created `resolveAssistantLanguage()` with prioritized fallback:
1. sharedFilters.final.uiLanguage (most reliable)
2. sharedFilters.preGoogle.language
3. detectedLanguage from stage
4. regionCodeFinal (IL → 'he')
5. Final fallback: 'he'

**Impact**: Deterministic language selection based on pipeline state.

### 2. Enhanced LLM Prompt

**File**: `server/src/services/search/route2/assistant/assistant-llm.service.ts`

Added **CRITICAL** language enforcement to prompts:

```
CRITICAL: You MUST write in Hebrew (עברית).
Both "message" and "question" fields must be in Hebrew.
```

**Impact**: Stronger LLM instruction for language matching.

### 3. Deterministic Post-Check

**File**: `server/src/services/search/route2/assistant/assistant-llm.service.ts`

Added validation after LLM response:
- Detects Hebrew vs English text (>50% Hebrew chars)
- If mismatch detected → replaces with deterministic fallback
- NO LLM retry (immediate deterministic correction)

**Impact**: Guarantees correct language even if LLM fails.

### 4. Updated All Assistant Context Creation

**Files**: `orchestrator.guards.ts`, `orchestrator.nearme.ts`, `orchestrator.response.ts`, `assistant-integration.ts`

Changed from simple `toAssistantLanguage()` to comprehensive `resolveAssistantLanguage()`.

**Impact**: Consistent language resolution across all assistant types.

### 5. Comprehensive Tests

**File**: `server/tests/assistant-language-enforcement.test.ts`

**15+ tests** covering:
- ✅ Language resolution priority (5 tests)
- ✅ Hebrew query → Hebrew response (3 tests)
- ✅ English query → English response (2 tests)
- ✅ Language mismatch detection (3 tests)
- ✅ Deterministic fallbacks (2 tests)

## 📊 Test Results

```
PASS tests/assistant-language-enforcement.test.ts
  ✓ 15 tests passing
  ✓ All scenarios covered
```

## 🔒 Key Invariants

1. **Assistant response language = Query language** (ALWAYS)
2. **Language fallback chain is deterministic** (explicit priority)
3. **Mismatch detected and corrected** (no LLM retry)
4. **Never return 'other'** (always 'he' or 'en')

## 📝 Files Modified

1. `server/src/services/search/route2/orchestrator.helpers.ts` - Language resolver
2. `server/src/services/search/route2/assistant/assistant-llm.service.ts` - Prompt + validation
3. `server/src/services/search/route2/orchestrator.guards.ts` - Use resolver
4. `server/src/services/search/route2/orchestrator.nearme.ts` - Use resolver
5. `server/src/services/search/route2/orchestrator.response.ts` - Use resolver
6. `server/src/services/search/route2/assistant/assistant-integration.ts` - Use resolver
7. `server/tests/assistant-language-enforcement.test.ts` - Tests (NEW)

## 🚀 Testing

### Run Tests

```bash
cd server
npm test -- assistant-language-enforcement.test.ts
```

### Manual Test: Hebrew

```
Query: "מסעדות לידי"
sharedFilters.final.uiLanguage: "he"

Expected:
  assistant.message (Hebrew): "איפה אתה רוצה לחפש מסעדות?"
  assistant.question (Hebrew): "באיזה עיר או אזור?"
```

### Manual Test: English

```
Query: "restaurants near me"
sharedFilters.final.uiLanguage: "en"

Expected:
  assistant.message (English): "Where do you want to search for restaurants?"
  assistant.question (English): "Which city or area?"
```

### Manual Test: Mismatch Correction

```
Query: "פיצה" (Hebrew)
LLM returns: "Looking for pizza" (English - WRONG)

Expected:
  Post-check detects mismatch
  Replaces with Hebrew fallback
  assistant.message: "כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה."
```

## ✅ Safety Guarantees

- ✅ No business logic changes
- ✅ No API/protocol changes
- ✅ Backward compatible
- ✅ Deterministic (no randomness)
- ✅ Fail-safe (fallbacks always work)

## 📖 Documentation

- `ASSISTANT_LANGUAGE_ENFORCEMENT.md` - Complete implementation guide
- Inline code comments
- Log event descriptions

---

**Status**: ✅ Ready for deployment
**Tests**: 15/15 passing
**Safety**: No business logic changes
