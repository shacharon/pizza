# Dietary Note Merged Into SUMMARY

**Date**: 2026-01-28  
**Type**: Simplification - Merge DIETARY_HINT into SUMMARY message  
**Scope**: Backend + Frontend - Remove separate dietary messages, include as optional note in SUMMARY

---

## Problem Statement

**Before:**
- Separate `DIETARY_HINT` messages sent after `SUMMARY`
- Two separate assistant messages for single search
- Cluttered UX with multiple message bubbles
- Extra validation/type handling complexity

---

## Solution: Merge Into SUMMARY

### Requirements

| Requirement | Implementation |
|-------------|----------------|
| **SUMMARY may include dietary note** | ✅ Optional `dietaryNote` in context |
| **Language matches uiLanguage** | ✅ LLM generates in correct language |
| **Max 2 sentences total** | ✅ Enforced in prompt |
| **Soft, uncertain tone** | ✅ Prompt specifies tone |
| **No medical claims** | ✅ Explicitly forbidden in prompt |
| **blocksSearch = false** | ✅ SUMMARY invariant enforced |
| **No separate DIETARY_HINT** | ✅ Type removed from all layers |
| **Assistant is only source** | ✅ No parallel/system hints |
| **Trigger: isGlutenFree + results>0** | ✅ Conditional context flag |

---

## Implementation

### Backend: AssistantSummaryContext

**File:** `assistant-llm.service.ts`

**Added Optional Field:**
```typescript
export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  top3Names: string[];
  // DIETARY NOTE: Optional soft dietary hint (merged into summary)
  dietaryNote?: {
    type: 'gluten-free';
    shouldInclude: boolean;
  };
}
```

---

### Backend: LLM Prompt Enhancement

**File:** `assistant-llm.service.ts` - `buildUserPrompt()`

**Added Conditional Dietary Note Instructions:**
```typescript
const dietaryNote = context.dietaryNote?.shouldInclude
  ? `\nDietary Note: Add SOFT gluten-free hint at end (1 sentence max).
  - Tone: uncertain, non-authoritative, helpful
  - Example (he): "ייתכן שיש אפשרויות ללא גלוטן - כדאי לוודא עם המסעדה."
  - Example (en): "Some places may offer gluten-free options - please confirm with restaurant."
  - NO medical claims, NO guarantees
  - Combine naturally with summary (max 2 sentences total)`
  : '';
```

**Key Guidelines:**
- **Tone:** "uncertain, non-authoritative, helpful"
- **Examples provided** in both languages for consistency
- **Explicitly forbids** medical claims and guarantees
- **Max length:** 1 sentence for dietary note, 2 total including summary

---

### Backend: Context Building

**File:** `orchestrator.response.ts`

**Before (Separate DIETARY_HINT):**
```typescript
// After SUMMARY, send separate DIETARY_HINT message
if (isGlutenFree === true && resultsCount > 0) {
  wsManager.publishToChannel('assistant', requestId, sessionId, {
    type: 'assistant',
    payload: {
      type: 'DIETARY_HINT',  // Separate message
      message: dietaryHintMessage,
      ...
    }
  });
}
```

**After (Merged):**
```typescript
// DIETARY NOTE: Check if should be included
const isGlutenFree = (filtersForPostFilter as any).isGlutenFree;
const resultsCount = finalResults.length;
const shouldIncludeDietaryNote = isGlutenFree === true && resultsCount > 0;

const assistantContext: AssistantSummaryContext = {
  type: 'SUMMARY',
  query: request.query,
  language: resolveAssistantLanguage(ctx, request, detectedLanguage),
  resultCount: finalResults.length,
  top3Names,
  // MERGED: Include dietary note flag in context
  dietaryNote: shouldIncludeDietaryNote ? {
    type: 'gluten-free',
    shouldInclude: true
  } : undefined
};

// No separate DIETARY_HINT publishing - merged into SUMMARY generation
```

**Result:** LLM generates single SUMMARY message that includes dietary note when appropriate.

---

### Frontend: Type Cleanup

**Removed `DIETARY_HINT` from:**

1. **`ws-protocol.types.ts`** - WSServerAssistant payload type
2. **`search-assistant.facade.ts`** - AssistantMessage interface & addMessage()
3. **`search.facade.ts`** - Type cast in onAssistantMessage
4. **`search-ws.facade.ts`** - Validation whitelists (2 locations)
5. **`assistant-line.component.ts`** - Validation whitelist
6. **`assistant-panel.component.ts`** - Validation whitelist
7. **`assistant-summary.component.ts`** - Icon mapping, removed 🍽️
8. **`assistant-summary.component.scss`** - Removed `.message-type-dietary_hint` styling

**Before:**
```typescript
const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL', 'DIETARY_HINT'];
```

**After:**
```typescript
const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
```

---

## Message Flow

### Old Flow (2 Messages)

```
Backend:
  1. Generate SUMMARY
     → "Found 8 pizza places near you."
  2. Check isGlutenFree
  3. Generate DIETARY_HINT
     → "Found possible gluten-free options - please confirm."

Frontend:
  → Renders 2 separate message bubbles
  → SUMMARY with ✨ icon
  → DIETARY_HINT with 🍽️ icon
```

---

### New Flow (1 Message)

```
Backend:
  1. Check isGlutenFree + resultsCount > 0
  2. Add dietaryNote flag to context
  3. Generate SUMMARY (LLM includes dietary note if flag set)
     → "Found 8 pizza places near you. Some places may offer gluten-free options - please confirm with restaurant."

Frontend:
  → Renders 1 message bubble
  → SUMMARY with ✨ icon
  → Dietary note naturally integrated in text
```

---

## Example Messages

### Hebrew (with dietary note)

**Input Context:**
- isGlutenFree: true
- resultsCount: 8
- top3Names: ["פיצה האט", "דומינוס", "פיצה עגבניה"]

**LLM Output:**
```json
{
  "type": "SUMMARY",
  "message": "מצאתי 8 מסעדות פיצה באזורך. ייתכן שיש אפשרויות ללא גלוטן - כדאי לוודא עם המסעדה.",
  "question": null,
  "suggestedAction": "NONE",
  "blocksSearch": false
}
```

**Analysis:**
- 2 sentences ✅
- Soft tone: "ייתכן" (possibly) ✅
- Uncertainty: "כדאי לוודא" (should verify) ✅
- Language: Hebrew ✅
- No medical claims ✅

---

### English (with dietary note)

**Input Context:**
- isGlutenFree: true
- resultsCount: 5
- top3Names: ["Pizza Hut", "Domino's", "Papa John's"]

**LLM Output:**
```json
{
  "type": "SUMMARY",
  "message": "Found 5 pizza places matching your search. Some places may offer gluten-free options - please confirm with restaurant.",
  "question": null,
  "suggestedAction": "NONE",
  "blocksSearch": false
}
```

**Analysis:**
- 2 sentences ✅
- Soft tone: "may offer" ✅
- Uncertainty: "please confirm" ✅
- Language: English ✅
- No medical claims ✅

---

### Without Dietary Note

**Input Context:**
- isGlutenFree: false (or null)
- resultsCount: 12

**LLM Output:**
```json
{
  "type": "SUMMARY",
  "message": "Found 12 great restaurants near you!",
  "question": null,
  "suggestedAction": "NONE",
  "blocksSearch": false
}
```

**Analysis:**
- 1 sentence (dietary note not requested) ✅
- Enthusiastic tone ✅
- No dietary note ✅

---

## Tone Guidelines

### Dietary Note Tone Requirements

| Aspect | Required | Example Phrases |
|--------|----------|-----------------|
| **Uncertainty** | ✅ YES | "may offer", "possibly", "ייתכן" |
| **Non-authoritative** | ✅ YES | "please confirm", "כדאי לוודא" |
| **Helpful** | ✅ YES | "some places", "אפשרויות" (options) |
| **No guarantees** | ✅ YES | Avoid: "all have", "guaranteed" |
| **No medical claims** | ✅ YES | Avoid: "safe for", "certified" |

---

### Forbidden Phrases

❌ **Too Assertive:**
- "All restaurants have gluten-free options"
- "These are safe for celiac disease"
- "Certified gluten-free available"

✅ **Correct Tone:**
- "Some places may offer gluten-free options"
- "Please confirm with the restaurant"
- "ייתכן שיש אפשרויות ללא גלוטן"

---

## Validation

### SUMMARY Invariants (Unchanged)

**Enforced:**
1. `blocksSearch` MUST be `false`
2. `suggestedAction` MUST be `NONE`
3. `message` max 2 sentences
4. `question` must be `null`

**With dietary note:**
- Still max 2 sentences total (summary + dietary combined)
- Both dietary note and summary count toward limit

---

### LLM Enforcement

**Fallback Logic:**
If LLM generates message that violates rules:
1. Language validation (must match requested language)
2. Format validation (max sentences)
3. Invariant enforcement (blocksSearch=false)

**Fallback Message (English):**
```typescript
{
  message: `Found ${count} restaurants matching your search.`,
  question: null,
  suggestedAction: 'NONE',
  blocksSearch: false
}
```

**Note:** Fallback does NOT include dietary note (LLM-only feature).

---

## Benefits

| Benefit | Before | After |
|---------|--------|-------|
| **Messages per search** | 2 (SUMMARY + DIETARY_HINT) | 1 (SUMMARY with optional note) |
| **UX clarity** | ❌ Multiple bubbles | ✅ Single cohesive message |
| **Code complexity** | ❌ Extra type, validation | ✅ Simpler type system |
| **Maintenance** | ❌ Two message paths | ✅ One message path |
| **Language consistency** | ⚠️ Two separate generations | ✅ Single LLM call |
| **Tone control** | ⚠️ Hard to balance | ✅ LLM blends naturally |

---

## Edge Cases

### 1. No Results (Dietary Note Suppressed)

```
Input:
  - isGlutenFree: true
  - resultsCount: 0

Result:
  - dietaryNote.shouldInclude = false (condition not met)
  - SUMMARY without dietary note: "No restaurants found matching your search."
```

**Why:** No point mentioning gluten-free options when no results exist.

---

### 2. LLM Timeout (Fallback)

```
Scenario:
  - LLM timeout during SUMMARY generation
  - dietaryNote.shouldInclude = true

Fallback:
  - Deterministic English message (no dietary note)
  - "Found 8 restaurants matching your search."

Result:
  - Dietary note lost in fallback
  - Search still completes successfully
```

**Why:** Fallback messages are simple/deterministic (no dynamic dietary note).

---

### 3. Language Mismatch (Re-generate)

```
Scenario:
  - Requested: Hebrew
  - LLM returns: English (with dietary note)

Validation:
  - Language mismatch detected
  - Fallback to deterministic Hebrew message (no dietary note)

Result:
  - Message in correct language
  - Dietary note lost (acceptable tradeoff)
```

---

## Testing

### Test Case 1: SUMMARY with Dietary Note (Hebrew)

**Input:**
```typescript
{
  type: 'SUMMARY',
  query: 'פיצה ללא גלוטן',
  language: 'he',
  resultCount: 5,
  top3Names: ['פיצה האט', 'דומינוס', 'רולדין'],
  dietaryNote: { type: 'gluten-free', shouldInclude: true }
}
```

**Expected Output:**
- Single message in Hebrew ✅
- Includes result count ✅
- Includes soft dietary note ✅
- Max 2 sentences ✅
- blocksSearch = false ✅

---

### Test Case 2: SUMMARY without Dietary Note

**Input:**
```typescript
{
  type: 'SUMMARY',
  query: 'burger',
  language: 'en',
  resultCount: 12,
  top3Names: ['Five Guys', 'Shake Shack', 'McDonald\'s'],
  dietaryNote: undefined  // Not requested
}
```

**Expected Output:**
- Single message in English ✅
- Includes result count ✅
- NO dietary note ✅
- 1-2 sentences ✅
- blocksSearch = false ✅

---

### Test Case 3: Zero Results (Dietary Note Suppressed)

**Input:**
```typescript
{
  type: 'SUMMARY',
  query: 'vegan pizza',
  language: 'en',
  resultCount: 0,
  top3Names: [],
  dietaryNote: { type: 'gluten-free', shouldInclude: false }  // Suppressed
}
```

**Expected Output:**
- Message about no results ✅
- NO dietary note (resultsCount = 0) ✅
- 1 sentence ✅
- blocksSearch = false ✅

---

## Migration Path

### Removed Components

1. **DIETARY_HINT type** - No longer exists in protocol
2. **Separate hint publishing** - orchestrator.response.ts simplified
3. **Frontend DIETARY_HINT handling** - Validation whitelists updated
4. **🍽️ icon** - Removed from icon mapping
5. **`.message-type-dietary_hint`** - Removed from SCSS

---

### Backward Compatibility

**None required:** DIETARY_HINT was newly added and never deployed to production.

**Fresh deployments:** No migration needed, system works immediately.

---

## Files Modified

### Backend (2 files)

1. **`assistant-llm.service.ts`**
   - Added `dietaryNote?` to `AssistantSummaryContext`
   - Enhanced `buildUserPrompt()` with dietary note instructions
   - Examples provided for Hebrew/English

2. **`orchestrator.response.ts`**
   - Check `isGlutenFree` + `resultsCount > 0`
   - Add `dietaryNote` to context when appropriate
   - Removed separate DIETARY_HINT publishing

---

### Frontend (9 files)

1. **`ws-protocol.types.ts`** - Removed DIETARY_HINT from payload type
2. **`search-assistant.facade.ts`** - Removed from AssistantMessage interface & addMessage()
3. **`search.facade.ts`** - Removed from type cast & validation
4. **`search-ws.facade.ts`** - Removed from validation whitelists (2 locations)
5. **`assistant-line.component.ts`** - Removed from validation whitelist
6. **`assistant-panel.component.ts`** - Removed from validation whitelist
7. **`assistant-summary.component.ts`** - Removed icon mapping
8. **`assistant-summary.component.scss`** - Removed type-specific styling

---

## Summary

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Merge into SUMMARY** | ✅ YES | LLM generates single message |
| **Language-aware** | ✅ YES | Prompt enforces language match |
| **Max 2 sentences** | ✅ YES | Enforced in prompt & validation |
| **Soft, uncertain tone** | ✅ YES | Examples in prompt |
| **No medical claims** | ✅ YES | Explicitly forbidden |
| **blocksSearch = false** | ✅ YES | SUMMARY invariant |
| **No separate DIETARY_HINT** | ✅ YES | Type completely removed |
| **Assistant only source** | ✅ YES | No parallel/system hints |
| **Conditional trigger** | ✅ YES | isGlutenFree + resultsCount > 0 |

---

**Status:** ✅ **Complete** - DIETARY_HINT merged into SUMMARY. Single assistant message now includes optional dietary note with soft, uncertain tone. No medical claims, no guarantees, always language-appropriate. Max 2 sentences total.

**Key Achievement:** Simplified from 2 separate messages to 1 cohesive message, reducing UX clutter while maintaining all safety guarantees and tone requirements.
