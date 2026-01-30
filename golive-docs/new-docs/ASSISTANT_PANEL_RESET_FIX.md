# Assistant Panel Reset UX Fix

**Date:** 2026-01-29  
**Status:** ✅ COMPLETE

## Summary

Fixed the Assistant panel UX so that each new search properly resets and clears previous assistant messages. Messages are now properly scoped to `requestId`, and old messages from previous searches are never shown in the current search panel.

## Problem

Previously:
- Assistant messages from previous searches could carry over to new searches
- `resetIfGlobal()` preserved card-bound messages, causing confusion
- Old `requestId` messages could potentially appear in new searches
- No clear scoping of messages to specific searches

## Solution

### 1. Full Message Reset on New Search

**File:** `llm-angular/src/app/facades/search.facade.ts`

**Change:**
```typescript
// BEFORE: Preserved card-bound messages
this.assistantHandler.resetIfGlobal();

// AFTER: Clear ALL messages on fresh search
this.assistantHandler.reset();
```

**Impact:**
- Every new search starts with a completely clean assistant panel
- No message carry-over from previous searches
- Clear separation between search sessions

### 2. Enhanced RequestId Filtering

**File:** `llm-angular/src/app/facades/search-ws.facade.ts`

**Change:**
Improved WebSocket message filtering to be more explicit about requestId scoping:

```typescript
// REQUESTID SCOPING: Ignore messages for old/different requests
if ('requestId' in msg && (msg as any).requestId) {
  const msgRequestId = (msg as any).requestId;
  
  // No active search - ignore all request-specific messages
  if (!currentRequestId) {
    console.debug('[SearchWsHandler] Ignoring message - no active search');
    return true;
  }
  
  // Different requestId - ignore (old search)
  if (msgRequestId !== currentRequestId) {
    console.debug('[SearchWsHandler] Ignoring message from old request', { 
      msgRequestId, 
      currentRequestId 
    });
    return true;
  }
}
```

**Impact:**
- Messages without an active search are ignored
- Messages from old `requestId` values are explicitly rejected
- Better logging for debugging requestId mismatches

### 3. RequestId Clearing

**File:** `llm-angular/src/app/facades/search.facade.ts`

**Change:**
```typescript
// Clear requestId before search (will be set when response arrives)
this.currentRequestId.set(undefined);
```

**Impact:**
- `requestId` is cleared at the start of each search
- New `requestId` is set only when the response arrives
- Clean state transition between searches

## Technical Details

### Message Flow

1. **User starts new search** → `SearchFacade.search()` called
2. **Immediate cleanup:**
   - `this.assistantHandler.reset()` → Clears ALL messages (line, card, legacy)
   - `this.currentRequestId.set(undefined)` → Clears active requestId
   - `this._cardState.set('RUNNING')` → Resets card state
3. **POST /search** → Returns new requestId
4. **RequestId set** → `this.currentRequestId.set(requestId)`
5. **WebSocket messages:**
   - Messages without requestId → Ignored (no active search)
   - Messages with old requestId → Ignored (filtered out)
   - Messages with current requestId → Processed

### AssistantHandler Methods

**`reset()`** - Full reset (used on new search):
- Clears `_lineMessages`, `_cardMessages`, `_messages`
- Clears dedupe service
- Resets all status signals
- Clears `requestId` and `blocksSearch` flags

**`resetIfGlobal()`** - Selective reset (LEGACY, no longer used):
- Clears line messages
- Preserves card messages with requestId
- Used for partial resets (not needed in current flow)

### Message Channels

**Line Channel:**
- Types: PRESENCE, WS_STATUS, PROGRESS
- Always cleared on new search
- Shows transient status

**Card Channel:**
- Types: SUMMARY, CLARIFY, GATE_FAIL
- Cleared on new search (full reset)
- Shows persistent assistant cards

## Testing

### Unit Tests Added

**File:** `llm-angular/src/app/facades/search-assistant-reset.spec.ts`

Tests cover:
- ✅ Full message clearing with `reset()`
- ✅ Dedupe service clearing
- ✅ Message scoping by requestId
- ✅ Separate message tracking for different requestIds
- ✅ Legacy `resetIfGlobal()` behavior
- ✅ Card vs Line channel routing
- ✅ Message deduplication
- ✅ `blocksSearch` flag handling

### Manual Testing

1. **Scenario: New search clears previous messages**
   - Search "pizza"
   - Wait for assistant messages (SUMMARY, CLARIFY, etc.)
   - Search "sushi"
   - **Expected:** Old pizza messages disappear immediately
   - **Expected:** Only sushi-related messages appear

2. **Scenario: Old requestId messages are ignored**
   - Start search (requestId: req-1)
   - Wait for some messages
   - Start new search (requestId: req-2)
   - If late messages arrive for req-1
   - **Expected:** req-1 messages are filtered out
   - **Expected:** Only req-2 messages appear

3. **Scenario: WebSocket reconnection**
   - Start search
   - Disconnect WebSocket
   - Reconnect
   - Old messages arrive
   - **Expected:** Only current requestId messages shown

## Edge Cases Handled

✅ **No active search:** Messages with requestId are ignored when `currentRequestId === undefined`  
✅ **Late messages:** Messages from old searches are filtered by requestId comparison  
✅ **Race conditions:** Reset happens synchronously before new search starts  
✅ **WebSocket reconnect:** Filtering prevents old messages from reappearing  
✅ **Page refresh:** No messages shown until new search starts (no rehydration)

## Backward Compatibility

- `resetIfGlobal()` method preserved for any legacy code that might use it
- Legacy `_messages` array still maintained alongside new channel system
- Existing components continue to work (AssistantPanelComponent already had requestId clearing)

## Files Changed

1. `llm-angular/src/app/facades/search.facade.ts`
   - Changed `resetIfGlobal()` to `reset()`
   - Updated comments to reflect fresh search behavior

2. `llm-angular/src/app/facades/search-ws.facade.ts`
   - Enhanced requestId filtering logic
   - Added better logging for debugging

3. `llm-angular/src/app/facades/search-assistant-reset.spec.ts` (NEW)
   - Comprehensive unit tests for reset behavior

## Verification

✅ All TODOs completed  
✅ Unit tests added  
✅ No linter errors  
✅ Backward compatibility maintained  
✅ Edge cases documented  
✅ Clear documentation provided

## Related Components

### Already Correct
- `AssistantPanelComponent` - Already clears messages on new requestId (lines 87-91, 149-153)
- `SearchPageComponent` - Already filters by requestId in computed signals

### Now Fixed
- `SearchFacade` - Now uses full reset instead of selective
- `SearchWsHandler` - Enhanced filtering with better logging
