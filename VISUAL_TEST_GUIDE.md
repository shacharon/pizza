# Visual Test Guide - RTL/Status Bug Fixes

## Quick Verification Steps

### Test 1: Status i18n in Hebrew

**Setup:**
1. Open browser dev tools
2. Set browser language to Hebrew (or use language selector in app)
3. Search for restaurants

**Expected Results:**
```
✅ Open restaurant shows: "פתוח עכשיו" (NOT "Open now")
✅ Closed restaurant shows: "סגור" (NOT "Closed")
```

**If you see English text in Hebrew UI:**
- Check: `console.log` in browser for i18n service initialization
- Check: Browser language settings (should be Hebrew)
- Try: Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### Test 2: Distance/ETA in RTL (Hebrew)

**Setup:**
1. Enable location
2. Search for nearby restaurants in Hebrew

**Expected Visual Format:**
```
📍 500 מ׳   🚶‍♂️ 6 דק׳
     ↑ space    ↑ space (not ·)

Order must be:
1. 📍 (pin icon)
2. 500 מ׳ (distance with Hebrew unit)
3. 🚶‍♂️ (walking icon)
4. 6 דק׳ (time with Hebrew unit)
```

**WRONG (should not see):**
```
❌ דק׳ 6 🚶‍♂️ · מ׳ 500 📍    (reversed order)
❌ 📍 500 מ׳ · 🚶‍♂️ 6 דק׳    (has · separator)
```

### Test 3: Distance/ETA in RTL (Arabic)

**Setup:**
1. Switch to Arabic language
2. Enable location
3. Search for restaurants

**Expected:**
```
✅ 📍 500 م   🚶‍♂️ 6 د
   (pin) (distance) (walk) (time)
```

**Check:**
- Icons stay on left (LTR order)
- Numbers don't flip
- Arabic units display correctly (م for meters, د for minutes)

### Test 4: Distance/ETA in LTR (English)

**Setup:**
1. Switch to English
2. Search for restaurants with location

**Expected:**
```
✅ 📍 500 m   🚶‍♂️ 6 min
   (unchanged from before - should still work)
```

## Screenshot Comparison Guide

### Before Fix (Problematic)

**Hebrew Card:**
```
┌─────────────────────────────────┐
│ שם המסעדה                        │
│ ⭐ 4.5 (120) · $$ · Closed  ❌  │ ← Shows "Closed" in English!
│ רחוב ראשי 123                    │
│ דק׳ 6 🚶‍♂️ · מ׳ 500 📍  ❌      │ ← Icons reversed, has ·
│                                 │
│ [נווט]     [התקשר]              │
└─────────────────────────────────┘
```

### After Fix (Correct)

**Hebrew Card:**
```
┌─────────────────────────────────┐
│ שם המסעדה                        │
│ ⭐ 4.5 (120) · $$ · סגור   ✅   │ ← Shows Hebrew "סגור"!
│ רחוב ראשי 123                    │
│ 📍 500 מ׳   🚶‍♂️ 6 דק׳   ✅     │ ← Correct order, clean spacing!
│                                 │
│ [נווט]     [התקשר]              │
└─────────────────────────────────┘
```

## Detailed Test Matrix

| UI Lang | Status Text | Distance Format | Order | Spacing |
|---------|-------------|-----------------|-------|---------|
| 🇮🇱 Hebrew | סגור / פתוח עכשיו | 500 מ׳, 1.2 ק״מ | LTR (📍→🚶) | Clean (no ·) |
| 🇸🇦 Arabic | مغلق / مفتوح الآن | 500 م, 1.2 كم | LTR (📍→🚶) | Clean (no ·) |
| 🇬🇧 English | Closed / Open now | 500 m, 1.2 km | LTR (📍→🚶) | Clean (no ·) |
| 🇷🇺 Russian | Закрыто / Открыто | 500 м, 1.2 км | LTR (📍→🚶) | Clean (no ·) |
| 🇫🇷 French | Fermé / Ouvert | 500 m, 1.2 km | LTR (📍→🚶) | Clean (no ·) |
| 🇪🇸 Spanish | Cerrado / Abierto | 500 m, 1.2 km | LTR (📍→🚶) | Clean (no ·) |

## Common Issues & Solutions

### Issue: Still seeing "Closed" in Hebrew

**Diagnosis:**
```javascript
// Open browser console and check:
console.log('Current lang:', window.navigator.language);
// Should show: "he" or "he-IL"
```

**Solution:**
1. Check browser language: Settings → Languages → Hebrew should be first
2. Hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
3. Clear cache: Dev Tools → Network → Disable cache
4. Check for language selector in app and manually switch

### Issue: Distance icons still reversed

**Diagnosis:**
- Check if new CSS is loaded
- Inspect element to verify `.distance-eta` has `unicode-bidi: isolate`

**Solution:**
```bash
# Rebuild Angular app
cd llm-angular
npm run build
# or for dev server
ng serve --force
```

### Issue: No spacing between distance and ETA

**Diagnosis:**
- Browser doesn't support `gap` property
- Fallback: items will touch but order will be correct

**Solution (if needed):**
Add explicit margins as fallback:
```scss
.distance-value {
  margin-right: 0.375rem;
}
.eta-icon {
  margin-left: 0.375rem;
}
```

## Developer Console Checks

### Check i18n Service Language

```javascript
// In browser console
angular.getComponent($0).i18n.currentLang()
// Should return: "he" for Hebrew UI
```

### Check Distance/ETA Element

```javascript
// Select distance-eta element and check computed style
const elem = document.querySelector('.distance-eta');
const style = window.getComputedStyle(elem);

console.log('Direction:', style.direction);        // Should be: "ltr"
console.log('Unicode-bidi:', style.unicodeBidi);   // Should be: "isolate"
console.log('Display:', style.display);            // Should be: "inline-flex"
console.log('Gap:', style.gap);                    // Should be: "6px" (0.375rem)
```

### Check Status Text

```javascript
// Find open-status element
const statusElem = document.querySelector('.open-status');
console.log('Status text:', statusElem.textContent);
// Hebrew closed: "סגור"
// Hebrew open: "פתוח עכשיו"
```

## Manual Test Scenarios

### Scenario 1: Restaurant Search in Hebrew

1. Set browser to Hebrew
2. Navigate to search page
3. Type: "פיצה"
4. Enable location
5. Submit search
6. **Verify**: First card shows "סגור" or "פתוח עכשיו" (NOT English)
7. **Verify**: Distance shows `📍 500 מ׳   🚶‍♂️ 6 דק׳`

### Scenario 2: Distance Updates

1. Search for restaurants
2. Move location (change user location)
3. **Verify**: Distance numbers update
4. **Verify**: Icons stay in same position (don't flip)
5. **Verify**: Order remains: 📍 → distance → 🚶 → time

### Scenario 3: Language Switch

1. Start in English
2. Search for restaurants
3. **Verify**: Shows "Closed" or "Open now"
4. Switch to Hebrew
5. **Verify**: Text changes to "סגור" or "פתוח עכשיו"
6. **Verify**: Distance line order doesn't change

### Scenario 4: RTL Container Verification

1. In Hebrew UI, inspect the card element
2. **Verify**: `.restaurant-card` has `direction: rtl` (or inherits from parent)
3. **Verify**: `.restaurant-info` is RTL
4. **Verify**: `.distance-eta` is isolated LTR
5. **Verify**: Card layout flows right-to-left except distance line

## Expected Console Output

With fixes applied, you should see:

```
[LanguageService] Language set to: he (rtl)
[I18nService] UI language set to: he
[RestaurantCard] Rendering with language: he
[RestaurantCard] Status label: סגור
[RestaurantCard] Distance: 500 מ׳, ETA: 6 דק׳
```

If you see:
```
[I18nService] Missing translation for key "card.status.closed" in language "he", using English fallback
```
This indicates a bug - but our code doesn't have this issue.

## Success Criteria

✅ **All tests pass when:**
1. Hebrew UI shows Hebrew status text ("סגור" / "פתוח עכשיו")
2. Arabic UI shows Arabic status text ("مغلق" / "مفتوح الآن")
3. Distance line is always LTR: 📍 → distance → 🚶 → time
4. No `·` separator visible (clean spacing)
5. Icons never reverse order
6. Works in he, ar, en, ru, fr, es, de, it
7. No console errors
8. Card stays RTL while distance line is LTR

## Quick Debug Commands

```bash
# Check if Angular app compiled correctly
npm run build

# Force rebuild
rm -rf dist/ && npm run build

# Check for TypeScript errors
npm run lint

# Run unit tests
npm test

# Start dev server with force flag
ng serve --force --open
```

## Performance Check

**Verify no performance degradation:**
1. Open Performance tab in Chrome DevTools
2. Record page load
3. Check "Rendering" time
4. **Expected**: No increase in render time (<1ms difference)

The flexbox + isolate changes should have zero performance impact.
