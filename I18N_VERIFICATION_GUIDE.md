# I18n Verification Guide

## Quick Start Testing

### 1. Browser Console Testing

Open browser console and run these commands to switch languages:

```javascript
// Get the I18nService instance
const i18n = window.ng
  .getComponent(document.querySelector("app-root"))
  .injector.get("I18nService");

// Switch to Hebrew (RTL)
i18n.setLanguage("he");

// Switch to Russian
i18n.setLanguage("ru");

// Switch to Arabic (RTL)
i18n.setLanguage("ar");

// Switch to French
i18n.setLanguage("fr");

// Switch to Spanish
i18n.setLanguage("es");

// Switch to German
i18n.setLanguage("de");

// Switch to Italian
i18n.setLanguage("it");

// Switch back to English
i18n.setLanguage("en");
```

### 2. Manual Testing Checklist

For **each language** (he, en, ru, ar, fr, es, de, it):

#### A. Restaurant Card - Status Labels

- [ ] "Open now" displays in correct language
- [ ] "Closed" displays in correct language
- [ ] "Hours unverified" displays in correct language

#### B. Restaurant Card - Action Buttons

- [ ] "Navigate" button label in correct language
- [ ] "Call" button label in correct language
- [ ] "Get directions" tooltip in correct language
- [ ] "Call restaurant" tooltip in correct language
- [ ] "Location not available" tooltip (for restaurants without location)
- [ ] "Phone number not available" tooltip (for restaurants without phone)

#### C. Restaurant Card - Dietary Badges

- [ ] "GF" badge in correct language
- [ ] "Maybe GF" badge in correct language
- [ ] Gluten-free disclaimer tooltip in correct language

#### D. Reason Labels (Top Result)

- [ ] "Best match" in correct language
- [ ] "Open now" reason in correct language
- [ ] "Closest option" reason in correct language

#### E. Filter Chips

- [ ] "🟢 Open now" chip label in correct language
- [ ] "Open now" chip tooltip in correct language
- [ ] "Gluten-free (signals)" chip label in correct language
- [ ] "Gluten-free" chip tooltip in correct language

#### F. RTL Support (Hebrew & Arabic only)

- [ ] Text direction is RTL (right-to-left)
- [ ] HTML `dir` attribute is "rtl"
- [ ] HTML `lang` attribute is "he" or "ar"
- [ ] UI elements align to the right
- [ ] Icons and buttons maintain correct RTL layout

#### G. LTR Support (All other languages)

- [ ] Text direction is LTR (left-to-right)
- [ ] HTML `dir` attribute is "ltr"
- [ ] HTML `lang` attribute matches language code
- [ ] UI elements align to the left

---

## Automated Testing

### Run Unit Tests

```bash
cd llm-angular
npm test
```

### Expected Results

- All tests should pass ✅
- No console errors ✅
- I18nService properly injected ✅

---

## Language-Specific Test Cases

### Hebrew (he) - RTL

```typescript
i18n.setLanguage('he');

Expected:
- card.status.open → "פתוח עכשיו"
- card.action.navigate → "נווט"
- card.action.call → "התקשר"
- reason.best_match → "התאמה הטובה ביותר"
- filter.open_now → "🟢 פתוח עכשיו"
```

### English (en) - LTR (Default)

```typescript
i18n.setLanguage('en');

Expected:
- card.status.open → "Open now"
- card.action.navigate → "Navigate"
- card.action.call → "Call"
- reason.best_match → "Best match"
- filter.open_now → "🟢 Open now"
```

### Russian (ru) - LTR

```typescript
i18n.setLanguage('ru');

Expected:
- card.status.open → "Открыто сейчас"
- card.action.navigate → "Навигация"
- card.action.call → "Позвонить"
- reason.best_match → "Лучшее совпадение"
- filter.open_now → "🟢 Открыто сейчас"
```

### Arabic (ar) - RTL

```typescript
i18n.setLanguage('ar');

Expected:
- card.status.open → "مفتوح الآن"
- card.action.navigate → "التنقل"
- card.action.call → "اتصل"
- reason.best_match → "أفضل تطابق"
- filter.open_now → "🟢 مفتوح الآن"
```

### French (fr) - LTR

```typescript
i18n.setLanguage('fr');

Expected:
- card.status.open → "Ouvert maintenant"
- card.action.navigate → "Naviguer"
- card.action.call → "Appeler"
- reason.best_match → "Meilleure correspondance"
- filter.open_now → "🟢 Ouvert maintenant"
```

### Spanish (es) - LTR

```typescript
i18n.setLanguage('es');

Expected:
- card.status.open → "Abierto ahora"
- card.action.navigate → "Navegar"
- card.action.call → "Llamar"
- reason.best_match → "Mejor coincidencia"
- filter.open_now → "🟢 Abierto ahora"
```

### German (de) - LTR

```typescript
i18n.setLanguage('de');

Expected:
- card.status.open → "Jetzt geöffnet"
- card.action.navigate → "Navigieren"
- card.action.call → "Anrufen"
- reason.best_match → "Beste Übereinstimmung"
- filter.open_now → "🟢 Jetzt geöffnet"
```

### Italian (it) - LTR

```typescript
i18n.setLanguage('it');

Expected:
- card.status.open → "Aperto ora"
- card.action.navigate → "Naviga"
- card.action.call → "Chiama"
- reason.best_match → "Migliore corrispondenza"
- filter.open_now → "🟢 Aperto ora"
```

---

## Testing Fallback Behavior

### Test Missing Key Fallback

```typescript
// This should fall back to English
i18n.currentLang.set("fr");
const result = i18n.t("non.existent.key");
// Expected: 'non.existent.key' (key itself if not found in English)
```

---

## Visual Testing Checklist

### Restaurant Card Rendering

1. [ ] Open the app and perform a search
2. [ ] Verify restaurant cards display correctly
3. [ ] Switch language using console command
4. [ ] Verify all labels update immediately
5. [ ] Check hover tooltips are translated
6. [ ] Check aria-labels are translated (screen reader)

### RTL Layout Testing (Hebrew & Arabic)

1. [ ] Switch to Hebrew or Arabic
2. [ ] Verify HTML `dir="rtl"`
3. [ ] Verify content flows right-to-left
4. [ ] Verify action buttons maintain correct order
5. [ ] Verify icons don't flip (unless intentional)
6. [ ] Verify scrolling behavior is RTL-aware

### Filter Chips Testing

1. [ ] Perform search that triggers "Open now" filter
2. [ ] Verify chip label is translated
3. [ ] Hover over chip, verify tooltip is translated
4. [ ] Perform search with gluten-free hints
5. [ ] Verify "Gluten-free" chip label is translated
6. [ ] Hover over chip, verify disclaimer is translated

---

## Regression Testing

### No UI/Layout Changes

- [ ] Restaurant card layout unchanged
- [ ] Action button positions unchanged
- [ ] Filter chip layout unchanged
- [ ] No styling regressions
- [ ] No spacing issues
- [ ] No overflow issues

### No Functional Changes

- [ ] Search functionality works
- [ ] Action buttons trigger correctly
- [ ] Filter chips toggle correctly
- [ ] Navigation works
- [ ] Calling works (when phone available)

---

## Performance Testing

### Load Time

- [ ] Page load time unchanged
- [ ] I18n service initializes quickly
- [ ] No visible lag when switching languages

### Memory Usage

- [ ] Memory footprint acceptable (~15KB for all translations)
- [ ] No memory leaks when switching languages

---

## Edge Cases

### Browser Language Detection

1. [ ] Set browser language to Hebrew → App uses Hebrew
2. [ ] Set browser language to Russian → App uses Russian
3. [ ] Set browser language to unsupported (e.g., Japanese) → App uses English fallback

### Mixed Content

1. [ ] Restaurant names remain in original language (not translated)
2. [ ] Addresses remain in original language
3. [ ] Only UI labels are translated

### Dynamic Content

1. [ ] New search results update with current language
2. [ ] Filter chips update when language changes
3. [ ] Status labels update dynamically

---

## Known Limitations

1. **No server-side rendering:** Language must be set client-side
2. **No lazy loading:** All translations loaded upfront
3. **No pluralization:** Current implementation doesn't handle plural forms
4. **No date/time formatting:** Only text labels translated

---

## Troubleshooting

### Issue: Labels not translating

**Solution:** Check browser console for I18nService errors

### Issue: RTL not working for Hebrew/Arabic

**Solution:** Verify LanguageService is setting `dir` attribute correctly

### Issue: Tests failing

**Solution:** Ensure I18nService is injected and language set to 'en' in tests

---

## Verification Sign-Off

After completing all tests, sign off below:

- [ ] All 8 languages tested
- [ ] All UI labels verified
- [ ] RTL tested for Hebrew & Arabic
- [ ] LTR tested for other languages
- [ ] No regressions found
- [ ] Unit tests passing
- [ ] Performance acceptable

**Tester Name:** ********\_********  
**Date:** ********\_********  
**Status:** ☐ Pass ☐ Fail  
**Notes:** ********\_********

---

**Last Updated:** 2026-02-03
