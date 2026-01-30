# DIETARY_HINT Assistant Type Implementation

**Date**: 2026-01-28  
**Type**: New Assistant Message Type - Dietary Preference Soft Hints  
**Scope**: Backend + Frontend - Language-aware, non-blocking assistant notifications

---

## Problem Statement

The previous gluten-free notification system:
- Used old `assistant_suggestion` format on `search` channel
- Would be filtered by the new strict validation system
- Needed to be converted to a proper LLM assistant message type

---

## Solution: New DIETARY_HINT Type

### Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Language-aware** | ✅ Message matches `uiLanguage` (he/en) |
| **Max 1 sentence** | ✅ Single sentence with uncertainty disclaimer |
| **Soft tone** | ✅ "Found possible..." / "מצאתי רמזים..." |
| **Uncertainty disclaimer** | ✅ "please confirm with restaurant" |
| **Does NOT block search** | ✅ `blocksSearch: false` |
| **Inside assistant container** | ✅ Valid LLM type, renders contextually |
| **Only when results exist** | ✅ `resultsCount > 0` trigger |

---

## Backend Implementation

### 1. Message Generation

**File:** `server/src/services/search/route2/orchestrator.response.ts`

**Trigger Conditions:**
```typescript
if (isGlutenFree === true && resultsCount > 0)
```

**Language-aware Messages:**

| Language | Message | Tone |
|----------|---------|------|
| **Hebrew** | `מצאתי רמזים לאפשרויות ללא גלוטן - מומלץ לוודא עם המסעדה.` | Soft, uncertain |
| **English** | `Found possible gluten-free options - please confirm with the restaurant.` | Soft, uncertain |

**Key Improvements:**
- "Found possible" (not "marked") - softer, less authoritative
- "מומלץ לוודא" (recommended to verify) - polite suggestion
- Uncertainty is front and center
- Single sentence, concise

---

**Protocol:**
```typescript
wsManager.publishToChannel('assistant', requestId, sessionId, {
  type: 'assistant',
  requestId,
  payload: {
    type: 'DIETARY_HINT',         // New type
    message: dietaryHintMessage,  // Language-aware
    question: null,
    blocksSearch: false           // MUST NOT block
  }
});
```

**Before (Old Format - Would Be Filtered):**
```typescript
// OLD: Published to 'search' channel with type 'assistant_suggestion'
wsManager.publishToChannel('search', requestId, sessionId, {
  type: 'assistant_suggestion',  // Legacy format
  requestId,
  seq: 1,
  message: glutenFreeMessage
});
```

**After (Modern Format - Valid LLM Type):**
```typescript
// NEW: Published to 'assistant' channel with payload.type
wsManager.publishToChannel('assistant', requestId, sessionId, {
  type: 'assistant',
  requestId,
  payload: {
    type: 'DIETARY_HINT',        // Valid LLM type
    message: dietaryHintMessage,
    question: null,
    blocksSearch: false
  }
});
```

---

### 2. Logging

**Event:** `dietary_hint_sent` (consistent naming)

```typescript
logger.info({
  requestId,
  sessionId,
  language: uiLanguage,
  resultsCount,
  event: 'dietary_hint_sent'
}, '[Route2] Dietary hint sent (DIETARY_HINT)');
```

---

## Frontend Implementation

### 1. Type Definition

**File:** `llm-angular/src/app/core/models/ws-protocol.types.ts`

**Before:**
```typescript
payload: {
  type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY';
  // ...
}
```

**After:**
```typescript
payload: {
  type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY' | 'DIETARY_HINT';
  // ...
}
```

---

### 2. Validation Whitelist Updates (5 files)

**All validation layers updated to include `DIETARY_HINT`:**

```typescript
const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL', 'DIETARY_HINT'];
```

| File | Location | Validation |
|------|----------|------------|
| `search-ws.facade.ts` | Modern format handler | ✅ Added |
| `search-ws.facade.ts` | Legacy channel handler | ✅ Added |
| `search.facade.ts` | Facade handler | ✅ Added |
| `assistant-line.component.ts` | Direct WS subscriber | ✅ Added |
| `assistant-panel.component.ts` | Direct WS subscriber | ✅ Added |

**Result:** DIETARY_HINT now passes validation at all entry points ✅

---

### 3. Behavior Handling

**File:** `search.facade.ts`

**DIETARY_HINT Behavior:**
- ✅ Does NOT change card state (remains RUNNING)
- ✅ Does NOT stop loading
- ✅ Does NOT cancel polling
- ✅ Does NOT block search
- ✅ Sets assistant status to 'completed' (message visible)

**Code:**
```typescript
// CARD STATE: SUMMARY, DIETARY_HINT, or other non-blocking types
// Do NOT change card state - search continues normally
this.assistantHandler.setStatus('completed');
```

**Contrast with CLARIFY:**
```typescript
if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
  this.searchStore.setLoading(false);
  this._cardState.set('CLARIFY');  // Blocks search
  this.apiHandler.cancelPolling();
  // ...
}
```

---

## Message Type Behavior Matrix

| Type | blocksSearch | Card State Change | Loading Stopped | Use Case |
|------|--------------|-------------------|-----------------|----------|
| **CLARIFY** | ✅ true | CLARIFY | ✅ YES | User input needed |
| **GATE_FAIL** | false | STOP | ✅ YES | Search failed |
| **SUMMARY** | false | STOP (after results) | ❌ NO | Search completed |
| **DIETARY_HINT** | ✅ false | ❌ NO CHANGE | ❌ NO | Soft notification |

**Key Insight:** DIETARY_HINT is the ONLY type that:
- ✅ Does NOT block search
- ✅ Does NOT change card state
- ✅ Does NOT stop loading
- ✅ Appears as a passive notification while search continues

---

## Rendering Behavior

### Where DIETARY_HINT Renders

**DIETARY_HINT messages render in:**
1. ✅ **AssistantSummaryComponent** (inside SearchCard) - Primary display
2. ✅ **AssistantLineComponent** (single-line status) - If not CLARIFY
3. ❌ **NOT in global/system area** (has `requestId`, always contextual)

**Placement Logic:**
```typescript
// search-page.component.ts computed signals
readonly showContextualAssistant = computed(() => {
  const assistRequestId = this.facade.assistantMessageRequestId();
  const activeRequestId = this.facade.requestId();
  
  // DIETARY_HINT has requestId → renders contextually
  return !!assistRequestId || !!activeRequestId;
});
```

**Result:** DIETARY_HINT always renders inside the SearchCard ✅

---

### AssistantLineComponent Handling

**Special Rule:** CLARIFY is suppressed in AssistantLine (needs prominent display)

```typescript
// CLARIFY FIX: Suppress CLARIFY messages (displayed in AssistantSummaryComponent)
if (narrator.type === 'CLARIFY') {
  console.log('[AssistantLine] Suppressing CLARIFY (displayed in summary)');
  return;
}
```

**DIETARY_HINT Behavior:**
- ✅ NOT suppressed in AssistantLine
- ✅ Can appear as single-line status
- ✅ Soft, non-intrusive notification

---

## Language Support

### Message Comparison

#### Hebrew (he)

**Before:**
```
סימנתי רמזים ל'ללא גלוטן' בתוצאות. כדאי לוודא מול המסעדה.
(I marked gluten-free signals... should verify...)
```

**After:**
```
מצאתי רמזים לאפשרויות ללא גלוטן - מומלץ לוודא עם המסעדה.
(Found hints for gluten-free options - recommended to verify...)
```

**Improvements:**
- "מצאתי" (found) vs "סימנתי" (marked) - less assertive
- "אפשרויות" (options) - softer, possibilities
- "מומלץ" (recommended) - polite suggestion
- Shorter, clearer structure

---

#### English (en)

**Before:**
```
I marked gluten-free signals in the results. Please verify with the restaurant.
```

**After:**
```
Found possible gluten-free options - please confirm with the restaurant.
```

**Improvements:**
- "Found possible" vs "I marked" - less personal, more uncertain
- "options" vs "signals" - clearer, user-friendly
- "confirm" vs "verify" - softer tone
- Single sentence with dash separator

---

## Trigger Logic

### Conditions

```typescript
const isGlutenFree = (filtersForPostFilter as any).isGlutenFree;
const resultsCount = response.results?.length || 0;

if (isGlutenFree === true && resultsCount > 0) {
  // Send DIETARY_HINT
}
```

**Must Both Be True:**
1. ✅ `isGlutenFree === true` (user requested gluten-free)
2. ✅ `resultsCount > 0` (at least one result found)

**Edge Cases:**
- `isGlutenFree === null` → No hint (user didn't request)
- `isGlutenFree === false` → No hint (never set to false per schema)
- `resultsCount === 0` → No hint (no results to hint about)

---

## Migration from Old System

### What Was Removed

**Old Code:**
```typescript
wsManager.publishToChannel('search', requestId, sessionId, {
  type: 'assistant_suggestion',  // Would be filtered by new validation
  requestId,
  seq: 1,
  message: glutenFreeMessage
});
```

**Why It Would Fail:**
- Published to `search` channel (not `assistant`)
- Type `assistant_suggestion` is NOT in validation whitelist
- Would be silently ignored by strict validation layers

---

### New System

**Modern Protocol:**
```typescript
wsManager.publishToChannel('assistant', requestId, sessionId, {
  type: 'assistant',             // Modern format
  requestId,
  payload: {
    type: 'DIETARY_HINT',        // Valid LLM type
    message: dietaryHintMessage,
    question: null,
    blocksSearch: false
  }
});
```

**Why It Works:**
- ✅ Published to `assistant` channel
- ✅ `payload.type = 'DIETARY_HINT'` in whitelist
- ✅ Passes all 3 validation layers
- ✅ Renders as proper LLM assistant message

---

## Testing Checklist

### Backend Tests

- [ ] **Trigger Conditions:**
  - [ ] isGlutenFree=true + resultsCount>0 → Hint sent ✅
  - [ ] isGlutenFree=null + resultsCount>0 → No hint ✅
  - [ ] isGlutenFree=true + resultsCount=0 → No hint ✅

- [ ] **Language Support:**
  - [ ] uiLanguage='he' → Hebrew message ✅
  - [ ] uiLanguage='en' → English message ✅

- [ ] **Protocol:**
  - [ ] Published to 'assistant' channel ✅
  - [ ] payload.type = 'DIETARY_HINT' ✅
  - [ ] payload.blocksSearch = false ✅

---

### Frontend Tests

- [ ] **Validation:**
  - [ ] DIETARY_HINT passes Layer 1 (search-ws.facade.ts) ✅
  - [ ] DIETARY_HINT passes Layer 2 (search.facade.ts) ✅
  - [ ] DIETARY_HINT passes Layer 3 (assistant-line.component.ts) ✅

- [ ] **Rendering:**
  - [ ] Message appears inside SearchCard ✅
  - [ ] Message does NOT appear in global area ✅
  - [ ] Card state remains RUNNING (no change) ✅

- [ ] **Behavior:**
  - [ ] Search does NOT stop ✅
  - [ ] Loading spinner continues (if search ongoing) ✅
  - [ ] User can still interact with card ✅
  - [ ] blocksSearch=false is respected ✅

---

## Files Modified

### Backend (2 files)

1. **`server/src/services/search/route2/orchestrator.response.ts`**
   - Replaced old `assistant_suggestion` with modern `DIETARY_HINT` protocol
   - Added `resultsCount > 0` trigger condition
   - Improved message tone (softer, uncertainty-focused)
   - Language-aware message generation

---

### Frontend (6 files)

1. **`llm-angular/src/app/core/models/ws-protocol.types.ts`**
   - Added `'DIETARY_HINT'` to `WSServerAssistant.payload.type` union

2. **`llm-angular/src/app/facades/search-ws.facade.ts`** (2 locations)
   - Added `'DIETARY_HINT'` to modern format validation whitelist
   - Added `'DIETARY_HINT'` to legacy channel validation whitelist

3. **`llm-angular/src/app/facades/search.facade.ts`**
   - Added `'DIETARY_HINT'` to validation whitelist
   - Updated comment: "SUMMARY, DIETARY_HINT, or other non-blocking types"

4. **`llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`**
   - Added `'DIETARY_HINT'` to validation whitelist

5. **`llm-angular/src/app/features/unified-search/components/assistant-panel/assistant-panel.component.ts`**
   - Added `'DIETARY_HINT'` to validation whitelist

---

## Summary

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| **Language matches uiLanguage** | ✅ YES | Hebrew/English messages based on `uiLanguage` |
| **1 sentence max** | ✅ YES | Single sentence with dash separator |
| **Soft, non-authoritative tone** | ✅ YES | "Found possible..." / "מצאתי רמזים..." |
| **Uncertainty disclaimer** | ✅ YES | "please confirm" / "מומלץ לוודא" |
| **Does NOT block search** | ✅ YES | `blocksSearch: false` |
| **Inside assistant container** | ✅ YES | Valid LLM type, renders contextually |
| **Trigger: isGlutenFree=true** | ✅ YES | Condition checked |
| **Trigger: resultsCount>0** | ✅ YES | Condition checked |
| **Remove old notifications** | ✅ YES | Old `assistant_suggestion` replaced |

---

**Status:** ✅ **Complete** - DIETARY_HINT is now a valid LLM assistant message type with proper language support, soft tone, uncertainty disclaimer, and non-blocking behavior. Old gluten-free notification system has been fully replaced.

**Key Achievement:** Seamless integration into the existing assistant message architecture while maintaining strict validation and contextual rendering guarantees.
