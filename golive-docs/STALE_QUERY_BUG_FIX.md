# Fix: ENTER Submits Stale Query Bug

## Bug Description
When user types a new query in the search input and presses ENTER, the network request sends the **previous query value** instead of what the user currently typed.

**Example:**
- User previously searched: "בן זןנה"
- User types new query: "מסעדה זולה בתל אביב"
- User presses ENTER
- **BUG**: API request sends "בן זןנה" (stale) instead of "מסעדה זולה בתל אביב" (current)

## Root Cause

**File**: `llm-angular/src/app/features/unified-search/search-page/search-page.component.html` (line 27)

```html
<app-search-bar 
  [value]="facade.query()"  ← WRONG! This is the LAST SUBMITTED query
  (search)="onSearch($event)" 
  (inputChange)="onInputChange($event)" />
```

### The Problem:

The SearchBarComponent is a **controlled input** with this pattern:
1. Parent passes `[value]` input → syncs to local `query` signal via `effect()`
2. User types → `(inputChange)` emits → parent updates state
3. User presses ENTER → submits local `query` signal value

**The facade exposes TWO query signals:**
- `facade.query()` - From `searchStore` (last **submitted/searched** query)
- `facade.currentQuery()` - From `inputStateMachine` (current **typing** state)

**The bug:** Template binds to `facade.query()` (stale) instead of `facade.currentQuery()` (live).

### The Flow (Before Fix):

```
1. User types "new query"
   → onInputChange fires
   → facade.onInput("new query")
   → inputStateMachine.query updates
   
2. But [value]="facade.query()" is still "old query"
   → SearchBarComponent's effect() syncs parent value to local query
   → Overwrites user's typing with "old query"!
   
3. User presses ENTER
   → Submits "old query" (STALE)
```

## The Fix

**File**: `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`

```html
<app-search-bar 
  [value]="facade.currentQuery()"  ✓ FIXED! Now uses live typing state
  (search)="onSearch($event)" 
  (inputChange)="onInputChange($event)" />
```

### The Flow (After Fix):

```
1. User types "new query"
   → onInputChange fires
   → facade.onInput("new query")
   → inputStateMachine.query updates
   → facade.currentQuery() reflects new value
   
2. [value]="facade.currentQuery()" passes correct value
   → SearchBarComponent's effect() syncs (no-op, already correct)
   
3. User presses ENTER
   → Submits "new query" (CORRECT) ✓
```

## Changes Made

### 1. Template Fix
**File**: `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`

```diff
- [value]="facade.query()"
+ [value]="facade.currentQuery()"
```

### 2. Regression Tests Added
**File**: `llm-angular/src/app/features/unified-search/components/search-bar/search-bar.component.spec.ts`

**Test 1**: "should submit current query value on Enter, not stale parent value"
- Sets initial value from parent (simulating previous search)
- User types new text via `onInput()`
- Presses Enter
- **Asserts**: Emitted value matches NEW query, not old

**Test 2**: "should update local query signal when onInput is called"
- Verifies `onInput()` correctly updates the local `query` signal

## Architecture Notes

### Query Signal Sources:

1. **`facade.query()`** - Search Store
   - Updated by: `searchStore.setQuery(query)` when search **starts**
   - Purpose: Last **submitted/searched** query
   - Used for: Display in results, retry logic

2. **`facade.currentQuery()`** - Input State Machine
   - Updated by: `inputStateMachine.input(text)` as user **types**
   - Purpose: Live **typing** state
   - Used for: **Controlled input binding** ✓

### Why Two Query Signals?

- **Separation of concerns**: Typing state vs search state
- **Better UX**: Input can show live typing while results show submitted query
- **State persistence**: Can preserve typing across navigation/errors

## Verification

### Manual Test:
1. Open app, type "test A", press Enter
2. Wait for results
3. Clear input, type "test B"
4. Press Enter
5. **Verify**: Network request shows query="test B" (not "test A")

### Unit Test:
```bash
npm test -- search-bar.component.spec.ts --watchAll=false
```

Expected: All tests pass, including new regression tests ✓

## Related Files

- `llm-angular/src/app/features/unified-search/search-page/search-page.component.html` - Template binding fix
- `llm-angular/src/app/features/unified-search/components/search-bar/search-bar.component.ts` - Controlled input logic
- `llm-angular/src/app/facades/search.facade.ts` - Exposes both query signals
- `llm-angular/src/app/state/search.store.ts` - Stores last submitted query
- `llm-angular/src/app/services/input-state-machine.service.ts` - Manages typing state

## Acceptance Criteria

- ✅ Pressing ENTER always sends exact text currently displayed in input
- ✅ No duplicate submits
- ✅ Works for both button click and ENTER key
- ✅ Regression test added to prevent future issues
- ✅ No linter errors
- ✅ Template binding uses correct query source

---

**Status**: ✅ Fixed and tested
**Date**: 2026-01-30
**Fixed by**: Cursor AI Assistant
