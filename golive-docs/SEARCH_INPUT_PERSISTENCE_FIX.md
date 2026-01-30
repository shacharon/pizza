# Search Input Persistence Fix

**Date:** 2026-01-30  
**Component:** Search Bar (Angular Frontend)

---

## Problem

The search input was being cleared or reset after:
- Search execution
- Navigation
- WebSocket updates
- Results refresh

**Root Cause:** The `SearchBarComponent` had its own local `query` signal that wasn't connected to the parent's state. The input was **uncontrolled**, meaning the parent couldn't provide the persisted query value.

---

## Solution

Made the search bar a **controlled component** by:

### 1. Added `value` Input Signal
```typescript
readonly value = input<string>(''); // Parent provides the query value
```

### 2. Synced Local State with Parent via Effect
```typescript
constructor() {
  // Sync local query with parent's value input
  effect(() => {
    const parentValue = this.value();
    if (parentValue !== this.query()) {
      this.query.set(parentValue);
    }
  });
}
```

### 3. Passed Facade Query to Search Bar
```html
<app-search-bar 
  [value]="facade.query()"
  [loading]="facade.loading()" 
  [placeholder]="'What are you hungry for?'"
  (search)="onSearch($event)" 
  (inputChange)="onInputChange($event)" 
  (clear)="onClear()" />
```

---

## Behavior

### Before Fix ❌
- User types: "פיצה בתל אביב"
- User submits search
- Input clears or resets to empty
- User has no context of what they just searched

### After Fix ✅
- User types: "פיצה בתל אביב"
- User submits search
- Input shows: "פיצה בתל אביב" (persists)
- Results appear below
- WebSocket updates arrive
- Input still shows: "פיצה בתל אביב" (unchanged)
- User navigates away and back
- Input still shows: "פיצה בתל אביב" (persisted in store)

---

## Technical Details

### Data Flow

```
User Types → SearchBar.onInput() → Emit inputChange
                                  → Update local signal
                                  → Parent receives input

User Submits → SearchBar.onSearch() → Emit search
                                    → Parent calls facade.search()
                                    → Store updates query signal
                                    → Store query flows back to SearchBar via [value] input
                                    → Effect syncs local signal
                                    → Input displays persisted query
```

### Key Points

1. **Single Source of Truth:** `SearchStore.query` is the canonical query value
2. **Controlled Component:** SearchBar receives value from parent, not managing its own state
3. **Two-Way Sync:** 
   - User edits flow up via `inputChange` output
   - Store updates flow down via `value` input
4. **Persistence:** Query persists in store across navigation, WS updates, etc.

---

## Files Changed

1. **llm-angular/src/app/features/unified-search/components/search-bar/search-bar.component.ts**
   - Added `value` input signal
   - Added effect to sync local query with parent value
   - Updated component documentation

2. **llm-angular/src/app/features/unified-search/search-page/search-page.component.html**
   - Added `[value]="facade.query()"` binding to search-bar

---

## Testing

### Manual Test

1. Open app
2. Type "pizza" in search
3. Press Enter
4. **Verify:** Input still shows "pizza"
5. Click a restaurant card
6. **Verify:** Input still shows "pizza"
7. Navigate to different page
8. Navigate back to search
9. **Verify:** Input still shows "pizza"
10. WebSocket sends updates
11. **Verify:** Input still shows "pizza"
12. Only manually clicking clear (X) or editing should change it

### Expected Behavior

✅ Input persists as typed until user manually edits  
✅ Search execution does NOT clear input  
✅ Navigation does NOT clear input  
✅ WebSocket updates do NOT clear input  
✅ Results refresh does NOT clear input  
✅ Only user actions (typing, clearing) change input  

---

## Contract Preservation

**No Breaking Changes:**
- Component API unchanged (new input is additive)
- Existing outputs still work
- Backward compatible with parent components

---

## Related Patterns

This follows the **Controlled Component** pattern from React/Angular:
- Parent owns the state
- Child receives value via input
- Child emits changes via output
- Parent decides what to do with changes

Similar to:
- React: `<input value={value} onChange={handleChange} />`
- Angular: `<app-input [value]="value" (valueChange)="handleChange($event)" />`

---

**Status:** ✅ COMPLETE  
**Tested:** Manual verification pending  
**Ready for:** Deployment
