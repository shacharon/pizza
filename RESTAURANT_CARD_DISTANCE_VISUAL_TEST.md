# Restaurant Card Distance Display - Visual Testing Guide

**Date**: 2026-02-03  
**Task**: Verify distance restored to rating/price row (right side)

---

## Quick Verification Steps

### 1. Open the App
```bash
cd llm-angular
npm start
```

Navigate to a search results page with restaurants that have location data.

---

## Visual Checks

### ✅ Check 1: Distance Position (RTL - Hebrew)

**Test**: Search for "פיצה" with location enabled

**Expected Layout**:
```
┌────────────────────────────────────────────┐
│ 🍽️  שם המסעדה          פתוח עד 23:30      │
│     ★ 4.5 (123) · $$              500m ממך │ ← Distance here!
│     רחוב ראשי 123                          │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Distance appears on **Row 2** (with rating/price)
- [ ] Distance is on the **far right** of Row 2
- [ ] Format: `[number]m ממך` or `[number]km ממך`
- [ ] No icons (removed 📍 and 🚶‍♂️)
- [ ] No ETA time (removed "6 דקות")

---

### ✅ Check 2: Distance Position (LTR - English)

**Test**: Switch UI to English, search with location

**Expected Layout**:
```
┌────────────────────────────────────────────┐
│ 🍽️  Restaurant Name        Open until 11pm │
│     ★ 4.5 (123) · $$                500m away │ ← Distance here!
│     123 Main Street                        │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Distance on Row 2 (far right)
- [ ] Format: `[number]m away` or `[number]km away`
- [ ] Clean, simple text (no icons)

---

### ✅ Check 3: Row 2 Layout - Left/Right Split

**Visual Breakdown**:
```
┌────────────────────────────────────────────┐
│ [LEFT SIDE ←→→→→→→→→→→→ RIGHT SIDE→]        │
│ ★ 4.5 (123) · $$              500m ממך     │
│ ↑ meta-left      ↑ space-between  ↑ distance
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Left side: Rating + Price grouped together
- [ ] Right side: Distance standalone
- [ ] Space between them adjusts dynamically
- [ ] No overlap between left and right content

---

### ✅ Check 4: Distance Text Styling

**Expected Appearance**:
- **Color**: Gray (#6b7280) - same as address
- **Font Size**: 12px (0.75rem) on desktop
- **Font Weight**: 500 (medium)
- **Style**: Simple text, no bold, no background

**Check**:
- [ ] Text is **muted gray** (not too prominent)
- [ ] Smaller than restaurant name
- [ ] Same visual weight as address
- [ ] Readable but not attention-grabbing

---

### ✅ Check 5: Mobile View (375px width)

**Test**: Resize browser to mobile width

**Expected**:
```
┌─────────────────────────┐
│ 🍽️  Name  פתוח 23:30    │
│     ★4.5 · $$  500m ממך │ ← Tighter, smaller
│     רחוב ראשי           │
└─────────────────────────┘
```

**Check**:
- [ ] Distance font is **smaller** on mobile (11px)
- [ ] Still visible and readable
- [ ] Maintains left/right split
- [ ] No horizontal scroll
- [ ] No wrapping of distance text

---

### ✅ Check 6: Missing Distance Data

**Test**: Find a restaurant without location data (or disable location)

**Expected**:
```
┌────────────────────────────────────────────┐
│ 🍽️  שם המסעדה          פתוח עד 23:30      │
│     ★ 4.5 (123) · $$                       │ ← No distance
│     רחוב ראשי 123                          │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Row 2 shows only rating + price
- [ ] No empty space on the right
- [ ] Layout looks normal (not broken)
- [ ] No console errors

---

### ✅ Check 7: Various Distance Values

Test different distance ranges:

| Distance | Expected Display (Hebrew) | Check |
|----------|--------------------------|-------|
| 50m | `50m ממך` | [ ] |
| 500m | `500m ממך` | [ ] |
| 1.2km | `1.2km ממך` | [ ] |
| 5km | `5km ממך` | [ ] |

**Check**:
- [ ] All formats display correctly
- [ ] Numbers are LTR (not reversed)
- [ ] Hebrew text "ממך" appears after number
- [ ] No layout issues with different lengths

---

### ✅ Check 8: Row Spacing - No Overlap

**Test with Long Restaurant Name**:
```
┌────────────────────────────────────────────┐
│ 🍽️  Very Long Restaurant Na... פתוח 23:30 │
│     ★ 4.5 (123456) · $$$        12.5km ממך │ ← Check spacing
│     Very Long Address String Here          │
└────────────────────────────────────────────┘
```

**Check**:
- [ ] Distance doesn't overlap with rating/price
- [ ] Adequate spacing between left and right
- [ ] Both sides readable
- [ ] No text clipping

---

### ✅ Check 9: Compare Card Height

**Before**: (No distance visible)
**After**: (Distance on Row 2)

**Measurement**:
```javascript
// In browser DevTools console
document.querySelector('.restaurant-card').offsetHeight
// Should be same as before (~120-130px)
```

**Check**:
- [ ] Card height **unchanged** (or minimal difference)
- [ ] No extra row added
- [ ] Compact appearance maintained

---

### ✅ Check 10: RTL/LTR Consistency

**RTL Test** (Hebrew UI):
```
Row 2: [500m ממך] ← space → [$$  ·  (123) 4.5 ★]
       Right side           Left side
```

**LTR Test** (English UI):
```
Row 2: [★ 4.5 (123) · $$] ← space → [500m away]
       Left side                     Right side
```

**Check**:
- [ ] Distance **always on visual right** in both directions
- [ ] Layout mirrors correctly
- [ ] No awkward spacing in either direction

---

## DevTools Inspection

### Check `.restaurant-meta` Element

**Expected Computed Styles**:
```css
.restaurant-meta {
  display: flex;
  justify-content: space-between; ✓ Key for left/right split
  align-items: center;
  flex-wrap: nowrap; ✓ No wrapping
  gap: 12px; /* 0.75rem */
}
```

### Check `.distance-text` Element

**Expected Computed Styles**:
```css
.distance-text {
  color: rgb(107, 114, 128); /* #6b7280 */
  font-size: 12px; /* 0.75rem desktop */
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0; ✓ Never shrinks
}
```

**Mobile (max-width: 768px)**:
```css
.distance-text {
  font-size: 11px; /* 0.6875rem */
}
```

---

## Regression Checks

Ensure other features still work:

- [ ] **Status line**: Still on Row 1 (right side)
- [ ] **Photo loading**: Works correctly
- [ ] **Actions**: Call/Directions/Wolt buttons functional
- [ ] **Hover states**: Card hover effect present
- [ ] **Selection**: Selected state border visible
- [ ] **Gluten-free badge**: Still visible if applicable

---

## Browser Compatibility

Test in multiple browsers:

- [ ] **Chrome** (latest): Distance displays correctly
- [ ] **Firefox** (latest): Layout correct
- [ ] **Safari** (iOS/macOS): No issues
- [ ] **Edge** (latest): Works as expected

---

## Performance Check

**Before/After Comparison**:
- Card render time should be **unchanged**
- No new console warnings
- Smooth scrolling maintained

---

## Acceptance Criteria

Before marking complete, verify:

- [ ] ✅ Distance visible on Row 2 (rating/price row)
- [ ] ✅ Distance on **right side** of Row 2
- [ ] ✅ Format: Simple text (no icons, no ETA)
- [ ] ✅ RTL/LTR both work correctly
- [ ] ✅ Mobile responsive (smaller font)
- [ ] ✅ Card height unchanged
- [ ] ✅ No overlap with other elements
- [ ] ✅ No console errors
- [ ] ✅ No layout regressions

---

## Known Issues (If Any)

Document any edge cases discovered during testing:

1. **Issue**: [Description]
   - **Impact**: [Severity]
   - **Workaround**: [If available]

---

## Sign-Off

Testing completed by: _____________  
Date: _____________  
Status: ✅ PASS / ❌ FAIL

---

## Screenshots for Documentation

Take screenshots:

1. **RTL (Hebrew)**:
   - Desktop view (1920px)
   - Mobile view (375px)
   - With/without distance data

2. **LTR (English)**:
   - Desktop view
   - Mobile view

3. **Edge Cases**:
   - Long restaurant name + distance
   - Very large distance (10+ km)
   - Missing distance data

---

## Rollback Plan (If Issues)

If critical issues discovered:

```bash
# Revert HTML changes
git checkout HEAD -- llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.html

# Revert SCSS changes
git checkout HEAD -- llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss
```

---

## Conclusion

This change restores the distance display in a **clean, compact format** on Row 2, maintaining the modern card design while providing important proximity information to users.

**Success Criteria**:
✅ Distance restored and visible  
✅ Positioned on right side of Row 2  
✅ RTL/LTR support maintained  
✅ Card height unchanged  
✅ Mobile responsive  
✅ Zero regressions
