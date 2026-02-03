# Restaurant Card Status Layout - Visual Testing Guide

**Date**: 2026-02-03  
**Task**: Verify status moved to inline with restaurant name

---

## Quick Verification Steps

### 1. Open the App
```bash
cd llm-angular
npm start
```

Navigate to a search results page with restaurants.

---

## Visual Checks

### ✅ Check 1: Status Position (RTL - Hebrew)

**Test**: Search for "פיצה" or any Hebrew query

**Expected Layout**:
```
┌────────────────────────────────────────────┐
│ 🍽️  שם המסעדה          פתוח עד 23:30      │ ← Same line!
│     ★ 4.5 (123) · $$                       │
│     רחוב ראשי 123                          │
│     📍 500m 🚶‍♂️ 6 דקות                     │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Status text appears **on the same line** as restaurant name
- [ ] Status is on the **far right** (start of line in RTL)
- [ ] Restaurant name is **left-aligned** relative to status
- [ ] No separate row for status below the name

---

### ✅ Check 2: Status Position (LTR - English)

**Test**: Switch UI to English, search for "pizza"

**Expected Layout**:
```
┌────────────────────────────────────────────┐
│ 🍽️  Restaurant Name        Open until 11pm │ ← Same line!
│     ★ 4.5 (123) · $$                       │
│     123 Main Street                        │
│     📍 500m 🚶‍♂️ 6 min                      │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Status text appears **on the same line** as restaurant name
- [ ] Status is on the **far right** (end of line in LTR)
- [ ] Restaurant name is **left-aligned**
- [ ] No separate row for status

---

### ✅ Check 3: Long Restaurant Name + Truncation

**Test**: Find a restaurant with a very long name (or edit in DevTools)

**Expected**:
```
┌────────────────────────────────────────────┐
│ 🍽️  Very Long Restaurant Na...  פתוח 23:30 │
│     ★ 4.5 (123) · $$                       │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Long name shows **ellipsis (...)** when truncated
- [ ] Status text remains **fully visible** (never truncated)
- [ ] No text wrapping to second line
- [ ] No overlap between name and status

---

### ✅ Check 4: Status Colors

**Test Cases**:
1. **Open restaurant**: Should show green text
2. **Closed restaurant**: Should show gray text
3. **Unknown status**: Should show gray italic

**Expected Colors**:
- **Open**: `#059669` (emerald green) - "פתוח עכשיו · עד 23:30"
- **Closed**: `#6b7280` (gray) - "סגור כעת · נפתח ב-09:00"
- **Neutral**: `#9ca3af` (light gray, italic) - "(שעות פעילות לא מאומתות)"

**Check**:
- [ ] Open status is **green**
- [ ] Closed status is **gray** (not red!)
- [ ] Neutral status is **gray italic**
- [ ] Colors unchanged from before

---

### ✅ Check 5: Mobile View (Narrow Screen)

**Test**: Resize browser to 375px width (iPhone size)

**Expected**:
```
┌─────────────────────────┐
│ 🍽️  Restaurant Name     │
│     פתוח 23:30          │ ← Status wraps if too narrow
│     ★ 4.5 (123) · $$    │
│     📍 500m 🚶‍♂️ 6 דקות  │
└─────────────────────────┘
```

**OR (if name is short)**:
```
┌─────────────────────────┐
│ 🍽️  Name  פתוח 23:30    │ ← Fits on same line
│     ★ 4.5 (123) · $$    │
│     📍 500m              │
└─────────────────────────┘
```

**Check**:
- [ ] Status font size is **smaller** on mobile (0.75rem vs 0.8125rem)
- [ ] Spacing is **tighter** (0.5rem gap)
- [ ] No horizontal scroll
- [ ] Text remains readable

---

### ✅ Check 6: Missing Status

**Test**: Find a restaurant without opening hours data

**Expected**:
```
┌────────────────────────────────────────────┐
│ 🍽️  Restaurant Name                        │ ← No status
│     ★ 4.5 (123) · $$                       │
│     123 Main Street                        │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Layout works correctly when status is absent
- [ ] No empty space where status would be
- [ ] Name aligns properly

---

### ✅ Check 7: Gluten-Free Badge Placement

**Test**: Find a restaurant with both status and gluten-free badge

**Expected Order**:
```
┌────────────────────────────────────────────┐
│ 🍽️  Name  פתוח 23:30  [גלוטן פרי]         │
│     ★ 4.5 (123) · $$                       │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Status appears **before** gluten-free badge
- [ ] Badge still visible (not hidden)
- [ ] Proper spacing between elements

---

### ✅ Check 8: Accessibility

**Test**: Use keyboard navigation and screen reader

**Checks**:
- [ ] Tab order: Photo → Name/Status → Actions
- [ ] Screen reader announces status with `aria-label`
- [ ] Focus indicators visible
- [ ] No broken ARIA attributes

---

### ✅ Check 9: Card Height Comparison

**Test**: Compare card height before/after

**Before**: Status on separate row = **~140-150px** tall
**After**: Status inline = **~120-130px** tall

**Measurement**:
- [ ] Card is **shorter** by ~16-20px
- [ ] More cards visible per screen
- [ ] Scrolling feels more efficient

**DevTools Check**:
```javascript
// In browser console
document.querySelector('.restaurant-card').offsetHeight
// Should be ~120-130px (was ~140-150px)
```

---

### ✅ Check 10: Different Status Texts

Test various status strings:

| Hebrew | English | Check |
|--------|---------|-------|
| `פתוח עכשיו · עד 23:30` | `Open now · until 11:30pm` | [ ] |
| `סגור כעת · נפתח ב-09:00` | `Closed · opens 9:00am` | [ ] |
| `פתוח עכשיו` | `Open now` | [ ] |
| `נסגר בקרוב · 22:00` | `Closing soon · 10pm` | [ ] |

**Check**:
- [ ] All variants display correctly
- [ ] Times (HH:mm) stable in RTL
- [ ] Text doesn't overflow

---

## Browser Compatibility

Test in multiple browsers:

- [ ] **Chrome** (latest): Layout correct
- [ ] **Firefox** (latest): Layout correct
- [ ] **Safari** (iOS/macOS): Layout correct
- [ ] **Edge** (latest): Layout correct

---

## Responsive Breakpoints

Test at various widths:

| Width | Device | Expected Behavior |
|-------|--------|-------------------|
| **1920px** | Desktop | Status far right, plenty of space |
| **1024px** | Tablet landscape | Status still visible |
| **768px** | Tablet portrait | Mobile styles kick in |
| **375px** | iPhone SE | Tighter spacing (0.5rem) |
| **320px** | iPhone 5 | May wrap, but readable |

---

## Performance Check

**Before/After Render Performance**:
```javascript
// In DevTools > Performance
// Record page load and scroll through 20 cards

// Expected: No regression, similar FPS
```

**Check**:
- [ ] No layout thrashing
- [ ] Smooth scrolling maintained
- [ ] No CLS (Cumulative Layout Shift)

---

## DevTools Verification

### Inspect Element

**Select a `.restaurant-name-row` element**:

Expected computed styles:
```css
.restaurant-name-row {
  display: flex;
  align-items: baseline;
  gap: 12px; /* 0.75rem */
  flex-wrap: nowrap;
  min-width: 0px;
}
```

**Select a `.status-line` element**:

Expected computed styles:
```css
.status-line {
  font-size: 13px; /* 0.8125rem */
  font-weight: 500;
  line-height: 1.35;
  white-space: nowrap;
  flex-shrink: 0;
  color: #059669; /* if open */
}
```

---

## Known Edge Cases

### 1. **Very Long Status Text**
- Status like "פתוח כעת · נסגר בעוד 2 שעות ו-30 דקות"
- **Expected**: Status stays visible, name truncates
- **Check**: [ ] Works correctly

### 2. **RTL + LTR Mixed Content**
- Restaurant name in English, UI in Hebrew
- **Expected**: Direction respects UI language
- **Check**: [ ] Layout correct

### 3. **Compact Mode (Mobile Panel)**
- Smaller photos (64px), tighter padding
- **Expected**: Status still fits, readable
- **Check**: [ ] Works correctly

---

## Regression Checks

Ensure existing features still work:

- [ ] **Photo loading**: Lazy loading works
- [ ] **Actions**: Call/Directions/Wolt buttons functional
- [ ] **Hover states**: Card hover effect present
- [ ] **Selection**: Selected state border visible
- [ ] **Top result**: Blue border for #1 result
- [ ] **Distance/ETA**: Still displayed correctly
- [ ] **Near You badge**: Still visible when applicable

---

## Sign-Off Checklist

Before marking as complete:

- [ ] Tested in Hebrew (RTL)
- [ ] Tested in English (LTR)
- [ ] Tested on desktop (1920px, 1024px)
- [ ] Tested on mobile (768px, 375px)
- [ ] Verified status colors (open/closed/neutral)
- [ ] Verified truncation behavior
- [ ] Verified card height reduction
- [ ] No console errors
- [ ] No layout regressions
- [ ] Accessibility maintained

---

## Screenshot Locations

Take screenshots for documentation:

1. **Before**: (Find old screenshot or mock one up)
   - RTL card with separate status row

2. **After - RTL**:
   - Desktop view (1920px)
   - Mobile view (375px)
   - Long name truncation

3. **After - LTR**:
   - Desktop view (1920px)
   - Mobile view (375px)

---

## Rollback Plan (If Issues Found)

If critical issues discovered:

```bash
# Revert HTML changes
git checkout HEAD -- llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.html

# Revert SCSS changes
git checkout HEAD -- llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss
```

---

## Conclusion

This layout change is **purely presentational** with no logic changes. All existing functionality should work exactly as before, just with a more compact card design.

**Success Criteria**:
✅ Status inline with name  
✅ RTL/LTR support maintained  
✅ Card height reduced by ~16-20px  
✅ No wrapping/overlap issues  
✅ Mobile responsive  
✅ Zero regressions
