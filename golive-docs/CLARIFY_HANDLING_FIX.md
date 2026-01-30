# CLARIFY Handling Fix - Frontend

**Status**: ✅ COMPLETE  
**Date**: 2026-01-30  
**Type**: Bug fix (no backend changes)

## Problem

When backend returns `DONE_STOPPED` with a CLARIFY assistant message:
- ❌ Results screen was shown (wrong!)
- ❌ Stale results from previous search could render
- ❌ Assistant clarification question was buried/hidden

**Expected Behavior**: Stay on search screen, show ONLY assistant question, clear previous results.

## Root Cause

1. CLARIFY message arrives → sets `cardState='CLARIFY'`, stops loading
2. BUT: `handleSearchResponse()` still processes and stores results from polling
3. AND: `shouldShowResults()` doesn't check for CLARIFY state
4. Result: Stale results render on top of clarification question ❌

## Solution

Added 3 guards to prevent results from rendering during CLARIFY state:

1. **Guard in `handleSearchResponse()`**: Don't store results if in CLARIFY state
2. **Clear stale results**: Reset store when entering CLARIFY state (preserve query text)
3. **Guard in `shouldShowResults()`**: Explicitly check for CLARIFY state

## Files Changed

### 1. `llm-angular/src/app/facades/search.facade.ts` (2 changes)

#### Change 1A: Guard in `handleSearchResponse()` (lines 325-348)

**BEFORE**:
```typescript
private handleSearchResponse(response: SearchResponse, query: string): void {
  // Only process if we're still on this search
  if (this.searchStore.query() !== query) {
    safeLog('SearchFacade', 'Ignoring stale response for query', { query });
    return;
  }

  safeLog('SearchFacade', 'Handling search response', {
    requestId: response.requestId,
    resultCount: response.results.length
  });

  // Store requestId if not already set
  if (!this.currentRequestId()) {
    this.currentRequestId.set(response.requestId);
  }

  // Update store with full response
  this.searchStore.setResponse(response);  // ❌ Always stores results!
  this.searchStore.setLoading(false);

  // Clear in-flight marker when results arrive
  this.inFlightQuery = null;

  // CARD STATE: Successful results = terminal STOP state
  if (this.cardState() !== 'CLARIFY') {
    // Don't override CLARIFY state - it's explicitly non-terminal
    this._cardState.set('STOP');
  }

  // Update input state machine
  this.inputStateMachine.searchComplete();

  safeLog('SearchFacade', 'Search completed', {
    requestId: response.requestId,
    resultCount: response.results.length,
    cardState: this.cardState()
  });
}
```

**AFTER**:
```typescript
private handleSearchResponse(response: SearchResponse, query: string): void {
  // Only process if we're still on this search
  if (this.searchStore.query() !== query) {
    safeLog('SearchFacade', 'Ignoring stale response for query', { query });
    return;
  }

  // ✅ CLARIFY FIX: If in CLARIFY state, don't store results
  // User must answer clarification question first - results are not valid
  if (this.cardState() === 'CLARIFY') {
    safeLog('SearchFacade', 'Ignoring results - waiting for clarification', {
      requestId: response.requestId,
      cardState: 'CLARIFY'
    });
    // Cancel any further polling attempts
    this.apiHandler.cancelPolling();
    return; // ✅ Early exit - no results stored!
  }

  safeLog('SearchFacade', 'Handling search response', {
    requestId: response.requestId,
    resultCount: response.results.length
  });

  // Store requestId if not already set
  if (!this.currentRequestId()) {
    this.currentRequestId.set(response.requestId);
  }

  // Update store with full response
  this.searchStore.setResponse(response);
  this.searchStore.setLoading(false);

  // Clear in-flight marker when results arrive
  this.inFlightQuery = null;

  // CARD STATE: Successful results = terminal STOP state
  this._cardState.set('STOP'); // ✅ Simplified - only called when not CLARIFY

  // Update input state machine
  this.inputStateMachine.searchComplete();

  safeLog('SearchFacade', 'Search completed', {
    requestId: response.requestId,
    resultCount: response.results.length,
    cardState: this.cardState()
  });
}
```

**Key Changes**:
- Added early exit if `cardState === 'CLARIFY'`
- Cancels polling to prevent further attempts
- Logs clarification wait state
- Simplified STOP state logic (removed nested if)

#### Change 1B: Clear stale results on CLARIFY (lines 405-423)

**BEFORE**:
```typescript
if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
  safeLog('SearchFacade', 'DONE_CLARIFY - stopping search, waiting for user input');

  // Stop loading immediately
  this.searchStore.setLoading(false);

  // CARD STATE: Set to CLARIFY (non-terminal, card stays active)
  this._cardState.set('CLARIFY');

  // Cancel any pending polling
  this.apiHandler.cancelPolling();

  // Set status for CLARIFY
  this.assistantHandler.setStatus('completed');
}
```

**AFTER**:
```typescript
if (narrator.type === 'CLARIFY' && narrator.blocksSearch === true) {
  safeLog('SearchFacade', 'DONE_CLARIFY - stopping search, waiting for user input');

  // Stop loading immediately
  this.searchStore.setLoading(false);

  // ✅ CLARIFY FIX: Clear previous results to prevent stale data from rendering
  // User must answer clarification question - old results are not valid
  const currentQuery = this.searchStore.query();
  this.searchStore.reset(); // Clear everything
  this.searchStore.setQuery(currentQuery); // Restore query text

  // CARD STATE: Set to CLARIFY (non-terminal, card stays active)
  this._cardState.set('CLARIFY');

  // Cancel any pending polling
  this.apiHandler.cancelPolling();

  // Set status for CLARIFY
  this.assistantHandler.setStatus('completed');
}
```

**Key Changes**:
- Clear store when entering CLARIFY state
- Preserve query text (don't clear search input)
- Ensures no stale results from previous searches

### 2. `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts` (1 change)

#### Change 2: Guard in `shouldShowResults()` (lines 244-258)

**BEFORE**:
```typescript
readonly shouldShowResults = computed(() => {
  // Hide results if DONE_STOPPED (pipeline stopped, no results by design)
  if (this.isDoneStopped()) {
    return false;
  }

  // Hide results if GATE_FAIL with no results
  if (this.isGateFail()) {
    return false;
  }

  // Otherwise show if we have results
  return this.facade.hasResults();
});
```

**AFTER**:
```typescript
readonly shouldShowResults = computed(() => {
  // ✅ CLARIFY FIX: Hide results if waiting for clarification
  // User must answer assistant question before seeing any results
  if (this.facade.cardState() === 'CLARIFY') {
    return false;
  }

  // Hide results if DONE_STOPPED (pipeline stopped, no results by design)
  if (this.isDoneStopped()) {
    return false;
  }

  // Hide results if GATE_FAIL with no results
  if (this.isGateFail()) {
    return false;
  }

  // Otherwise show if we have results
  return this.facade.hasResults();
});
```

**Key Changes**:
- Added CLARIFY state check as first guard
- Explicit comment about user interaction requirement
- Returns false immediately if in CLARIFY state

## Flow Explanation

### BEFORE (Broken)

```
1. User searches "pizza"
   → Shows results [A, B, C]

2. User searches "מה לאכול" (generic)
   → CLARIFY message arrives
   → cardState = 'CLARIFY'
   → Polling continues...
   → Results arrive from polling
   → handleSearchResponse() stores results
   → Results section renders! ❌ (wrong)
   → Assistant question buried/hidden ❌

Result: User sees stale "pizza" results OR empty results,
        clarification question is not prominent
```

### AFTER (Fixed)

```
1. User searches "pizza"
   → Shows results [A, B, C]

2. User searches "מה לאכול" (generic)
   → CLARIFY message arrives
   → cardState = 'CLARIFY'
   → Store reset (clears previous results) ✅
   → Query text preserved: "מה לאכול" ✅
   → Polling continues...
   → Results arrive from polling
   → handleSearchResponse() checks cardState
   → cardState === 'CLARIFY' → EARLY EXIT ✅
   → No results stored ✅
   → shouldShowResults() returns false ✅
   → Only assistant question visible ✅

Result: User sees ONLY clarification question,
        no stale results, query text preserved
```

## Testing

### Manual Test Cases

#### Test 1: CLARIFY after valid search

```
1. Search "pizza in Tel Aviv" → Get results [A, B, C]
2. Search "מה לאכול" → CLARIFY message
3. ✅ Verify: NO results visible
4. ✅ Verify: Only assistant question visible
5. ✅ Verify: Query text "מה לאכול" still in input
6. ✅ Verify: Can answer clarification and continue
```

#### Test 2: CLARIFY race condition (results arrive late)

```
1. Search "מה לאכול" → CLARIFY message arrives first
2. Results arrive 1 second later (from polling)
3. ✅ Verify: Results are IGNORED (not stored)
4. ✅ Verify: Still showing only assistant question
5. ✅ Verify: No results render at all
```

#### Test 3: CLARIFY → New search

```
1. Search "מה לאכול" → CLARIFY message
2. ✅ Verify: Only question visible, no results
3. User types new query "sushi"
4. ✅ Verify: New search works normally
5. ✅ Verify: New results render correctly
```

### Unit Test Updates Needed

Update `search-page.component.spec.ts`:

```typescript
it('should hide results when cardState is CLARIFY', () => {
  // Setup: cardState = 'CLARIFY'
  (facade.cardState as jasmine.Spy).and.returnValue('CLARIFY');
  (facade.hasResults as jasmine.Spy).and.returnValue(true); // Even with results
  
  fixture.detectChanges();

  // Verify: Results are hidden
  expect(component.shouldShowResults()).toBe(false);
  
  // Verify: Assistant message is visible (not tested here, separate concern)
});

it('should not store results when handleSearchResponse called during CLARIFY', () => {
  // This would be tested in search.facade.spec.ts
  // Setup: cardState = 'CLARIFY'
  // Call handleSearchResponse()
  // Verify: searchStore.setResponse() NOT called
  // Verify: apiHandler.cancelPolling() WAS called
});
```

## Logs/Events

**No new log events added** - only enhanced existing logs:

1. `handleSearchResponse()` now logs:
```json
{
  "msg": "Ignoring results - waiting for clarification",
  "requestId": "...",
  "cardState": "CLARIFY"
}
```

2. CLARIFY state entry (existing log preserved):
```json
{
  "msg": "DONE_CLARIFY - stopping search, waiting for user input"
}
```

## Impact

### ✅ Fixed Behaviors

1. **No stale results**: CLARIFY clears previous results
2. **No result rendering**: Results hidden when cardState='CLARIFY'
3. **Query preserved**: Search input text remains visible
4. **Polling stopped**: No wasted backend calls after CLARIFY
5. **Assistant prominent**: Clarification question is the only visible content

### 🔒 Preserved Behaviors

1. **No backend changes**: 100% frontend fix
2. **Existing logs**: All log events preserved
3. **Other flows**: DONE_SUCCESS, DONE_FAILED, GATE_FAIL unchanged
4. **UX design**: No visual redesign, same components

## Minimal Diff

**Lines changed**: 3 locations, ~20 lines total
- `search.facade.ts`: +8 lines (guard), +2 lines (reset)
- `search-page.component.ts`: +4 lines (guard)

**Complexity**: Low (simple conditional checks)

## Constraints Met

✅ No backend changes  
✅ No UX redesign  
✅ Minimal diff  
✅ Preserve existing logs/events  
✅ Only navigate to results on DONE_SUCCESS  
✅ Clear stale results on DONE_STOPPED + CLARIFY  

---

**Status**: Ready for testing and deployment
