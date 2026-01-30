# Client-Side Pagination - Manual Testing Guide

## Test Scenarios

### Scenario 1: Initial Display (12 Results)
**Steps**:
1. Navigate to search page
2. Enter search query: "pizza in tel aviv"
3. Wait for results to load

**Expected Result**:
- ✅ Results appear immediately when search completes
- ✅ Exactly 12 restaurant cards visible
- ✅ "Show 5 more (12 of X)" button appears if total > 12
- ✅ Card text renders before photos (text should be readable even if images still loading)

### Scenario 2: "Show 5 More" Functionality
**Steps**:
1. Complete Scenario 1 (search with >12 results)
2. Click "Show 5 more" button

**Expected Result**:
- ✅ Button text updates to "Show 5 more (17 of X)"
- ✅ 5 additional cards appear below existing cards
- ✅ Total visible cards: 17
- ✅ Smooth scroll or card appearance
- ✅ Can click again to show 5 more

### Scenario 3: Show All Results
**Steps**:
1. Search with exactly 20 results
2. Click "Show 5 more" once (showing 17)
3. Click "Show 5 more" again

**Expected Result**:
- ✅ All 20 cards visible
- ✅ "Show 5 more" button disappears
- ✅ No more pagination controls shown

### Scenario 4: Small Result Set (<12)
**Steps**:
1. Search with query that returns 8 results
2. Observe results page

**Expected Result**:
- ✅ All 8 cards visible immediately
- ✅ No "Show 5 more" button appears
- ✅ Clean layout with no pagination controls

### Scenario 5: Ordering Preservation
**Steps**:
1. Search with query: "italian restaurants"
2. Note the first restaurant name
3. Click "Show 5 more" multiple times
4. Verify order remains consistent

**Expected Result**:
- ✅ Results maintain exact backend order
- ✅ No re-sorting occurs client-side
- ✅ Cards appear in sequence: 1-12, then 13-17, then 18-22, etc.

### Scenario 6: Reset on New Search
**Steps**:
1. Search for "pizza" (20 results)
2. Click "Show 5 more" twice (showing 22 results)
3. Enter new search: "burger"

**Expected Result**:
- ✅ Display resets to 12 results for new search
- ✅ "Show 5 more" button reappears if new results > 12
- ✅ Previous pagination state cleared

### Scenario 7: Reset on Filter/Sort
**Steps**:
1. Search for "restaurants" (20 results)
2. Click "Show 5 more" (showing 17 results)
3. Click "Open now" filter chip

**Expected Result**:
- ✅ Display resets to 12 results (of filtered set)
- ✅ "Show 5 more" button updated with new count
- ✅ Pagination starts fresh for filtered results

### Scenario 8: Non-Blocking Photo Loading
**Steps**:
1. Search with slow network (Chrome DevTools: Network throttling to "Slow 3G")
2. Observe card rendering

**Expected Result**:
- ✅ Card structure (name, address, rating) appears immediately
- ✅ Placeholder emoji (🍽️) visible while photo loads
- ✅ Photos load progressively (one by one)
- ✅ Page scrollable and interactive before all photos load
- ✅ No "flash of unstyled content"

### Scenario 9: Grouped Results (EXACT + NEARBY)
**Steps**:
1. Search with location-based query
2. Backend returns EXACT + NEARBY groups (total 23 results)
3. Observe pagination

**Expected Result**:
- ✅ Groups flattened (EXACT first, then NEARBY)
- ✅ First 12 visible (8 EXACT + 4 NEARBY if EXACT = 8)
- ✅ "Show 5 more" works across groups seamlessly
- ✅ Order preserved: all EXACT, then all NEARBY

### Scenario 10: Accessibility
**Steps**:
1. Search for results
2. Use keyboard navigation (Tab key)
3. Use screen reader (optional)

**Expected Result**:
- ✅ "Show 5 more" button is keyboard accessible
- ✅ Button shows count in accessible label
- ✅ All restaurant cards maintain accessibility attributes
- ✅ Photo placeholders have appropriate ARIA labels

## Visual Checks

### Layout
- [ ] Cards display in grid layout (responsive)
- [ ] "Show 5 more" button centered below cards
- [ ] Button styling matches design system (hover states, colors)
- [ ] Smooth scrolling if pagination causes page height increase

### Performance
- [ ] No visible lag when clicking "Show 5 more"
- [ ] Photos don't block main thread (check DevTools Performance tab)
- [ ] No layout shifts when photos load
- [ ] Smooth experience even with 50+ results

### Error Handling
- [ ] Broken image URLs show placeholder
- [ ] No console errors for photo loading failures
- [ ] Pagination works even if some cards fail to render

## Browser Testing
Test across browsers:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (if available)
- [ ] Mobile browsers (Chrome/Safari on iOS/Android)

## Console Logs
Watch for these logs:
```
[SearchPage] Show 5 more clicked, visible: 17 / 23
[SearchPage] Show 5 more clicked, visible: 22 / 23
[SearchPage] Show 5 more clicked, visible: 23 / 23
```

## Network Tab
Verify lazy loading:
1. Open Chrome DevTools Network tab
2. Filter to "Img" requests
3. Search for results
4. Observe: Only ~12 image requests initially
5. Click "Show 5 more"
6. Observe: ~5 more image requests triggered

## Common Issues

### Issue: All results showing at once
**Check**: `visibleResults()` should use `slice(0, displayLimit())`
**Fix**: Verify component logic in `search-page.component.ts`

### Issue: Button shows wrong count
**Check**: `fetchedCount()` and `visibleResults().length`
**Fix**: Ensure signals computing correctly

### Issue: Photos blocking render
**Check**: `shouldLoadPhoto` signal in restaurant-card
**Fix**: Verify `ngAfterViewInit()` and `requestAnimationFrame` logic

### Issue: Pagination not resetting
**Check**: `onSearch()` and `onChipClick()` call `displayLimit.set(12)`
**Fix**: Add reset logic if missing

## Success Criteria
All ✅ items above must pass for successful implementation.
