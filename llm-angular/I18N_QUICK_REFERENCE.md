# i18n Quick Reference Card

## 🚀 Quick Start (3 Steps)

### 1. Inject Service

```typescript
import { inject } from "@angular/core";
import { I18nService } from "@/services/i18n.service";

export class MyComponent {
  readonly i18n = inject(I18nService); // Make it public for template access
}
```

### 2. Use in Component

```typescript
// Simple translation
const label = this.i18n.tUi("card.openNow");

// With variables
const text = this.i18n.tUi("action.shareText", {
  name: restaurant.name,
  address: restaurant.address,
});

// Cuisine with auto-matching
const cuisine = this.i18n.getCuisine(["sushi", "japanese"]);

// Signal label
const signal = this.i18n.getSignal("OPEN_NOW");

// Check RTL
if (this.i18n.isRTL()) {
  // Apply RTL layout
}
```

### 3. Use in Template

```html
<!-- Direct translation -->
<span>{{ i18n.tUi('card.openNow') }}</span>

<!-- Aria-label -->
<button [attr.aria-label]="i18n.tUi('card.navigate') + ' ' + restaurant().name">Navigate</button>

<!-- Tooltip -->
<button [title]="i18n.tUi('card.saveToFavorites')">Save</button>

<!-- With computed -->
<span>{{ openStatusLabel() }}</span>
<!-- where openStatusLabel = computed(() => this.i18n.tUi('card.openNow')) -->
```

## 📦 Translation Functions

| Function           | Use Case                                   | Example                                        |
| ------------------ | ------------------------------------------ | ---------------------------------------------- |
| `t(key)`           | Search narration (hero, location, filters) | `this.i18n.t('hero.title')`                    |
| `tUi(key)`         | UI strings (buttons, labels, tooltips)     | `this.i18n.tUi('card.openNow')`                |
| `getCuisine(tags)` | Cuisine with emoji                         | `this.i18n.getCuisine(['sushi'])` → `🍣 Sushi` |
| `getSignal(type)`  | Card signal badges                         | `this.i18n.getSignal('OPEN_NOW')`              |

## 🔑 Common Keys

### Restaurant Card

```typescript
"card.openNow"; // "Open now"
"card.closed"; // "Closed"
"card.hoursUnverified"; // "Hours unverified"
"card.reviews"; // "reviews"
"card.rating"; // "Rating:"
"card.priceLevel"; // "Price level:"
"card.navigate"; // "Navigate to restaurant"
"card.navigateTo"; // "Navigate to"
"card.call"; // "Call restaurant"
"card.callRestaurant"; // "Call"
"card.save"; // "Save to favorites"
"card.glutenFree"; // "GF"
"card.maybeGlutenFree"; // "Maybe GF"
"card.glutenFreeTooltip"; // "Based on text signals — not guaranteed"
```

### Actions

```typescript
"action.openedMaps"; // "Opened Google Maps"
"action.failedToOpenMaps"; // "Failed to open maps"
"action.sharedSuccessfully"; // "Shared successfully"
"action.savedToFavorites"; // "Saved to favorites"
```

### Common

```typescript
"common.close"; // "Close"
"common.clear"; // "Clear"
```

## 🌍 Supported Languages

| Code | Language | RTL? |
| ---- | -------- | ---- |
| `en` | English  | ❌   |
| `he` | Hebrew   | ✅   |
| `fr` | French   | ❌   |
| `es` | Spanish  | ❌   |
| `ru` | Russian  | ❌   |
| `ar` | Arabic   | ✅   |
| `it` | Italian  | ❌   |
| `ja` | Japanese | ❌   |

## 🎨 Cuisine Types (Auto-Match)

```typescript
// All with emojis
'sushi' → 🍣
'pizza' → 🍕
'italian' → 🍝
'burger' → 🍔
'chinese' → 🥡
'indian' → 🍛
'mexican' → 🌮
'japanese' → 🍱
'thai' → 🍜
'mediterranean' → 🥙
'american' → 🍔
'asian' → 🥢
'middle_eastern' → 🥙
'seafood' → 🦞
'steakhouse' → 🥩
'vegan' → 🌱
'vegetarian' → 🥗
'cafe' → ☕
'bar' → 🍺
'bakery' → 🥐
'dessert' → 🍰
'restaurant' → 🍽️ (fallback)
```

## 🏷️ Signal Badge Types

```typescript
"OPEN_NOW"; // "Open now" / "פתוח עכשיו"
"CLOSED_NOW"; // "Closed" / "סגור עכשיו"
"PRICE_CHEAP"; // "Cheap" / "זול"
"PRICE_MID"; // "Mid-price" / "בינוני"
"PRICE_EXPENSIVE"; // "Expensive" / "יקר"
"NEARBY"; // "Nearby" / "קרוב"
"INTENT_MATCH"; // "Good match" / "מתאים"
"POPULAR"; // "Popular" / "פופולרי"
```

## 🔄 Variable Interpolation

```typescript
// Define with placeholders
'action.shareText': 'Check out {name} at {address}'

// Use with variables
this.i18n.tUi('action.shareText', {
  name: 'Pizza Place',
  address: '123 Main St'
});
// → "Check out Pizza Place at 123 Main St"
```

## ✅ Translation Checklist

### DO Translate:

- ✅ Buttons, labels, headings
- ✅ Tooltips, aria-labels
- ✅ Error messages, empty states
- ✅ Filters, chips, badges
- ✅ Helper texts
- ✅ Meta UI (open now, reviews, distance)

### DON'T Translate:

- ❌ Restaurant names
- ❌ Addresses
- ❌ User-generated content
- ❌ Assistant messages (backend handles)
- ❌ Google provider text

## 🧪 Testing

```typescript
// Manual test: Switch language
// Backend sends assistantLanguage = 'ja'
// → All UI updates to Japanese

// Check current language
console.log(this.i18n.currentLang()); // 'ja'

// Check RTL
console.log(this.i18n.isRTL()); // false for 'ja', true for 'he'/'ar'
```

## 📂 File Locations

```
llm-angular/src/app/
├── i18n/
│   ├── search-narration.i18n.ts  ← Main app strings
│   ├── ui-strings.i18n.ts        ← Component strings
│   └── cuisine-labels.i18n.ts    ← Cuisine types
├── domain/i18n/
│   └── card-signal-labels.i18n.ts ← Signal badges
└── services/
    └── i18n.service.ts           ← Centralized service
```

## 💡 Pro Tips

1. **Expose service as `readonly` in component** (not `private`) for template access
2. **Use computed signals** for reactive translations: `computed(() => this.i18n.tUi('key'))`
3. **Don't concatenate** with `+` in templates - use variables or component methods
4. **Test RTL** with Hebrew (`he`) or Arabic (`ar`)
5. **Regenerate JSON** after adding new keys: `npx ts-node generate-i18n-json.ts`

## 🆘 Common Issues

### Issue: "Property 'i18n' is not accessible"

**Fix:** Make service `readonly` (not `private`)

```typescript
readonly i18n = inject(I18nService); // ✅ Template can access
private readonly i18n = inject(I18nService); // ❌ Template cannot access
```

### Issue: "Translation not found"

**Fix:** Check if key exists in type definition and all language objects

### Issue: "Language not switching"

**Fix:** Ensure `assistantLanguage` is set in SearchFacade from backend

## 📚 Learn More

- **Full docs:** `I18N_README.md`
- **Migration guide:** `I18N_MIGRATION_CHECKLIST.md`
- **Implementation:** `I18N_IMPLEMENTATION_SUMMARY.md`

---

**Version:** 1.0.0 | **Last Updated:** 2026-02-01
