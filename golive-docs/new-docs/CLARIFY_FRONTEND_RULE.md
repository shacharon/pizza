# CLARIFY Frontend Handling Rule

**Goal**: Render exactly ONE user-visible message for DONE_CLARIFY  
**Constraint**: No backend changes (both WS messages will arrive)

---

## Decision Table

| WebSocket Event | Channel | Authoritative? | Handler | UI Component | Purpose |
|----------------|---------|----------------|---------|--------------|---------|
| `{ type: 'assistant', payload: { type: 'CLARIFY', blocksSearch: true } }` | assistant | ✅ **YES** | `SearchFacade.onAssistantMessage` | `AssistantSummaryComponent` | **Display message + manage state** |
| `{ type: 'clarify', message: '...' }` | search | ❌ NO | None (ignored) | None | Status notification (redundant) |

---

## Rule Definition

### Authoritative Channel: **Assistant**

**Rationale:**
- Contains full semantic payload: `type`, `message`, `question`, `blocksSearch`
- Describes assistant intent (CLARIFY, GATE_FAIL, SUMMARY)
- Already handled by SearchFacade with state management

**Data flow:**
```
assistant channel → SearchFacade.onAssistantMessage → assistantHandler.setMessage()
                                                     → facade.assistantNarration()
                                                     → AssistantSummaryComponent
```

---

### UI-Visible Payload: **AssistantSummaryComponent ONLY**

**Component:** `app-assistant-summary`  
**Location:** Block below search card  
**Data source:** `facade.assistantNarration()` (via SearchFacade → AssistantHandler)  
**Display:** Prominent block with status indicator  
**Visibility:** Controlled by `showAssistant()` computed signal

**Rationale:**
- Better for longer messages (CLARIFY needs explanation)
- Has status indicators (pending, streaming, completed)
- More visually prominent (requires user attention)
- Already integrated with SearchFacade state

---

### State-Only Payload: **AssistantLineComponent** (suppressed)

**Component:** `app-assistant-line`  
**Location:** Single line at top of search card  
**Current behavior:** Displays same message (DUPLICATION)  

**New behavior for CLARIFY:**
- ✅ Receive assistant message (no change)
- ✅ Process `blocksSearch` state (no change)
- ❌ **SUPPRESS UI display** when `narrator.type === 'CLARIFY'`
- ✅ Continue showing for other types (SUMMARY, GATE_FAIL)

**Rationale:**
- AssistantLineComponent is for brief progress updates
- CLARIFY blocks search and needs full attention
- AssistantSummaryComponent is better suited for blocking state

---

## Implementation Rules

### Rule 1: Single Source of Truth
```typescript
// SearchFacade remains authoritative for CLARIFY state
onAssistantMessage: (msg) => {
  if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
    // State management
    this.searchStore.setLoading(false);
    this.clarificationBlocking.set(true);
    this.apiHandler.cancelPolling();
    
    // UI message (SINGLE source)
    this.assistantHandler.setMessage(assistMessage);
    this.assistantHandler.setStatus('completed');
  }
}
```

### Rule 2: Suppress Duplicate Display
```typescript
// AssistantLineComponent: SUPPRESS CLARIFY from UI
private handleNarratorMessage(msg: any): void {
  const narrator = msg.payload;
  
  // ⚠️ NEW: Skip UI display for CLARIFY (state handled by SearchFacade)
  if (narrator.type === 'CLARIFY') {
    return; // Do not add to queue, do not display
  }
  
  // Continue for SUMMARY, GATE_FAIL, etc.
  this.messageQueue.push({ ... });
  this.processQueue();
}
```

### Rule 3: Ignore Search Channel 'clarify'
```typescript
// search-ws.facade.ts: No handler needed (already ignored)
switch (event.type) {
  case 'progress': // handled
  case 'ready':    // handled
  case 'error':    // handled
  // 'clarify' → falls through (no action) ✅
}
```

---

## Component Responsibility Matrix

| Component | Receives WS? | Processes State? | Displays UI? | For CLARIFY |
|-----------|-------------|------------------|--------------|-------------|
| **SearchFacade** | ✅ Yes (via wsHandler) | ✅ Yes (blocksSearch, loading) | ❌ No (delegates) | **Authoritative state** |
| **AssistantSummaryComponent** | ❌ No (reads from facade) | ❌ No (display only) | ✅ Yes | **DISPLAY MESSAGE** |
| **AssistantLineComponent** | ✅ Yes (direct subscription) | ❌ No (no state changes) | ❌ **SUPPRESS** | Suppressed for CLARIFY |
| **AssistantPanelComponent** | ✅ Yes (direct subscription) | ❌ No | ❌ No (not mounted) | N/A (not in UI) |

---

## Message Type Handling

| Message Type | Display Location | Rationale |
|-------------|------------------|-----------|
| **CLARIFY** | `AssistantSummaryComponent` only | Blocks search, needs full attention, longer text |
| **GATE_FAIL** | Both `AssistantLineComponent` + `AssistantSummaryComponent` | Brief + persistent notice |
| **SUMMARY** | `AssistantLineComponent` only | Brief contextual note, non-blocking |

---

## Verification Test Cases

### Test 1: CLARIFY renders once
```
Given: User searches "אני מחפש משהו טעים"
When: Backend sends DONE_CLARIFY with assistant message
Then: 
  - AssistantSummaryComponent displays message ✅
  - AssistantLineComponent does NOT display message ✅
  - User sees exactly ONE message ✅
```

### Test 2: SUMMARY still works
```
Given: User searches "pizza near me"
When: Backend sends DONE_SUCCESS with SUMMARY assistant message
Then:
  - AssistantLineComponent displays brief note ✅
  - AssistantSummaryComponent may also display (depends on showAssistant logic) ✅
```

### Test 3: State management unchanged
```
Given: CLARIFY message received
When: User types new query
Then:
  - clarificationBlocking cleared ✅
  - New requestId generated ✅
  - Fresh search starts ✅
```

---

## Code Changes Required

### File 1: `assistant-line.component.ts`
**Change:** Add type filter in `handleNarratorMessage()`

```typescript
// Line 286-289: Add early return for CLARIFY
private handleNarratorMessage(msg: any): void {
  const narrator = msg.payload;
  
  // NEW: Suppress CLARIFY from single-line display
  if (narrator.type === 'CLARIFY') {
    console.log('[AssistantLine] Suppressing CLARIFY (displayed in summary)');
    return;
  }
  
  // Existing logic for SUMMARY, GATE_FAIL...
}
```

**Lines affected:** ~5 lines added  
**Impact:** Prevents duplicate display in single-line component

---

### File 2: No other changes needed
- ✅ SearchFacade already handles state correctly
- ✅ AssistantSummaryComponent already displays via facade
- ✅ Search channel 'clarify' already ignored (no handler)

---

## Summary

| Aspect | Decision |
|--------|----------|
| **Authoritative channel** | Assistant channel (full payload) |
| **UI-visible component** | AssistantSummaryComponent (prominent block) |
| **State-only component** | SearchFacade (blocksSearch, loading, polling) |
| **Suppressed component** | AssistantLineComponent (for CLARIFY only) |
| **Ignored event** | Search channel 'clarify' (redundant) |
| **Code changes** | 1 file, ~5 lines (suppress in AssistantLineComponent) |

**Result:** Exactly ONE user-visible message for CLARIFY ✅
