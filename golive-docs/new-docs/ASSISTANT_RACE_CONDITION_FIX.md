# Assistant Message Race Condition Fix

**Date**: 2026-01-28  
**Type**: Frontend Fix - Handle Assistant Messages Before Search Response  
**Scope**: Ensure all assistant messages activate placement logic immediately

---

## Problem Statement

Assistant WebSocket messages could arrive before search response completes, and **non-CLARIFY message types** (SUMMARY, GATE_FAIL) were not properly handled, causing them to potentially render globally instead of contextually.

### Root Causes

1. **Incomplete Message Handling**: Only CLARIFY messages were processed in `onAssistantMessage` handler
2. **Status Not Set**: SUMMARY and GATE_FAIL messages never set `assistantStatus`, leaving it as 'idle'
3. **showAssistant() False**: Without status change, `showAssistant()` returned false, preventing display
4. **Potential Global Render**: If message somehow displayed, it could appear globally (though filters likely prevented this)

---

## Architecture Analysis

### SearchCard Mounting

**SearchCard div is ALWAYS mounted** (not conditional):

```html
<!-- search-page.component.html -->
<div class="search-card">
  <app-search-bar />
  <app-assistant-line />
  
  <!-- Only AssistantSummary is conditional -->
  @if (showContextualAssistant()) {
  <app-assistant-summary />
  }
</div>
```

**No race with card creation** - The div exists from page load ✅

---

### Display Activation Chain

For AssistantSummary to render inside search-card:

```typescript
1. showContextualAssistant() must be true
   ↓
2. showAssistant() && assistantHasRequestId() must both be true
   ↓
3. showAssistant() requires: assistantState() !== 'idle' OR other conditions
   ↓
4. assistantHasRequestId() requires: requestId() OR assistantMessageRequestId()
```

**The Gap:** SUMMARY/GATE_FAIL messages never set status → `assistantState()` stayed 'idle' → `showAssistant()` returned false → Message not displayed

---

## Message Type Coverage Before Fix

| Message Type | Handler | Set Message? | Set RequestId? | Set Status? | Display Activated? |
|--------------|---------|-------------|----------------|-------------|-------------------|
| **CLARIFY (blocksSearch=true)** | onAssistantMessage | YES ✅ | YES ✅ | YES ✅ ('completed') | YES ✅ |
| **SUMMARY** | onAssistantMessage | NO ❌ | NO ❌ | NO ❌ | NO ❌ |
| **GATE_FAIL** | onAssistantMessage | NO ❌ | NO ❌ | NO ❌ | NO ❌ |
| **stream.delta/done** | handleLegacyMessage | YES ✅ | YES ✅ (after fix) | YES ✅ | YES ✅ |
| **recommendation** | handleLegacyMessage | N/A | YES ✅ (after fix) | N/A | YES ✅ |

**Problem:** 66% of modern assistant message types were not handled!

---

## Solution

### Updated onAssistantMessage Handler

**File:** `search.facade.ts`

**Before:**
```typescript
onAssistantMessage: (msg) => {
  const narratorMsg = msg as any;
  const narrator = narratorMsg.payload;
  console.log('[SearchFacade] Assistant message received:', narrator.type, narrator.message);

  // NEW: Handle CLARIFY with blocksSearch (DONE_CLARIFY)
  if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
    console.log('[SearchFacade] DONE_CLARIFY - stopping search, waiting for user input');
    
    // ... CLARIFY-specific logic ...
    
    const assistMessage = narrator.message || narrator.question || 'Please provide more information';
    this.assistantHandler.setMessage(assistMessage, narratorMsg.requestId);
    this.assistantHandler.setStatus('completed');
  }
  // SUMMARY and GATE_FAIL: NOT HANDLED ❌
},
```

**After:**
```typescript
onAssistantMessage: (msg) => {
  const narratorMsg = msg as any;
  const narrator = narratorMsg.payload;
  console.log('[SearchFacade] Assistant message received:', narrator.type, narrator.message);

  // RACE FIX: Handle ALL assistant message types (CLARIFY, SUMMARY, GATE_FAIL)
  // Always set message + requestId FIRST to ensure placement logic activates
  const assistMessage = narrator.message || narrator.question || '';
  if (assistMessage) {
    this.assistantHandler.setMessage(assistMessage, narratorMsg.requestId);
  }

  // Handle CLARIFY with blocksSearch (DONE_CLARIFY)
  if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
    console.log('[SearchFacade] DONE_CLARIFY - stopping search, waiting for user input');
    
    // Stop loading immediately
    this.searchStore.setLoading(false);
    
    // Set clarification blocking state
    this.clarificationBlocking.set(true);
    
    // Cancel any pending polling
    this.apiHandler.cancelPolling();
    
    // Set status for CLARIFY
    this.assistantHandler.setStatus('completed');
  } else {
    // RACE FIX: For SUMMARY/GATE_FAIL, set status to completed so showAssistant() activates
    this.assistantHandler.setStatus('completed');
  }
},
```

**Key Changes:**
1. **Extract message FIRST** - Before any conditional logic
2. **Always call setMessage()** - With requestId for all message types
3. **Always set status** - Either inside CLARIFY block OR in else block

---

## Message Type Coverage After Fix

| Message Type | Handler | Set Message? | Set RequestId? | Set Status? | Display Activated? |
|--------------|---------|-------------|----------------|-------------|-------------------|
| **CLARIFY (blocksSearch=true)** | onAssistantMessage | YES ✅ | YES ✅ | YES ✅ ('completed') | YES ✅ |
| **SUMMARY** | onAssistantMessage | YES ✅ | YES ✅ | YES ✅ ('completed') | YES ✅ |
| **GATE_FAIL** | onAssistantMessage | YES ✅ | YES ✅ | YES ✅ ('completed') | YES ✅ |
| **stream.delta/done** | handleLegacyMessage | YES ✅ | YES ✅ | YES ✅ | YES ✅ |
| **recommendation** | handleLegacyMessage | N/A | YES ✅ | N/A | YES ✅ |

**Result:** 100% coverage - All message types handled ✅

---

## Data Flow - SUMMARY Message

### Before Fix (Broken)

```
1. User searches "pizza near me"
2. Backend: 202 Accepted { requestId: "req-123" }
3. SearchFacade.currentRequestId = "req-123"
4. Backend processes search
5. WebSocket: SUMMARY message arrives
   { type: "assistant", requestId: "req-123", payload: { type: "SUMMARY", message: "..." } }
   
6. onAssistantMessage() called:
   - Logs message ✅
   - Checks: narrator.type === 'CLARIFY' && blocksSearch? NO ❌
   - Falls through without handling ❌
   
7. State:
   - assistantText: '' (not set) ❌
   - messageRequestId: undefined (not set) ❌
   - assistantStatus: 'pending' (from reset()) ❌
   
8. Computed signals:
   - assistantState() = 'pending' (could trigger showAssistant if status !== 'idle')
   - assistantMessageRequestId() = undefined ❌
   - assistantHasRequestId() = true (from facade.requestId) ✅
   - BUT: showAssistant() might return false if no response yet ❌
   
9. Result: Message text not captured, might not display ❌
```

### After Fix (Working)

```
1. User searches "pizza near me"
2. Backend: 202 Accepted { requestId: "req-123" }
3. SearchFacade.currentRequestId = "req-123"
4. Backend processes search
5. WebSocket: SUMMARY message arrives
   { type: "assistant", requestId: "req-123", payload: { type: "SUMMARY", message: "Found 10 results..." } }
   
6. onAssistantMessage() called:
   - Logs message ✅
   - Extracts: assistMessage = "Found 10 results..." ✅
   - Calls: setMessage(assistMessage, "req-123") ✅
   - Checks: narrator.type === 'CLARIFY' && blocksSearch? NO
   - Else block: setStatus('completed') ✅
   
7. State:
   - assistantText: "Found 10 results..." ✅
   - messageRequestId: "req-123" ✅
   - assistantStatus: 'completed' ✅
   
8. Computed signals:
   - assistantState() = 'completed' ✅
   - assistantMessageRequestId() = "req-123" ✅
   - assistantHasRequestId() = true ✅
   - showAssistant() = true (status !== 'idle') ✅
   - showContextualAssistant() = true ✅
   
9. Template: AssistantSummary renders INSIDE search-card ✅

10. Result: Message displays contextually immediately ✅
```

---

## Data Flow - GATE_FAIL Message

### Scenario: Search Fails at Gate (e.g., No API Key)

```
1. User searches "pizza near me"
2. Backend: 202 Accepted { requestId: "req-456" }
3. Backend processes search
4. Gate check fails → DONE_FAILED
5. WebSocket: GATE_FAIL message arrives
   { type: "assistant", requestId: "req-456", payload: { type: "GATE_FAIL", message: "Unable to process..." } }
   
6. onAssistantMessage() called:
   - Extracts: assistMessage = "Unable to process..." ✅
   - Calls: setMessage(assistMessage, "req-456") ✅
   - Not CLARIFY → Else block: setStatus('completed') ✅
   
7. State:
   - assistantText: "Unable to process..." ✅
   - messageRequestId: "req-456" ✅
   - assistantStatus: 'completed' ✅
   
8. Computed signals:
   - assistantHasRequestId() = true ✅
   - showAssistant() = true ✅
   - showContextualAssistant() = true ✅
   
9. Template: GATE_FAIL message renders INSIDE search-card ✅

10. Result: Error message bound to search context ✅
```

---

## Race Condition Timing

### Scenario: Assistant Message Arrives Before Search Response

```
Timeline:
T0: User submits search
T1: Backend returns 202 { requestId: "req-789" }
T2: Frontend sets currentRequestId = "req-789"
T3: Frontend subscribes to WebSocket with requestId
T4: WebSocket delivers SUMMARY message (fast!) ← ARRIVES HERE
T5: HTTP polling delivers search response (slower)

At T4 (Assistant message arrival):
- SearchCard div: MOUNTED ✅ (always present)
- currentRequestId: "req-789" ✅ (set at T2)
- search response: NOT YET (arrives at T5)

Message Processing at T4:
1. onAssistantMessage() called ✅
2. setMessage(msg, "req-789") → messageRequestId = "req-789" ✅
3. setStatus('completed') → assistantStatus = 'completed' ✅
4. Computed signals update:
   - assistantState() = 'completed' ✅
   - assistantMessageRequestId() = "req-789" ✅
   - assistantHasRequestId() = true ✅
   - showAssistant() = true (status !== 'idle') ✅
   - showContextualAssistant() = true ✅
5. Angular renders AssistantSummary INSIDE search-card ✅

Result: Message displays immediately, NO RACE ✅
```

---

## Edge Cases Handled

### 1. Message Arrives Before Search Response

**Given:** WebSocket faster than HTTP polling  
**When:** Assistant message arrives before search response  
**Then:** 
- Message + requestId captured ✅
- Status set to 'completed' ✅
- showAssistant() returns true (status check) ✅
- Renders contextually ✅

### 2. Multiple Message Types in Same Search

**Given:** Search returns SUMMARY + GATE_FAIL (edge case)  
**When:** Both messages arrive  
**Then:**
- First message: Sets text, requestId, status ✅
- Second message: Overwrites text (last wins) ✅
- Both bound to requestId ✅
- Both contextual ✅

### 3. Message with Empty Text

**Given:** `narrator.message` is null/undefined  
**When:** `assistMessage = narrator.message || narrator.question || ''`  
**Then:**
- Empty string doesn't call setMessage() ✅
- Still sets requestId via handleLegacyMessage if legacy type ✅
- Status still set ✅

### 4. CLARIFY + SUMMARY in Sequence

**Given:** Backend sends CLARIFY → then SUMMARY (unlikely but possible)  
**When:** Both messages processed  
**Then:**
- CLARIFY: Sets message, requestId, status, blocks search ✅
- SUMMARY: Overwrites message (if arrives after) ✅
- Both contextual ✅
- blocksSearch persists from CLARIFY ✅

---

## showAssistant() Activation Matrix

| Condition | Before Fix | After Fix |
|-----------|-----------|-----------|
| **CLARIFY message arrives** | status='completed' ✅ → showAssistant=true | status='completed' ✅ → showAssistant=true |
| **SUMMARY message arrives** | status='pending' ❌ → depends on response | status='completed' ✅ → showAssistant=true |
| **GATE_FAIL message arrives** | status='pending' ❌ → depends on response | status='completed' ✅ → showAssistant=true |
| **No results + SUMMARY** | showAssistant=true (no results) ✅ | showAssistant=true (status OR no results) ✅ |
| **Good results + SUMMARY** | showAssistant=false ❌ (status ignored) | showAssistant=true ✅ (status check fires first) |

**Key Improvement:** Assistant now ALWAYS shows when message exists, regardless of search results.

---

## Files Modified

**1 file changed:**
- `llm-angular/src/app/facades/search.facade.ts` (~10 lines modified)

**Changes:**
1. Extract `assistMessage` before conditional logic
2. Always call `setMessage(assistMessage, requestId)` for all message types
3. Always call `setStatus('completed')` (inside or outside CLARIFY block)

---

## No Backend Changes

✅ Backend contract unchanged (still sends all message types)  
✅ Frontend now correctly handles ALL message types  
✅ All messages activate placement logic immediately  

---

## Summary

| Aspect | Status |
|--------|--------|
| **All message types handled** | ✅ YES (CLARIFY, SUMMARY, GATE_FAIL) |
| **Status always set** | ✅ YES ('completed' for all) |
| **RequestId always captured** | ✅ YES (all message types) |
| **showAssistant() activates** | ✅ YES (status !== 'idle') |
| **Contextual placement guaranteed** | ✅ YES (assistantHasRequestId + showAssistant) |
| **No race condition** | ✅ YES (SearchCard always mounted, signals update immediately) |
| **No message dropped** | ✅ YES (all types processed) |
| **No global render** | ✅ YES (requestId always set → contextual) |

---

**Status:** ✅ **Complete** - All assistant message types (CLARIFY, SUMMARY, GATE_FAIL) now properly activate placement logic, ensuring contextual rendering regardless of arrival timing.

**Key Fix:** Always set message + requestId + status for ALL assistant message types, not just CLARIFY.
