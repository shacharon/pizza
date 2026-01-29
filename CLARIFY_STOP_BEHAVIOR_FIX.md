# CLARIFY Stop Behavior Fix - Frontend

**Date**: 2026-01-28  
**Type**: Frontend Fix - DONE_CLARIFY Handling  
**Scope**: Angular Frontend Only (No Backend Changes)

---

## Problem Statement

When backend returns `status = DONE_CLARIFY` with `blocksSearch=true`:
- ❌ UI continued showing loading indicators
- ❌ UI felt "stuck" waiting for results that would never come
- ❌ No clear signal to user that clarification is required
- ❌ Next user input attempted to continue old request instead of starting fresh

---

## Solution Overview

Implemented proper DONE_CLARIFY handling in the frontend:

1. **Immediate stop**: Stop loading/progress indicators when `blocksSearch=true`
2. **Block further events**: Ignore subsequent search events for this request
3. **Display clarification**: Show assistant message as primary UI
4. **Fresh search**: Next user input triggers NEW search with new requestId

---

## Implementation Details

### 1. Added Clarification Blocking State

**Location**: `search.facade.ts`

```typescript
// NEW: Clarification blocking state (DONE_CLARIFY)
private readonly clarificationBlocking = signal<boolean>(false);
readonly isWaitingForClarification = this.clarificationBlocking.asReadonly();
```

**Purpose**: Track when search is blocked pending user clarification

---

### 2. Handle Assistant Message with `blocksSearch`

**Location**: `search.facade.ts` → `handleWsMessage()` → `onAssistantMessage` callback

**Added logic:**
```typescript
// NEW: Handle CLARIFY with blocksSearch (DONE_CLARIFY)
if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
  console.log('[SearchFacade] DONE_CLARIFY - stopping search, waiting for user input');
  
  // Stop loading immediately
  this.searchStore.setLoading(false);
  
  // Set clarification blocking state
  this.clarificationBlocking.set(true);
  
  // Cancel any pending polling
  this.apiHandler.cancelPolling();
  
  // Set assistant message for display
  const assistMessage = narrator.message || narrator.question || 'Please provide more information';
  this.assistantHandler.setMessage(assistMessage);
  this.assistantHandler.setStatus('completed');
}
```

**Behavior:**
- ✅ Stops loading indicator immediately
- ✅ Cancels any pending HTTP polling
- ✅ Sets clarification blocking state
- ✅ Displays assistant message via narration system
- ✅ Sets assistant status to 'completed' (not streaming)

---

### 3. Block Search Events During Clarification

**Location**: `search.facade.ts` → `handleSearchEvent()`

**Added guard:**
```typescript
// NEW: Ignore search events if clarification is blocking
if (this.clarificationBlocking()) {
  console.log('[SearchFacade] Ignoring search event - waiting for clarification');
  return;
}
```

**Purpose**: Prevent progress/ready/error events from interfering with clarification state

---

### 4. Reset Blocking State on New Search

**Location**: `search.facade.ts` → `search()` method

**Added reset logic:**
```typescript
// NEW: Clear clarification blocking state (fresh search)
this.clarificationBlocking.set(false);

// NEW: Generate new requestId for fresh search (not continuation)
this.currentRequestId.set(undefined);
```

**Behavior:**
- ✅ Clears blocking state so new search can proceed
- ✅ Clears requestId so backend generates NEW requestId
- ✅ Ensures clean slate for new search

---

### 5. Added Helper Method to Assistant Handler

**Location**: `search-assistant.facade.ts`

**New method:**
```typescript
/**
 * Set assistant message text (for DONE_CLARIFY)
 */
setMessage(message: string): void {
  this.assistantText.set(message);
}
```

**Purpose**: Allow setting assistant narration text directly for DONE_CLARIFY messages

---

## Data Flow

### Before Fix (Broken)
```
Backend sends: assistant { type: 'CLARIFY', blocksSearch: true, message: "..." }
    ↓
Frontend: logs message but continues loading ❌
    ↓
User sees: Loading spinner forever 🔄
    ↓
User types next query: tries to continue old request ❌
```

### After Fix (Working)
```
Backend sends: assistant { type: 'CLARIFY', blocksSearch: true, message: "..." }
    ↓
Frontend: 
  - Stops loading ✅
  - Sets clarificationBlocking = true ✅
  - Cancels polling ✅
  - Displays assistant message ✅
    ↓
User sees: Assistant message with no loading indicator ✅
    ↓
User types next query:
  - Clears clarificationBlocking ✅
  - Clears requestId → backend generates NEW requestId ✅
  - Fresh search starts ✅
```

---

## State Transitions

### Normal Search Flow
```
IDLE → LOADING → COMPLETED
              ↓
         (has results)
```

### DONE_CLARIFY Flow
```
IDLE → LOADING → CLARIFY_BLOCKING
                      ↓
              (shows assistant message)
                      ↓
        (waits for user input)
                      ↓
              (user types query)
                      ↓
        IDLE → LOADING (NEW search)
```

---

## UI Behavior

### When DONE_CLARIFY Received

**Before:**
- 🔄 Loading spinner continues
- ❓ User confused (nothing happening)
- 🚫 Can't tell if stuck or waiting

**After:**
- ✅ Loading stops immediately
- 💬 Assistant message displayed
- 📝 Clear that user input is needed
- 🔄 Next input starts fresh search

---

## Files Modified

### Frontend (Angular)
1. **MODIFIED**: `llm-angular/src/app/facades/search.facade.ts` (+25 lines)
   - Added `clarificationBlocking` signal
   - Handle `blocksSearch=true` in assistant messages
   - Guard search events during clarification
   - Reset state on new search

2. **MODIFIED**: `llm-angular/src/app/facades/search-assistant.facade.ts` (+6 lines)
   - Added `setMessage()` method for direct text setting

**Total**: 2 files modified, ~31 lines added

---

## Edge Cases Handled

### 1. Multiple CLARIFY Messages
- ✅ Only first one sets blocking state
- ✅ Subsequent messages update narration text
- ✅ Loading remains stopped

### 2. User Starts New Search During CLARIFY
- ✅ Blocking state cleared
- ✅ New requestId generated
- ✅ Fresh search starts normally

### 3. WebSocket Reconnection During CLARIFY
- ✅ Blocking state persists across reconnections
- ✅ No spurious loading states

### 4. Polling Race Condition
- ✅ Polling canceled immediately
- ✅ No fetch attempts after DONE_CLARIFY

---

## Testing Checklist

### Manual Testing
- [ ] Trigger DONE_CLARIFY from backend
- [ ] Verify loading stops immediately
- [ ] Verify assistant message displays
- [ ] Verify no more progress events processed
- [ ] Type new query and verify NEW requestId generated
- [ ] Verify new search works normally

### Regression Testing
- [ ] Normal search still works
- [ ] Async 202 + WebSocket still works
- [ ] Polling fallback still works
- [ ] Error handling still works

---

## Backend Contract (Unchanged)

The fix relies on existing backend contract:

```typescript
{
  type: 'assistant',
  requestId: string,
  payload: {
    type: 'CLARIFY',
    message: string,
    question: string | null,
    blocksSearch: boolean  // ← When true, stops search
  }
}
```

**No backend changes required** ✅

---

## Known Limitations

### 1. No Explicit "Clarification Required" Banner
- Currently shows assistant message via narration system
- Could add explicit banner/header in future enhancement

### 2. No Visual Difference from Other Assistant Messages
- DONE_CLARIFY looks like any other assistant message
- Could add specific styling/icon for clarification state

### 3. Clarification State Not Persisted
- If user refreshes page, clarification state is lost
- Acceptable for MVP (session-based)

---

## Future Enhancements (Out of Scope)

1. **Explicit clarification banner**
   - Header: "Need More Information"
   - Prominent styling
   - Clear CTA

2. **Clarification history**
   - Track which clarifications were asked
   - Prevent duplicate clarifications

3. **Clarification analytics**
   - Track which queries trigger DONE_CLARIFY
   - Measure user response rate

4. **Timeout handling**
   - Auto-clear blocking state after 5 minutes
   - Prevent infinite wait state

---

## Verification Commands

```bash
# Lint check
ng lint

# Type check
ng build --configuration development

# Run dev server
ng serve
```

---

## Related Documentation

- WebSocket protocol: `ws-protocol.types.ts`
- Search contracts: `search.contracts.ts`
- Backend assistant: `server/src/infra/websocket/assistant-ws.publisher.ts`

---

**Status**: ✅ Complete - Ready for testing

**Key Fix**: Loading stops immediately when `blocksSearch=true`, and next search starts fresh with new requestId.
