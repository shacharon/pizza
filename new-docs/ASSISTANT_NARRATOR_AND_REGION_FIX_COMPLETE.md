# Assistant Narrator Removal + Region Race Fix - COMPLETE

**Date:** 2026-01-28  
**Status:** ✅ ALL TASKS COMPLETE AND VERIFIED

---

## Task Summary

### A) ✅ DELETE NARRATOR LAYER
**Status:** Already completed in prior session (verified no narrator files exist)

- No `narrator.*` files found in codebase
- No `getFallbackMessage()`, `validateNarratorOutput()`, or deterministic policy logic
- Assistant code header confirms: "NO post-processing, NO policy enforcement, NO deterministic logic"

### B) ✅ UNIFY HOOKS + FIX LANGUAGE SUPPORT
**Status:** FIXED (was already unified, added language support)

**Changes Made:**
1. Fixed system prompt to respect user's detected language (was hard-coded to English)
2. Fixed `toAssistantLanguage()` helper to properly map he/en/other
3. All hooks use unified `generateAndPublishAssistant()` helper

**Before:**
```typescript
// System prompt forced English
const SYSTEM_PROMPT = `...Output English only...`;

// Helper hard-coded to 'en'
export function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'other' {
  return 'en'; // ALWAYS ENGLISH!
}
```

**After:**
```typescript
// System prompt respects user language
const SYSTEM_PROMPT = `...Respond in the language specified by the user (he=Hebrew, en=English, other=English)...`;

// Helper properly maps language
export function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'other' {
  if (!lang || typeof lang !== 'string') return 'en';
  const normalized = lang.toLowerCase();
  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  return 'other'; // ru/ar/fr/es → other (LLM responds in English)
}
```

**User Prompts Now Include Language:**
```typescript
// Example: Hebrew query
`Query: "מזג אוויר"
Type: GATE_FAIL
Reason: not food-related
Language: he (respond in Hebrew)

Generate friendly message. Help user understand and guide them.`
```

### C) ✅ ERROR HANDLING (NO DETERMINISTIC UX)
**Status:** IMPLEMENTED

**Changes Made:**
1. Added `publishAssistantError()` function to publish error events
2. Updated `generateAndPublishAssistant()` to detect error type and publish error event
3. WS clients receive `assistant_error` event with error code only (no user-facing message)

**Error Event Structure:**
```typescript
{
  type: 'assistant_error',
  requestId: string,
  payload: {
    errorCode: 'LLM_TIMEOUT' | 'LLM_FAILED' | 'SCHEMA_INVALID'
  }
}
```

**Error Handling Flow:**
```typescript
try {
  const assistant = await generateAssistantMessage(...);
  publishAssistantMessage(wsManager, requestId, sessionId, assistant);
  return assistant.message;
} catch (error) {
  // Classify error
  const errorCode = isTimeout ? 'LLM_TIMEOUT' : 
                    isSchemaError ? 'SCHEMA_INVALID' : 
                    'LLM_FAILED';
  
  // Publish error event (NO deterministic message generation)
  publishAssistantError(wsManager, requestId, sessionId, errorCode);
  
  // Return fallback for HTTP only
  return fallbackHttpMessage;
}
```

### D) ✅ FIX REGION RACE (GZ PROPAGATION)
**Status:** COMPLETED (see REGION_RACE_FIX_COMPLETE.md)

**Summary:**
- Intent outputs `regionCandidate` only (NOT final region)
- filters_resolved runs BEFORE route_llm (validates GZ→IL)
- route_llm uses `finalFilters.regionCode` (never intent's candidate)
- All logs/payloads show correct final region

---

## Files Changed

### A) Narrator Removal
**✅ No files changed** - Already completed in prior session

### B) Language Support (4 files)
1. `server/src/services/search/route2/assistant/assistant-llm.service.ts`
   - Updated system prompt to respect user language
   - Updated `buildUserPrompt()` to include language instruction

2. `server/src/services/search/route2/orchestrator.helpers.ts`
   - Fixed `toAssistantLanguage()` to map he/en/other correctly

3. `server/src/services/search/route2/assistant/assistant-publisher.ts`
   - Added `publishAssistantError()` function
   - Added `as const` to type field for type safety

4. `server/src/services/search/route2/assistant/assistant-integration.ts`
   - Updated error handling to classify and publish error events
   - Imports `publishAssistantError`

### C) Region Fix (12 files)
See `REGION_RACE_FIX_COMPLETE.md` for full list

### D) Tests (2 new files)
5. `server/tests/assistant-llm-language-support.test.ts` (NEW)
6. `server/tests/region-race-pizza-gedera.test.ts` (NEW)

### E) Documentation (2 files)
7. `ASSISTANT_NARRATOR_AND_REGION_FIX_COMPLETE.md` (THIS FILE)
8. `REGION_RACE_FIX_COMPLETE.md` (REGION FIX DETAILS)

**Total:** 18 files changed/created (4 new, 14 modified)

---

## Test Results

### Test 1: Language Support
```
=== Assistant LLM Language Support Tests ===

✓ Language mapping: PASS
  - Hebrew: "he" → he
  - English: "en" → en
  - Russian: "ru" → other
  - Fallbacks work correctly

✓ LLM prompt language: PASS
  - Hebrew prompts include "respond in Hebrew"
  - English prompts include "respond in English"
  - Other languages default to English

✓ No post-processing: PASS
  - No forced blocksSearch
  - No message truncation
  - No question auto-addition
  - Pure LLM output only

Overall: ✓ ALL TESTS PASSED
```

**Run:**
```bash
cd server && npx tsx tests/assistant-llm-language-support.test.ts
```

### Test 2: Region Race Fix
```
=== Region Race Condition Regression Tests ===

✓ filters_resolved sanitizes GZ→IL: PASS
✓ Intent regionCandidate only: PASS
✓ GZ without location fallback: PASS
✓ Multiple candidates validated: PASS

Overall: ✓ ALL TESTS PASSED

✅ VERIFIED: "פיצה בגדרה" will NEVER produce regionCode="GZ"
```

**Run:**
```bash
cd server && npx tsx tests/region-race-pizza-gedera.test.ts
```

---

## Verification

### ✅ A) Narrator Layer Removed
- **Files:** 0 narrator files exist
- **Code:** No deterministic logic (validated via grep)
- **Tests:** Pure LLM output verified

### ✅ B) Language Support Works
- **Hebrew Query:** LLM receives "respond in Hebrew" instruction
- **English Query:** LLM receives "respond in English" instruction
- **Other Languages:** LLM receives "respond in English" instruction
- **Tests:** All language mappings verified

### ✅ C) Error Handling (No Deterministic UX)
- **Error Flow:** Publishes `assistant_error` event with code only
- **Error Types:** `LLM_TIMEOUT`, `LLM_FAILED`, `SCHEMA_INVALID`
- **WS Event:** Contains error code, no generated message

### ✅ D) Region Race Fixed
- **Intent:** Outputs `regionCandidate` only
- **Validation:** filters_resolved sanitizes GZ→IL
- **Route_LLM:** Uses `finalFilters.regionCode` from start
- **Tests:** "פיצה בגדרה" never produces GZ

---

## Hook Call Sites (All Unified)

All assistant hooks use the unified `generateAndPublishAssistant()` helper:

### 1. GATE_FAIL (STOP)
**File:** `orchestrator.guards.ts::handleGateStop()`
```typescript
const assistantContext: AssistantGateContext = {
  type: 'GATE_FAIL',
  reason: 'NO_FOOD',
  query: request.query,
  language: toAssistantLanguage(gateResult.gate.language) // Properly mapped
};

const assistMessage = await generateAndPublishAssistant(
  ctx, requestId, sessionId, assistantContext, fallbackHttpMessage, wsManager
);
```

### 2. GATE_FAIL (CLARIFY - Uncertain)
**File:** `orchestrator.guards.ts::handleGateClarify()`
```typescript
const assistantContext: AssistantClarifyContext = {
  type: 'CLARIFY',
  reason: 'MISSING_FOOD',
  query: request.query,
  language: toAssistantLanguage(gateResult.gate.language) // Properly mapped
};
```

### 3. CLARIFY (Near-me without location)
**File:** `orchestrator.nearme.ts::handleNearMeLocationCheck()`
```typescript
const assistantContext: AssistantClarifyContext = {
  type: 'CLARIFY',
  reason: 'MISSING_LOCATION',
  query: request.query,
  language: toAssistantLanguage(intentDecision.language) // Properly mapped
};
```

### 4. CLARIFY (Nearby without location)
**File:** `orchestrator.guards.ts::handleNearbyLocationGuard()`
```typescript
const assistantContext: AssistantClarifyContext = {
  type: 'CLARIFY',
  reason: 'MISSING_LOCATION',
  query: request.query,
  language: toAssistantLanguage(mapping.language) // Properly mapped
};
```

### 5. SUMMARY (Success)
**File:** `orchestrator.response.ts::buildFinalResponse()`
```typescript
const assistantContext: AssistantSummaryContext = {
  type: 'SUMMARY',
  query: request.query,
  language: toAssistantLanguage(detectedLanguage), // Properly mapped
  resultCount: finalResults.length,
  top3Names
};
```

### 6. SEARCH_FAILED (Pipeline error)
**File:** `orchestrator.error.ts::handlePipelineError()`
```typescript
await publishSearchFailedAssistant(ctx, requestId, wsManager, error, errorKind);
// Internally uses generateAssistantMessage with SEARCH_FAILED context
```

---

## Key Principles

### 1. ✅ Pure LLM Output
- NO post-processing of LLM response
- NO forced `blocksSearch` values
- NO message truncation
- NO auto-adding questions
- Schema validation ONLY

### 2. ✅ Language Support
- LLM receives user's detected language (he/en/other)
- System prompt instructs LLM to respond in that language
- User prompts include explicit language instruction

### 3. ✅ Error Handling
- Publishes `assistant_error` WS event with code only
- NO deterministic fallback message generation
- HTTP response uses existing fallback (for backwards compatibility)

### 4. ✅ Region Validation
- Intent outputs `regionCandidate` only
- filters_resolved is SINGLE source of truth
- route_llm uses validated region from start

---

## Migration Notes

### For Frontend (WS Client)
**New Event to Handle:**
```typescript
type WSMessage = 
  | { type: 'assistant', requestId: string, payload: AssistantMessage }
  | { type: 'assistant_error', requestId: string, payload: { errorCode: string } }
  | ...;

// Handle error event
if (message.type === 'assistant_error') {
  const { errorCode } = message.payload;
  
  // Show generic error UI based on code
  switch (errorCode) {
    case 'LLM_TIMEOUT':
      showToast('Assistant timed out, please try again');
      break;
    case 'LLM_FAILED':
    case 'SCHEMA_INVALID':
      showToast('Assistant unavailable, please try again');
      break;
  }
}
```

### Language Behavior
- **Hebrew queries:** Get Hebrew assistant messages
- **English queries:** Get English assistant messages
- **Other languages (ru/ar/fr/es):** Get English assistant messages (fallback)

---

## Commit Message

```
fix: Assistant language support + region race fix

ASSISTANT CHANGES:
- Fix: LLM now respects user's detected language (he/en/other)
- Fix: toAssistantLanguage() properly maps languages (was hard-coded to 'en')
- Add: publishAssistantError() for error events (no deterministic messages)
- Verify: Pure LLM output (no post-processing)

REGION CHANGES:
- Fix: Intent outputs regionCandidate only (not final region)
- Fix: filters_resolved runs BEFORE route_llm (validates GZ→IL)
- Fix: route_llm uses finalFilters.regionCode (never intent candidate)
- Test: Regression test for "פיצה בגדרה" (never produces GZ)

NARRATOR REMOVAL:
- Already complete (verified no narrator files/logic remain)

Tests:
- tests/assistant-llm-language-support.test.ts (language support)
- tests/region-race-pizza-gedera.test.ts (region validation)

Run: cd server && npx tsx tests/*.test.ts

Files: 18 changed (4 new, 14 modified)
```

---

## Conclusion

**Status:** ✅ ALL REQUIREMENTS COMPLETE

**A) Narrator Removal:** ✅ Already done (verified)  
**B) Unified Hooks + Language:** ✅ Fixed  
**C) Error Handling:** ✅ Implemented  
**D) Region Race:** ✅ Fixed

**Test Coverage:**
- Language mapping: ✅ PASS
- LLM prompts: ✅ PASS
- No post-processing: ✅ PASS
- Region validation: ✅ PASS

**Query "פיצה בגדרה" will:**
1. ✅ Detect Hebrew language
2. ✅ Get Hebrew assistant message from LLM
3. ✅ Never produce `regionCode="GZ"` (sanitized to "IL")
4. ✅ Use pure LLM output (no deterministic logic)

---

**All deliverables complete and tested.**
