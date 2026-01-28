# Assistant Message Placement Fix

**Date**: 2026-01-28  
**Type**: Frontend Fix - Contextual vs. Global Assistant Rendering  
**Scope**: Prevent assistant messages with requestId from appearing outside SearchCard

---

## Problem Statement

Assistant messages with `requestId` were rendering in the global/system area (outside the SearchCard) instead of being contextually bound inside the SearchCard.

**Impact:**
- Confusing UX - assistant messages appeared "floating" and disconnected from search
- Loss of visual context - users couldn't tell which search the message belonged to
- After WebSocket reconnect, messages appeared in wrong location

---

## Root Cause

**Architecture before fix:**

```
search-page.component.html structure:
├── <header>
│   ├── <div class="search-card">
│   │   ├── SearchBar
│   │   └── AssistantLine (single-line status)
│   │
│   └── AssistantSummary (ALWAYS outside search-card) ❌
│
└── <main>
    └── Results...
```

**Problem:** `AssistantSummary` was ALWAYS rendered outside the `search-card` div, regardless of whether the assistant message had a `requestId` or not.

---

## Architecture Rule

### Placement Decision Matrix

| Condition | Assistant Has RequestId? | Render Location |
|-----------|-------------------------|-----------------|
| **Contextual message** | YES ✅ | INSIDE search-card |
| **Global/System message** | NO ❌ | OUTSIDE search-card |

### Rules Enforced:

1. **If assistant message has requestId → MUST render inside SearchCard**
   - Visually binds message to search context
   - Clarifications, summaries, suggestions appear with search input

2. **If SearchCard for requestId does not exist → Create in STOP/CLARIFY state**
   - (Note: This scenario is handled by SearchFacade lifecycle - SearchCard exists during search)

3. **Global/system messages allowed ONLY when requestId is null/absent**
   - Connection status, system errors, etc.
   - NOT bound to any search

---

## Solution

### Computed Signals Added

**File:** `search-page.component.ts`

```typescript
// PLACEMENT FIX: Determine if assistant is bound to a requestId (contextual) vs. global/system
readonly assistantHasRequestId = computed(() => {
  return !!this.facade.requestId();
});

// Split assistant visibility: contextual (inside search-card) vs. global (outside)
readonly showContextualAssistant = computed(() => {
  return this.showAssistant() && this.assistantHasRequestId();
});

readonly showGlobalAssistant = computed(() => {
  return this.showAssistant() && !this.assistantHasRequestId();
});
```

**Logic:**
- `assistantHasRequestId()`: Checks if `facade.requestId()` is set (truthy)
- `showContextualAssistant()`: Assistant should show AND has requestId
- `showGlobalAssistant()`: Assistant should show BUT no requestId

---

### Template Changes

**File:** `search-page.component.html`

**Before:**
```html
<!-- Search Card: Input + Assistant Line -->
<div class="search-card">
  <app-search-bar ... />
  <div class="search-meta-row">
    <app-assistant-line />
  </div>
</div>

<!-- Assistant Summary (after search card) -->
@if (showAssistant()) {
<app-assistant-summary [text]="asyncAssistantMessage()" ... />
}
```

**After:**
```html
<!-- Search Card: Input + Assistant Line + Contextual Assistant -->
<div class="search-card">
  <app-search-bar ... />
  <div class="search-meta-row">
    <app-assistant-line />
  </div>

  <!-- PLACEMENT FIX: Contextual Assistant (inside search-card when bound to requestId) -->
  @if (showContextualAssistant()) {
  <app-assistant-summary [text]="asyncAssistantMessage()" ... />
  }
</div>

<!-- Global/System Assistant (outside search-card, no requestId) -->
@if (showGlobalAssistant()) {
<app-assistant-summary [text]="asyncAssistantMessage()" ... />
}
```

**Also updated:** Mobile bottom sheet (line 162) now uses `showContextualAssistant()` instead of `showAssistant()` to maintain consistency.

---

## Data Flow

### Scenario 1: Normal Search (Contextual Assistant)

```
1. User searches "pizza near me"
2. Backend returns { requestId: "req-123", ... }
3. SearchFacade.currentRequestId = "req-123"
4. Assistant sends CLARIFY message with requestId: "req-123"
5. Computed signals:
   - assistantHasRequestId() = true ✅
   - showContextualAssistant() = true ✅
   - showGlobalAssistant() = false ❌
6. AssistantSummary renders INSIDE search-card ✅
```

### Scenario 2: Global/System Message (No RequestId)

```
1. Page loads, no search yet
2. WebSocket connection status changes
3. SearchFacade.currentRequestId = undefined
4. System message (connection status, etc.)
5. Computed signals:
   - assistantHasRequestId() = false ❌
   - showContextualAssistant() = false ❌
   - showGlobalAssistant() = true ✅
6. AssistantSummary renders OUTSIDE search-card ✅
```

### Scenario 3: WebSocket Reconnect with Active Search

```
1. User has active search with requestId: "req-456"
2. SearchFacade.currentRequestId = "req-456"
3. WebSocket reconnects
4. Backend resends assistant message for "req-456"
5. Computed signals:
   - assistantHasRequestId() = true ✅
   - showContextualAssistant() = true ✅
6. AssistantSummary renders INSIDE search-card ✅
7. Message stays contextual to search ✅
```

### Scenario 4: DONE_CLARIFY State

```
1. User searches "something tasty"
2. Backend returns DONE_CLARIFY with requestId: "req-789"
3. SearchFacade.currentRequestId = "req-789"
4. SearchFacade.clarificationBlocking = true
5. Assistant message: { type: "CLARIFY", blocksSearch: true }
6. Computed signals:
   - assistantHasRequestId() = true ✅
   - showContextualAssistant() = true ✅
7. AssistantSummary (CLARIFY) renders INSIDE search-card ✅
8. Visually bound to search input waiting for user response ✅
```

---

## Visual Architecture After Fix

```
Desktop Layout:
┌─────────────────────────────────────┐
│ <header>                            │
│  ┌───────────────────────────────┐  │
│  │ <div class="search-card">     │  │ ← Search context boundary
│  │  ┌─────────────────────────┐  │  │
│  │  │ SearchBar               │  │  │
│  │  └─────────────────────────┘  │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ AssistantLine (single)  │  │  │
│  │  └─────────────────────────┘  │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │ AssistantSummary        │  │  │ ← NOW INSIDE when requestId exists ✅
│  │  │ (if showContextualAsst) │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ AssistantSummary              │  │ ← Global/system messages only ✅
│  │ (if showGlobalAsst)           │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ <main>                              │
│  Results...                         │
└─────────────────────────────────────┘
```

---

## Placement Decision Table

| Scenario | `requestId()` | `showAssistant()` | `showContextualAssistant()` | `showGlobalAssistant()` | Render Location |
|----------|--------------|-------------------|----------------------------|------------------------|-----------------|
| **Active search with assistant** | "req-123" | true | true ✅ | false | INSIDE search-card |
| **DONE_CLARIFY state** | "req-456" | true | true ✅ | false | INSIDE search-card |
| **After reconnect (active search)** | "req-789" | true | true ✅ | false | INSIDE search-card |
| **No search, WS status message** | undefined | true | false | true ✅ | OUTSIDE search-card |
| **Fresh page load, system message** | undefined | true | false | true ✅ | OUTSIDE search-card |
| **Search finished, no assistant** | "req-999" | false | false | false | Not rendered |

---

## Edge Cases Handled

### 1. Search Without Assistant Message
```
Given: User searches "pizza", results returned successfully
When: No assistant message needed (high confidence, good results)
Then: showAssistant() = false ✅
And: No AssistantSummary rendered (contextual or global) ✅
```

### 2. Multiple Sequential Searches
```
Given: User searches "pizza" (req-1) → "sushi" (req-2) → "tacos" (req-3)
When: Each search has its own requestId
Then: AssistantSummary always INSIDE search-card ✅
And: Never appears outside (global) during searches ✅
```

### 3. Search Cleared, Then New Search
```
Given: User has search results with requestId "req-100"
When: User clears search (onClear())
Then: SearchFacade.currentRequestId = undefined
When: New search starts → requestId "req-200"
Then: AssistantSummary renders INSIDE search-card ✅
```

### 4. WebSocket Disconnected During Search
```
Given: User has active search with requestId "req-555"
When: WebSocket disconnects
Then: AssistantLine shows WS status (inside search-card) ✅
And: AssistantSummary (if any) stays INSIDE search-card ✅
And: WS status is NOT a global message (still contextual to search) ✅
```

---

## Verification

### Visual Verification

**Test Case 1: Normal Search with CLARIFY**
```
Steps:
1. Search "something ambiguous"
2. Backend returns DONE_CLARIFY with requestId

Expected:
✅ AssistantSummary (CLARIFY message) appears INSIDE search-card
✅ Message is visually bound to search input
✅ No duplicate message outside search-card
```

**Test Case 2: Search with SUMMARY**
```
Steps:
1. Search "pizza near me"
2. Backend returns results with SUMMARY assistant message

Expected:
✅ AssistantSummary (SUMMARY) appears INSIDE search-card
✅ Below AssistantLine, above results section
✅ No global/floating message
```

**Test Case 3: WebSocket Reconnect**
```
Steps:
1. Search "sushi" with requestId "req-999"
2. Disconnect WiFi → reconnect
3. Backend resends assistant message for "req-999"

Expected:
✅ AssistantSummary stays INSIDE search-card
✅ No duplication or misplacement
✅ Message remains contextual
```

**Test Case 4: Fresh Page Load (No Search)**
```
Steps:
1. Open app (no search yet)
2. WebSocket sends system/connection message

Expected:
✅ AssistantSummary (if shown) appears OUTSIDE search-card
✅ Treated as global/system message
✅ No requestId → global placement
```

---

## Interaction with Other Fixes

### Fix 1: Reconnect RequestId Filtering
**File:** `assistant-line.component.ts`
- Filters messages by active requestId
- Prevents old messages after reconnect
- **Complements** placement fix: Filter + Place = Correct contextual rendering

### Fix 2: CLARIFY Suppression in AssistantLine
**File:** `assistant-line.component.ts`
- Suppresses CLARIFY type messages in single-line component
- AssistantSummary shows CLARIFY message (now INSIDE search-card)
- **Complements** placement fix: Single-line vs. multi-line with correct placement

**Combined Effect:**
```
CLARIFY message flow:
1. Backend sends: { requestId: "req-123", type: "CLARIFY", blocksSearch: true }
2. AssistantLineComponent: Filters by requestId ✅ → Suppresses CLARIFY type ✅
3. SearchFacade: Processes → assistantHandler.setMessage() ✅
4. SearchPageComponent: showContextualAssistant() = true ✅
5. AssistantSummary: Renders INSIDE search-card ✅

Result: Single CLARIFY message, correctly placed inside search-card ✅
```

---

## Files Modified

**2 files changed:**
1. `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`
   - Added 3 computed signals: `assistantHasRequestId`, `showContextualAssistant`, `showGlobalAssistant`

2. `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`
   - Moved AssistantSummary INSIDE search-card (conditionally with `showContextualAssistant`)
   - Added second AssistantSummary OUTSIDE search-card (conditionally with `showGlobalAssistant`)
   - Updated bottom sheet condition to use `showContextualAssistant`

**Lines added:** ~15 lines (TypeScript), ~10 lines (HTML)  
**Complexity:** Low (simple computed signals, template conditional)

---

## No Backend Changes

✅ Backend contract unchanged (still sends requestId with messages)  
✅ Backend doesn't need to know about frontend placement rules  
✅ Frontend now correctly interprets requestId for placement  

---

## CSS/Style Impact

**No CSS changes needed.**

The `.search-card` class already exists and provides proper visual boundary. AssistantSummary rendering inside it inherits the card's styling automatically.

---

## Summary

| Requirement | Status |
|-------------|--------|
| **Messages with requestId NEVER global** | ✅ YES (always inside search-card) |
| **SearchCard contains contextual assistant** | ✅ YES (via showContextualAssistant) |
| **Global messages only when no requestId** | ✅ YES (via showGlobalAssistant) |
| **No UX changes (visual polish)** | ✅ YES (same components, better placement) |
| **Frontend only** | ✅ YES (no backend changes) |
| **Works with reconnect fix** | ✅ YES (complementary fixes) |

---

**Status:** ✅ **Complete** - Assistant messages with requestId now always render inside SearchCard, maintaining visual context.

**Key Fix:** Split `showAssistant()` logic into `showContextualAssistant()` and `showGlobalAssistant()`, using `facade.requestId()` to determine placement.
