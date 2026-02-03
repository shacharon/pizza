# Restaurant Card UI - Visual Testing Guide

## Quick Visual Verification

### 1. Overall Card Appearance ✓

**What to look for:**
- [ ] Card feels more compact (less white space)
- [ ] Content is still readable and not cramped
- [ ] Card height is noticeably shorter (~20% less)
- [ ] Border and shadow remain subtle

**Expected:** Modern, tight layout with clear visual hierarchy

---

### 2. Image Section ✓

**What to look for:**
- [ ] Restaurant photo is **80x80px** (smaller than before)
- [ ] Image is **square** with soft rounded corners (8px)
- [ ] Image doesn't look distorted or stretched
- [ ] Placeholder emoji (🍽️) is properly centered
- [ ] Gap between image and text is tighter (~14px)

**Expected:** Compact square image on the left, proportional to content

---

### 3. Restaurant Name ✓

**What to look for:**
- [ ] Name is the **most prominent** text on card
- [ ] Font size around 17px (1.0625rem)
- [ ] Bold weight (600)
- [ ] Doesn't overflow (max 2 lines with ellipsis)
- [ ] Tight letter spacing

**Expected:** Clear, prominent name that stands out

---

### 4. Rating & Meta Info ✓

**What to look for:**
- [ ] Rating number (e.g., "4.5") is **bold** (700 weight)
- [ ] Rating number is slightly larger than count
- [ ] Rating count (e.g., "(250)") is lighter gray
- [ ] Price level ("$$") is visible and bold
- [ ] Open status ("Open now") is small and bold
- [ ] Elements separated by clean spacing (~10px gaps)

**Expected:** Clear hierarchy - rating number stands out, supporting info de-emphasized

---

### 5. Address Line ✓

**What to look for:**
- [ ] Address text is **darker gray** than before (#4b5563)
- [ ] Better contrast against background
- [ ] Smaller font size (0.8125rem / ~13px)
- [ ] Single line with ellipsis if too long
- [ ] Positioned below meta info with small gap

**Expected:** Readable address with improved contrast

---

### 6. Action Bar (Most Changed!) ✓

**What to look for:**
- [ ] Action bar is **shorter** (less vertical padding)
- [ ] Action bar background is **lighter/transparent**
- [ ] Two **pill-shaped buttons** with gap between them
- [ ] Buttons have rounded corners (20px border-radius)
- [ ] Buttons have light gray background (#f9fafb)
- [ ] Buttons have subtle border
- [ ] Icon and label are **side-by-side** (horizontal)
- [ ] Icons are modern and clean

**Expected:** Compact pill buttons at bottom, separated by gap, lighter feel

---

### 7. Navigation Icon ✓

**What to look for:**
- [ ] Icon is a **clean arrow/send shape** (not pin/location)
- [ ] Icon is 18x18px
- [ ] Icon has stroke style (not filled)
- [ ] Icon has rounded line caps
- [ ] Icon scales slightly on hover

**Expected:** Modern navigation arrow pointing up-right

---

### 8. Call Icon ✓

**What to look for:**
- [ ] Icon is a **solid phone** (filled, not outlined)
- [ ] Icon resembles classic phone handset
- [ ] Icon is 18x18px
- [ ] Icon is filled with current color
- [ ] Icon scales slightly on hover

**Expected:** Solid phone icon, clearly recognizable

---

### 9. Spacing Analysis ✓

**Measure these gaps visually:**

**Before → After**
- Card padding: 20px → 14px (top/bottom)
- Image to text: 18px → 14px
- Name to meta: 8px → 6px
- Meta to address: 8px → 6px
- Action bar padding: 14px → 10px (vertical)

**Expected:** Consistent reduction of 20-30% in all vertical spacing

---

### 10. Action Button States ✓

**Test these interactions:**

**Hover:**
- [ ] Button background darkens slightly
- [ ] Border becomes more visible
- [ ] Icon scales up ~8%
- [ ] Transition is smooth

**Active (Click):**
- [ ] Button background gets darker
- [ ] Button scales down slightly (0.98)
- [ ] Returns to normal after release

**Disabled:**
- [ ] Button opacity reduced to 35%
- [ ] Cursor shows "not-allowed"
- [ ] No hover effects

**Expected:** Smooth, subtle feedback for all states

---

## Device-Specific Testing

### Desktop (Default)
- [ ] Card padding: ~14px vertical
- [ ] Image: 80x80px
- [ ] Action buttons readable and clickable
- [ ] All text visible and hierarchical

### Mobile (≤768px)
- [ ] Card padding: ~12px vertical
- [ ] Image: 72x72px
- [ ] Action buttons remain thumb-friendly
- [ ] Text scales appropriately

### Tablet (768px-1024px)
- [ ] Layout between desktop and mobile
- [ ] All elements proportional
- [ ] No awkward breakpoints

---

## Color Verification

### Text Colors
- [ ] Name: `#111827` (very dark)
- [ ] Rating value: `#111827` (very dark)
- [ ] Rating count: `#9ca3af` (light gray)
- [ ] Meta: `#6b7280` (medium gray)
- [ ] Address: `#4b5563` (dark gray - improved!)
- [ ] Action labels: `#374151` (dark gray)

### Background Colors
- [ ] Card: `#ffffff` (white)
- [ ] Action buttons: `#f9fafb` (very light gray)
- [ ] Button hover: `#f3f4f6` (light gray)
- [ ] Button active: `#e5e7eb` (medium light gray)

---

## Typography Scale Verification

### Font Sizes (Hierarchy)
```
Restaurant Name:    1.0625rem (17px)  ← LARGEST
─────────────────────────────────────
Rating Value:       0.875rem  (14px)
Price Level:        0.875rem  (14px)
─────────────────────────────────────
Address:            0.8125rem (13px)
Meta:               0.8125rem (13px)
Action Labels:      0.8125rem (13px)
Rating Count:       0.8125rem (13px)
─────────────────────────────────────
Open Status:        0.75rem   (12px)  ← SMALLEST
```

**Expected:** Clear size progression from name (largest) to status (smallest)

---

## Common Visual Issues to Check

### ❌ Issues to Watch For:

1. **Text Overflow**
   - Long restaurant names should truncate with "..."
   - Address should truncate if too long
   - No horizontal scrolling

2. **Image Distortion**
   - Images should not be stretched
   - Images should maintain aspect ratio
   - Square shape should be consistent

3. **Action Button Overlap**
   - Buttons should have clear gap (0.5rem)
   - Buttons should not touch each other
   - Both buttons should be same width

4. **Spacing Inconsistency**
   - All cards should have same spacing
   - Gaps should be consistent across cards
   - Alignment should be perfect

5. **Icon Rendering**
   - Icons should be sharp (not blurry)
   - Icons should scale smoothly
   - Icons should be centered in buttons

---

## Comparison Checklist

### Side-by-Side Testing

If you have before/after screenshots:

**Height:**
- [ ] After is ~20% shorter than before ✓

**Action Bar:**
- [ ] Before: Full-width bar, vertical layout
- [ ] After: Pill buttons, horizontal layout ✓

**Icons:**
- [ ] Before: Location pin, outlined phone
- [ ] After: Arrow, solid phone ✓

**Image:**
- [ ] Before: 96px
- [ ] After: 80px ✓

**Spacing:**
- [ ] Before: Generous gaps
- [ ] After: Tight but not cramped ✓

---

## Acceptance Criteria

### Must Pass (Critical)
- ✅ Card height reduced by 15-25%
- ✅ Action buttons are pill-shaped
- ✅ Icons are modern and clear
- ✅ Typography hierarchy is obvious
- ✅ All content still visible
- ✅ No text truncation issues

### Should Pass (Important)
- ✅ Spacing feels tight but comfortable
- ✅ Action buttons remain thumb-friendly
- ✅ Images maintain quality
- ✅ Hover states smooth
- ✅ Mobile layout responsive

### Nice to Have (Enhancement)
- ✅ Animations feel polished
- ✅ Colors match design system
- ✅ Accessibility maintained

---

## Quick Test Script

**5-Minute Visual Test:**

1. Load app with restaurant results ✓
2. Inspect first 3 cards in list ✓
3. Check card height (shorter?) ✓
4. Check action buttons (pills?) ✓
5. Check icons (modern?) ✓
6. Hover over buttons (smooth?) ✓
7. Click actions (working?) ✓
8. Test on mobile (responsive?) ✓

**Pass if:** All 8 checks pass ✅

---

## Known Good States

### Expected Dimensions (Desktop)
```
Card total height:       ~165-175px (down from ~200-210px)
Card padding:            14px vertical, 16px horizontal
Image:                   80x80px
Action bar height:       ~50px (down from ~70px)
Action button height:    ~40px
Icon size:               18x18px
```

### Expected Dimensions (Mobile)
```
Card total height:       ~150-160px (down from ~180-190px)
Card padding:            12px vertical, 14px horizontal
Image:                   72x72px
Action bar height:       ~45px
Action button height:    ~35px
Icon size:               16x16px
```

---

## Sign-Off

After completing visual testing:

- [ ] All visual elements verified ✓
- [ ] No regressions found ✓
- [ ] Card feels modern and compact ✓
- [ ] Action buttons improved ✓
- [ ] Icons updated successfully ✓
- [ ] Typography hierarchy clear ✓
- [ ] Spacing optimized ✓
- [ ] Mobile responsive ✓

**Tester:** _________________  
**Date:** _________________  
**Status:** ☐ Pass ☐ Fail  
**Notes:** _________________

---

**Last Updated:** 2026-02-03
