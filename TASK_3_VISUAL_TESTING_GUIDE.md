# Visual Testing Guide — Single-Line Status

## Quick Reference: Where to Look

### 📍 Location in Card

```
┌─────────────────────────────────────┐
│ [Photo] Restaurant Name         [GF]│
│         ⭐ 4.5 (123)  $$            │ ← Status REMOVED from meta
│         123 Main St, Tel Aviv       │
│         [STATUS LINE APPEARS HERE]  │ ← 🎯 NEW: Single status + hours line
│         📍 500m  Near you           │ ← "Open until" REMOVED from enhanced info
├─────────────────────────────────────┤
│ Navigate │ Call │ Order on Wolt   │ ← Should NOT shift position
└─────────────────────────────────────┘
```

---

## Test Scenarios (Hebrew)

### Scenario 1: Open Restaurant with Close Time

**Input Data:**

```json
{
  "openNow": true,
  "currentOpeningHours": {
    "nextCloseTime": "2024-03-15T23:00:00Z"
  }
}
```

**Expected Display:**

```
פתוח עכשיו · עד 23:00
```

**Visual Check:**

- ✅ Text color: `#059669` (emerald green)
- ✅ Font size: 13px
- ✅ Position: Between address and enhanced info
- ✅ RTL: Text flows right-to-left
- ✅ Time format: "23:00" (not reversed)

---

### Scenario 2: Closed Restaurant with Next Opening

**Input Data:**

```json
{
  "openNow": false,
  "regularOpeningHours": {
    "periods": [{ "open": { "day": 1, "time": "0800" } }]
  }
}
```

**Expected Display:**

```
סגור · נפתח ב־08:00
```

**Visual Check:**

- ✅ Text color: `#6b7280` (gray-500)
- ✅ Font size: 13px
- ✅ "ב־" (with maqaf) before time
- ✅ RTL alignment

---

### Scenario 3: Closed with Hours Range Only

**Input Data:**

```json
{
  "openNow": false,
  "regularOpeningHours": {
    "periods": [
      {
        "open": { "day": 1, "time": "0800" },
        "close": { "day": 1, "time": "2300" }
      }
    ]
  }
}
```

**Expected Display:**

```
סגור · שעות: 08:00–23:00
```

**Visual Check:**

- ✅ Text color: `#6b7280` (gray)
- ✅ En dash (–) between times
- ✅ RTL alignment

---

### Scenario 4: Open (No Close Time)

**Input Data:**

```json
{
  "openNow": true
}
```

**Expected Display:**

```
פתוח עכשיו
```

**Visual Check:**

- ✅ Text color: `#059669` (green)
- ✅ No extra punctuation
- ✅ RTL alignment

---

### Scenario 5: Closed (No Additional Info)

**Input Data:**

```json
{
  "openNow": false
}
```

**Expected Display:**

```
סגור
```

**Visual Check:**

- ✅ Text color: `#6b7280` (gray)
- ✅ Simple, one word

---

### Scenario 6: Unknown Status

**Input Data:**

```json
{
  "openNow": "UNKNOWN"
}
```

**Expected Display:**

```
שעות לא מאומתות
```

**Visual Check:**

- ✅ Text color: `#9ca3af` (light gray)
- ✅ Font style: italic
- ✅ Opacity: 0.9

---

## Test Scenarios (English)

### Scenario 1: Open with Close Time

**Expected Display:**

```
Open now · until 23:00
```

**Visual Check:**

- ✅ Color: emerald green
- ✅ LTR alignment
- ✅ Middot separator (·)

---

### Scenario 2: Closed with Next Opening

**Expected Display:**

```
Closed · opens at 08:00
```

**Visual Check:**

- ✅ Color: gray-500
- ✅ LTR alignment
- ✅ "opens at" phrasing

---

### Scenario 3: Closed with Hours Range

**Expected Display:**

```
Closed · hours: 08:00–23:00
```

**Visual Check:**

- ✅ Color: gray
- ✅ En dash between times

---

### Scenario 4: Unknown

**Expected Display:**

```
Hours unverified
```

**Visual Check:**

- ✅ Color: light gray
- ✅ Italic style

---

## Layout Regression Checks

### Check 1: Card Height (Critical)

**Before (Baseline):**

- Measure total card height with DevTools
- Record pixel value (e.g., 148px)

**After (With Changes):**

- Measure total card height again
- Compare to baseline

**Acceptance:**

- ✅ Difference ≤ 5px (±5px tolerance)
- ✅ Ideally: exact same height or shorter

**How to Measure:**

1. Open Chrome DevTools
2. Inspect `.restaurant-card` element
3. Check computed height in Layout tab
4. Screenshot with height overlay

---

### Check 2: Action Bar Position (Critical)

**Before:**

- Measure Y position of `.action-bar` from top of viewport
- Record pixel value (e.g., Y = 148px)

**After:**

- Measure Y position of `.action-bar` again
- Compare to baseline

**Acceptance:**

- ✅ Exact same Y position
- ❌ Any shift indicates layout jump

**How to Measure:**

1. Open DevTools
2. Hover over `.action-bar`
3. Check Y position in overlay tooltip
4. Or use: `document.querySelector('.action-bar').getBoundingClientRect().top`

---

### Check 3: Spacing Between Elements

**Expected Gaps:**

- Name → Meta: ~5px (0.3125rem)
- Meta → Address: ~5px
- Address → Status Line: ~5px
- Status Line → Enhanced Info: ~5px

**How to Check:**

1. Inspect `.restaurant-info` element
2. Verify computed gap: 5px (0.3125rem)
3. Visual inspection: elements should feel tight but not cramped

---

### Check 4: Meta Section Cleanup

**Before:**

```
⭐ 4.5 (123)  $$  Open now
```

**After:**

```
⭐ 4.5 (123)  $$
```

**Acceptance:**

- ✅ Status badge removed
- ✅ Only rating and price remain
- ✅ Proper spacing maintained

---

### Check 5: Enhanced Info Cleanup

**Before:**

```
📍 500m  🚶‍♂️ 15 min  Near you  Open until 23:00
```

**After:**

```
📍 500m  🚶‍♂️ 15 min  Near you
```

**Acceptance:**

- ✅ "Open until" removed
- ✅ Distance and ETA still display
- ✅ Near badge still shows (if applicable)

---

## Browser-Specific Checks

### Chrome (Desktop)

- ✅ Font rendering crisp
- ✅ Color accuracy
- ✅ Layout stable

### Firefox (Desktop)

- ✅ Unicode characters (·, –) render correctly
- ✅ RTL directionality works
- ✅ Italic styling on neutral tone

### Safari (Desktop)

- ✅ Font weight renders correctly (500)
- ✅ Color consistency
- ✅ RTL support

### Mobile Safari (iOS)

- ✅ Touch targets adequate
- ✅ Font size readable (13px)
- ✅ No text wrapping issues

### Chrome Mobile (Android)

- ✅ Responsive design intact
- ✅ Font rendering clear
- ✅ RTL support on RTL devices

---

## Screenshot Comparison Template

### Desktop View (1920×1080)

**Before:**

```
┌─────────────────────────────────────┐
│ [Photo] Pizza Place            [GF] │ ← 14px padding
│         ⭐ 4.5 (89)  $$  Open now   │
│         123 Rothschild, Tel Aviv    │
│         📍 450m  Near you  עד 23:00 │
│                                      │ ← 14px padding
├─────────────────────────────────────┤
│  Navigate  │   Call   │ Order Wolt │
└─────────────────────────────────────┘
Height: 148px
```

**After:**

```
┌─────────────────────────────────────┐
│ [Photo] Pizza Place            [GF] │ ← 10px padding
│         ⭐ 4.5 (89)  $$            │
│         123 Rothschild, Tel Aviv    │
│         פתוח עכשיו · עד 23:00      │ ← NEW LINE
│         📍 450m  Near you           │ ← 10px padding
├─────────────────────────────────────┤
│  Navigate  │   Call   │ Order Wolt │
└─────────────────────────────────────┘
Height: 148px (SAME)
```

---

### Mobile View (375×667)

**Before:**

```
┌───────────────────────────┐
│ [Photo] Pizza Place   [GF]│ ← 12px
│         ⭐ 4.5  $$  Open │
│         123 Rothschild    │
│         📍 450m  עד 23:00│ ← 12px
├───────────────────────────┤
│ Navigate │ Call │ Order  │
└───────────────────────────┘
```

**After:**

```
┌───────────────────────────┐
│ [Photo] Pizza Place   [GF]│ ← 9px
│         ⭐ 4.5  $$       │
│         123 Rothschild    │
│         פתוח עד 23:00    │ ← NEW
│         📍 450m          │ ← 9px
├───────────────────────────┤
│ Navigate │ Call │ Order  │
└───────────────────────────┘
```

---

## RTL-Specific Visual Checks

### Hebrew (he)

**Status Line Alignment:**

```
Right ←                     → Left
─────────────────────────────────
        00:23 דע · ויזכשע חותפ
─────────────────────────────────
```

**Checks:**

- ✅ Text flows right-to-left
- ✅ Time stays "23:00" (not "00:32")
- ✅ Middot (·) appears between status and time
- ✅ Proper spacing around separator

---

### Arabic (ar)

**Expected Display:**

```
مفتوح الآن · حتى 23:00
```

**Checks:**

- ✅ RTL directionality
- ✅ Arabic text renders correctly
- ✅ Time format stable
- ✅ Middot separator visible

---

## Accessibility Overlay Check

### Screen Reader Test

**VoiceOver (macOS/iOS):**

1. Enable VoiceOver (Cmd+F5)
2. Navigate to restaurant card
3. Listen for status line announcement

**Expected Announcements:**

- Hebrew: "פתוח עכשיו עד עשרים ושלוש אפס אפס"
- English: "Open now until twenty-three zero zero"

**NVDA (Windows):**

- Same test as VoiceOver
- Verify aria-label is read correctly

---

## Performance Snapshot

### DOM Node Count

**Before:**

```html
<div class="restaurant-meta">
  <span class="rating">...</span>
  <span class="price-level">...</span>
  <span class="open-status">Open now</span> ← Node 1
</div>
...
<div class="restaurant-enhanced-info">
  <span class="distance-eta">...</span>
  <span class="open-until">Open until 23:00</span> ← Node 2
</div>
```

**Total:** 2 nodes for status/hours

**After:**

```html
<div class="status-line">פתוח עכשיו · עד 23:00</div>
← Single node
```

**Total:** 1 node

**Reduction:** 50% fewer DOM nodes for status display

---

## Final Checklist

### Visual Checks

- [ ] Status line appears between address and enhanced info
- [ ] Font size is 13px (0.8125rem)
- [ ] Line-height is tight (1.2)
- [ ] No extra margins around status line
- [ ] Color correct: green for open, gray for closed
- [ ] RTL alignment works in Hebrew/Arabic

### Layout Checks

- [ ] Card height unchanged (±5px tolerance)
- [ ] Action bar position unchanged
- [ ] Padding reduced: desktop 10px, mobile 9px
- [ ] Gap reduced: 5px between info elements
- [ ] No overflow or clipping

### Functional Checks

- [ ] Open + closeTime → "פתוח עכשיו · עד {time}"
- [ ] Closed + nextOpenTime → "סגור · נפתח ב־{time}"
- [ ] Closed + hoursRange → "סגור · שעות: {range}"
- [ ] Open (no time) → "פתוח עכשיו"
- [ ] Closed (no info) → "סגור"
- [ ] Unknown → "שעות לא מאומתות" (italic)

### Cross-Browser Checks

- [ ] Chrome: Renders correctly
- [ ] Firefox: Renders correctly
- [ ] Safari: Renders correctly
- [ ] Mobile Safari: Responsive, readable
- [ ] Chrome Mobile: Responsive, readable

### Accessibility Checks

- [ ] aria-label present and correct
- [ ] Screen reader announces status
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Font size meets minimum (13px ≥ 12px)

### i18n Checks

- [ ] Hebrew: RTL, proper punctuation
- [ ] English: LTR, proper phrasing
- [ ] Russian: Cyrillic renders
- [ ] Arabic: RTL, Arabic script
- [ ] French: Accents render
- [ ] Spanish: ñ, accents render
- [ ] German: Umlauts render
- [ ] Italian: Accents render

---

## Sign-Off

**Tester:** ******\_\_\_******  
**Date:** ******\_\_\_******  
**Build:** ******\_\_\_******

**Status:**

- [ ] ✅ Approved — Ready for production
- [ ] ⚠️ Minor issues — Approved with notes
- [ ] ❌ Rejected — Requires fixes

**Notes:**

---

---

---
