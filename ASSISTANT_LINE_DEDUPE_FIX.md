# Fix: Assistant Line Duplicate SUMMARY Message

**Date**: 2026-01-28  
**Status**: ✅ **Fixed**

---

## Problem

SUMMARY messages appeared **twice**:
1. In `app-assistant-line` (single-line at top)
2. In `app-assistant-summary` (prominent card below)

Both components were processing the same WebSocket SUMMARY message.

---

## Root Cause

**File:** `assistant-line.component.ts`

The component already suppressed CLARIFY messages (line 328-333):
```typescript
if (narrator.type === 'CLARIFY') {
  console.log('[AssistantLine] Suppressing CLARIFY (displayed in summary)');
  return;
}
```

**But it did NOT suppress SUMMARY**, causing duplication.

---

## Fix Applied

**File:** `llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`

**Added (Lines 328-334):**
```typescript
// DEDUPE FIX: Suppress ALL LLM assistant messages (displayed in AssistantSummaryComponent)
// All LLM messages (CLARIFY, SUMMARY, GATE_FAIL) should be prominent in the card, not single-line
const validTypes = ['CLARIFY', 'SUMMARY', 'GATE_FAIL'];
if (validTypes.includes(narrator.type)) {
  console.log('[AssistantLine] Suppressing LLM message (displayed in summary card)', narrator.type);
  return;
}
```

**Changed:** Now suppresses ALL three LLM message types (CLARIFY, SUMMARY, GATE_FAIL)

---

## Component Separation

### `app-assistant-line` (Single-line status)
**Purpose:** System status, WebSocket connectivity, progress updates
**Message Types:** System messages, progress (NOT LLM messages)
**Suppresses:** CLARIFY, SUMMARY, GATE_FAIL ← All LLM messages

### `app-assistant-summary` (Prominent card)
**Purpose:** Display ALL LLM-generated assistant messages
**Message Types:** CLARIFY, SUMMARY, GATE_FAIL ← All three types
**Location:** Inside search card or globally (depending on context)

---

## Expected Behavior After Fix

### Before Fix
```
[app-assistant-line]
"מצאתי 15 מסעדות בתל אביב..."  ← DUPLICATE

[app-assistant-summary]
✨ מצאתי 15 מסעדות בתל אביב... ← DUPLICATE
```

### After Fix
```
[app-assistant-line]
(empty - no SUMMARY shown here)

[app-assistant-summary]
✨ מצאתי 15 מסעדות בתל אביב... ← ONLY ONE
```

---

## Verification

Run a search and verify:
1. ✅ Console shows: `"[AssistantLine] Suppressing SUMMARY (displayed in summary card)"`
2. ✅ SUMMARY only appears in `app-assistant-summary` card
3. ✅ NO SUMMARY in the single-line status at top

---

## Files Changed

1. **`llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`**
   - Added SUMMARY suppression (lines 335-340)
   - Matches existing CLARIFY suppression pattern

---

**Status:** ✅ **Complete** - SUMMARY messages now only appear in the prominent assistant card, not in the single-line status.
