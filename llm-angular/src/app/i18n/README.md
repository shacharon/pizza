# i18n Translation Modules

This folder contains the core translation modules for the restaurant search app.

## Files

### `search-narration.i18n.ts`
**Main app UI strings**

Covers:
- Hero section (title, subtitle)
- Location status messages
- Search bar placeholders
- Error states
- Filters and chips
- WebSocket status
- Results states
- Assistant messages

**Keys:** 50+  
**Languages:** en, he, fr, es, ru, ar, it, ja

**Usage:**
```typescript
import { t } from './search-narration.i18n';
const title = t(lang, 'hero.title');
```

---

### `ui-strings.i18n.ts`
**Component-specific UI strings**

Covers:
- Restaurant card (buttons, labels, tooltips, aria-labels)
- Reason labels
- Search bar accessibility
- Assistant components
- Action executors (toast messages)

**Keys:** 55+  
**Languages:** en, he, fr, es, ru, ar, it, ja

**Usage:**
```typescript
import { tUi } from './ui-strings.i18n';
const label = tUi(lang, 'card.openNow');
```

---

### `cuisine-labels.i18n.ts`
**Cuisine types with emojis**

Covers:
- 22 cuisine types (sushi, pizza, italian, burger, etc.)
- Each with emoji + localized label
- Auto-matching function for restaurant tags
- Fallback to "Restaurant" if no match

**Keys:** 22 cuisine types  
**Languages:** en, he, fr, es, ru, ar, it, ja

**Usage:**
```typescript
import { getCuisineLabel } from './cuisine-labels.i18n';
const cuisine = getCuisineLabel(['sushi', 'japanese'], lang);
// Returns: "🍣 Sushi" (en) or "🍣 סושי" (he)
```

---

## Using These Modules

### Direct Import (NOT Recommended)
```typescript
import { t } from './i18n/search-narration.i18n';
import { tUi } from './i18n/ui-strings.i18n';

// Need to pass language every time
const label = tUi('en', 'card.openNow');
```

### Via I18nService (Recommended) ✅
```typescript
import { inject } from '@angular/core';
import { I18nService } from './services/i18n.service';

export class MyComponent {
  readonly i18n = inject(I18nService);

  getLabel() {
    // Language is automatically resolved
    return this.i18n.tUi('card.openNow');
  }
}
```

**Why use I18nService?**
- ✅ Automatic language resolution (from WebSocket)
- ✅ Reactive updates when language changes
- ✅ RTL detection built-in
- ✅ Unified API for all translation types
- ✅ Type-safe with autocomplete

---

## Translation Keys

### search-narration.i18n.ts Keys
```typescript
'hero.title'
'hero.subtitle'
'location.using'
'location.getting'
'location.denied'
'location.unavailable'
'location.enable'
'search.placeholder'
'search.loading'
'recent.title'
'recent.clearAll'
'error.title'
'error.retry'
'filter.openNow'
'filter.openNowTooltip'
'filter.glutenFree'
'filter.glutenFreeTooltip'
'pagination.loadMore'
'actions.pendingTitle'
'actions.approve'
'actions.reject'
'assistant.preparing'
'assistant.unavailable'
'ws.connecting'
'ws.reconnecting'
'ws.connected'
'ws.disconnected'
'results.searching'
'results.noResults'
'common.close'
'common.clear'
'common.retry'
// ... and more
```

### ui-strings.i18n.ts Keys
```typescript
// Restaurant card
'card.viewDetails'
'card.photoAlt'
'card.photoPlaceholder'
'card.rating'
'card.priceLevel'
'card.reviews'
'card.navigate'
'card.navigateTo'
'card.locationNotAvailable'
'card.call'
'card.callRestaurant'
'card.phoneNotAvailable'
'card.save'
'card.saveToFavorites'
'card.openNow'
'card.closed'
'card.hoursUnverified'
'card.glutenFree'
'card.maybeGlutenFree'
'card.glutenFreeTooltip'

// Reason labels
'reason.bestMatch'
'reason.closestOption'

// Actions
'action.openedMaps'
'action.failedToOpenMaps'
'action.sharedSuccessfully'
'action.savedToFavorites'
// ... and more
```

### cuisine-labels.i18n.ts Keys
```typescript
'sushi'    → 🍣 Sushi / סושי / 寿司
'pizza'    → 🍕 Pizza / פיצה / ピザ
'italian'  → 🍝 Italian / איטלקי / イタリアン
'burger'   → 🍔 Burger / המבורגר / ハンバーガー
'chinese'  → 🥡 Chinese / סיני / 中華
'indian'   → 🍛 Indian / הודי / インド料理
'japanese' → 🍱 Japanese / יפני / 和食
'thai'     → 🍜 Thai / תאילנדי / タイ料理
'vegan'    → 🌱 Vegan / טבעוני / ヴィーガン
'cafe'     → ☕ Cafe / בית קפה / カフェ
// ... 22 total
```

---

## Adding New Strings

1. **Add key to type definition:**
```typescript
export type MsgKey =
  | 'existing.key'
  | 'new.key'; // Add here
```

2. **Add translations for ALL 8 languages:**
```typescript
export const MESSAGES: Record<Lang, Record<MsgKey, string>> = {
  en: { 'new.key': 'English text' },
  he: { 'new.key': 'טקסט עברי' },
  fr: { 'new.key': 'Texte français' },
  es: { 'new.key': 'Texto español' },
  ru: { 'new.key': 'Русский текст' },
  ar: { 'new.key': 'نص عربي' },
  it: { 'new.key': 'Testo italiano' },
  ja: { 'new.key': '日本語テキスト' }
};
```

3. **Regenerate JSON files:**
```bash
npx ts-node generate-i18n-json.ts
```

---

## Variable Interpolation

All translation functions support variable interpolation:

```typescript
// Define with placeholders
'action.shareText': 'Check out {name} at {address}'

// Use with variables
tUi(lang, 'action.shareText', {
  name: 'Pizza Place',
  address: '123 Main St'
});
// → "Check out Pizza Place at 123 Main St"
```

**Placeholder syntax:** `{variableName}`

---

## Language Codes

| Code | Language | RTL? |
|------|----------|------|
| `en` | English | No |
| `he` | Hebrew | Yes |
| `fr` | French | No |
| `es` | Spanish | No |
| `ru` | Russian | No |
| `ar` | Arabic | Yes |
| `it` | Italian | No |
| `ja` | Japanese | No |

---

## Best Practices

### ✅ DO
- Use `I18nService` in components (not direct imports)
- Add translations for ALL 8 languages when adding new keys
- Use variable interpolation for dynamic content
- Keep translations concise and app-style
- Preserve placeholders exactly: `{name}`, `{count}`, etc.

### ❌ DON'T
- Hardcode UI strings in components
- Skip languages when adding new keys
- Mix translation styles (use one module per domain)
- Add emojis to translations (except cuisine labels)
- Paraphrase - keep same meaning across all languages

---

## Related Files

- **Service:** `../services/i18n.service.ts`
- **Domain labels:** `../domain/i18n/card-signal-labels.i18n.ts`
- **Generated JSON:** `../assets/i18n/*.json`
- **Export script:** `../../generate-i18n-json.ts`

---

## Documentation

For full documentation, see:
- **[I18N_INDEX.md](../../I18N_INDEX.md)** - Main documentation index
- **[I18N_QUICK_REFERENCE.md](../../I18N_QUICK_REFERENCE.md)** - Quick API reference
- **[I18N_README.md](../../I18N_README.md)** - Complete guide

---

**Last Updated:** 2026-02-01  
**Languages:** 8 (en, he, fr, es, ru, ar, it, ja)  
**Total Keys:** 130+
