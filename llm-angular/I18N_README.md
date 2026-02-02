# i18n System Documentation

## Overview

This restaurant search app has a comprehensive i18n (internationalization) system that supports **8 languages** and handles all UI strings deterministically (no LLM-generated text).

## Supported Languages

1. **en** - English
2. **he** - Hebrew (RTL)
3. **fr** - French
4. **es** - Spanish
5. **ru** - Russian
6. **ar** - Arabic (RTL)
7. **it** - Italian
8. **ja** - Japanese

## Architecture

### Language Source of Truth

The **backend WebSocket** provides the current language via the `assistantLanguage` field. This is the single source of truth for the UI language. The frontend **NEVER guesses** the language.

```typescript
// Language flows from backend → SearchFacade → I18nService
readonly currentLang = computed(() => {
  const lang = this.searchFacade.assistantLanguage();
  return normalizeLang(lang); // Normalizes to supported Lang type
});
```

### Translation Modules

The i18n system is organized into four main modules:

#### 1. **Search Narration** (`search-narration.i18n.ts`)

Covers main app UI:

- Hero section (title, subtitle)
- Location status
- Search bar
- Errors
- Filters
- WebSocket status
- Results states

**Usage:**

```typescript
import { t } from "./i18n/search-narration.i18n";
const title = t(lang, "hero.title");
```

#### 2. **UI Strings** (`ui-strings.i18n.ts`)

Covers component-specific strings:

- Restaurant card (buttons, labels, tooltips)
- Reason labels
- Search bar
- Assistant components
- Action executors (toasts, messages)

**Usage:**

```typescript
import { tUi } from "./i18n/ui-strings.i18n";
const label = tUi(lang, "card.openNow");
```

#### 3. **Cuisine Labels** (`cuisine-labels.i18n.ts`)

Covers cuisine types with emojis:

- Sushi 🍣, Pizza 🍕, Italian 🍝, etc.
- Automatically matches tags from restaurants
- Each cuisine has emoji + localized label

**Usage:**

```typescript
import { getCuisineLabel } from "./i18n/cuisine-labels.i18n";
const cuisine = getCuisineLabel(["sushi", "japanese"], lang);
// Returns: "🍣 Sushi" (English) or "🍣 סושי" (Hebrew)
```

#### 4. **Card Signal Labels** (`card-signal-labels.i18n.ts`)

Covers card badges:

- Open/Closed status
- Price levels (cheap, mid, expensive)
- Distance (nearby)
- Intent match
- Popularity

**Usage:**

```typescript
import { getSignalLabel } from "./domain/i18n/card-signal-labels.i18n";
const label = getSignalLabel("OPEN_NOW", lang);
```

### Centralized Service

The **`I18nService`** provides a unified API for all translations:

```typescript
// Inject in component
private readonly i18n = inject(I18nService);

// Current language (reactive)
this.i18n.currentLang() // 'en' | 'he' | 'fr' | ...

// Is RTL?
this.i18n.isRTL() // true for Hebrew & Arabic

// Translate
this.i18n.t('hero.title') // Search narration
this.i18n.tUi('card.openNow') // UI strings
this.i18n.getCuisine(['sushi']) // Cuisine labels
this.i18n.getSignal('OPEN_NOW') // Signal labels

// Computed versions (for templates)
readonly titleLabel = this.i18n.computed('hero.title');
readonly openLabel = this.i18n.computedUi('card.openNow');
```

## Component Integration

### Example: Restaurant Card Component

```typescript
import { inject } from "@angular/core";
import { I18nService } from "../../../../services/i18n.service";

export class RestaurantCardComponent {
  private readonly i18n = inject(I18nService);

  // Use in methods
  getOpenStatusLabel(): string {
    const status = this.getOpenStatus();
    switch (status) {
      case "open":
        return this.i18n.tUi("card.openNow");
      case "closed":
        return this.i18n.tUi("card.closed");
      case "unknown":
        return this.i18n.tUi("card.hoursUnverified");
      default:
        return "";
    }
  }

  // Use in computed
  readonly glutenFreeBadge = computed(() => {
    const hint = this.restaurant().dietaryHints?.glutenFree;
    if (hint?.confidence === "HIGH") {
      return { text: this.i18n.tUi("card.glutenFree"), level: "high" };
    }
    return null;
  });

  // Use for cuisine
  getCuisineTag(): string {
    const tags = this.restaurant().tags || [];
    return this.i18n.getCuisine(tags);
  }
}
```

### HTML Template Usage

```html
<!-- Use i18n service directly in templates -->
<span [attr.aria-label]="i18n.tUi('card.viewDetails') + ' ' + restaurant().name"> View Details </span>

<!-- Or use component methods that wrap i18n -->
<span class="status">{{ getOpenStatusLabel() }}</span>
<p class="cuisine">{{ getCuisineTag() }}</p>
```

## Translation Scope

### ✅ Translate (Static UI)

- Headings
- Buttons
- Labels
- Chips
- Filters
- Meta UI words (open now, reviews, price, distance)
- Empty states
- Error messages (static)
- Helper texts
- Aria-labels
- Tooltips

### ❌ DO NOT Translate

- Restaurant names
- Addresses
- User-generated content
- Assistant messages from WebSocket (backend handles this)
- Google provider text (already localized)

## RTL Support

Hebrew (`he`) and Arabic (`ar`) are RTL languages.

```typescript
// Check if current language is RTL
this.i18n.isRTL(); // true for 'he' and 'ar'
```

The app should apply RTL CSS when `isRTL()` is true.

## Variable Interpolation

Both `t()` and `tUi()` support variable interpolation:

```typescript
// Define strings with placeholders
'action.shareText': 'Check out {name} at {address}'

// Use with variables
this.i18n.tUi('action.shareText', {
  name: restaurant.name,
  address: restaurant.address
});
// Output: "Check out Pizza Place at 123 Main St"
```

Placeholders use `{varName}` syntax.

## JSON Export

Generate standalone JSON files for each language:

```bash
cd llm-angular
npx ts-node generate-i18n-json.ts
```

Outputs:

```
src/assets/i18n/
├── en.json
├── he.json
├── fr.json
├── es.json
├── ru.json
├── ar.json
├── it.json
└── ja.json
```

Each JSON file combines all translation sources:

```json
{
  "hero.title": "Search food the way you think",
  "card.openNow": "Open now",
  "cuisine": {
    "sushi": "🍣 Sushi",
    "pizza": "🍕 Pizza"
  },
  "signal": {
    "open_now": "Open now",
    "closed_now": "Closed"
  }
}
```

## Adding New Strings

### 1. Add Key to Type Definition

```typescript
// In search-narration.i18n.ts or ui-strings.i18n.ts
export type MsgKey = "existing.key" | "new.key"; // Add here
```

### 2. Add Translations for All Languages

```typescript
export const MESSAGES: Record<Lang, Record<MsgKey, string>> = {
  en: {
    "new.key": "English translation",
    // ...
  },
  he: {
    "new.key": "תרגום עברי",
    // ...
  },
  // ... repeat for fr, es, ru, ar, it, ja
};
```

### 3. Use in Component

```typescript
const label = this.i18n.t("new.key");
```

### 4. Regenerate JSON Files

```bash
npx ts-node generate-i18n-json.ts
```

## Translation Quality Standards

### English (en)

- Clear, concise, modern UX copy
- Use active voice
- Avoid jargon

### Hebrew (he)

- Natural, modern Hebrew
- UI-friendly (not literal Google Translate)
- Use סמיכות where appropriate
- Avoid archaic forms

### Arabic (ar)

- Modern Standard Arabic (MSA)
- Natural app-style language
- Avoid literal translations

### Japanese (ja)

- Concise, app-style Japanese
- Use katakana for foreign concepts
- Avoid overly polite forms (use です/ます form)

### All Languages

- No emojis (unless in original English)
- No paraphrasing across languages
- Preserve placeholders exactly: `{name}`, `{count}`, etc.
- Keep consistent terminology

## File Structure

```
llm-angular/src/app/
├── i18n/
│   ├── search-narration.i18n.ts    # Main app strings
│   ├── ui-strings.i18n.ts          # Component strings
│   ├── cuisine-labels.i18n.ts      # Cuisine types
│   └── card-signal-labels.i18n.ts  # DEPRECATED (use domain version)
├── domain/i18n/
│   └── card-signal-labels.i18n.ts  # Card badges (new location)
├── services/
│   └── i18n.service.ts             # Centralized i18n service
└── assets/i18n/                     # Generated JSON files
    ├── en.json
    ├── he.json
    ├── fr.json
    ├── es.json
    ├── ru.json
    ├── ar.json
    ├── it.json
    └── ja.json
```

## Testing

### Manual Testing

1. **Set assistantLanguage** in SearchFacade
2. **Observe UI** updates reactively
3. **Verify RTL** layout for Hebrew/Arabic
4. **Check all strings** render in correct language

### Automated Testing

```typescript
describe("I18nService", () => {
  it("should return correct language from backend", () => {
    // Mock assistantLanguage = 'he'
    expect(i18n.currentLang()).toBe("he");
  });

  it("should detect RTL for Hebrew and Arabic", () => {
    // Mock assistantLanguage = 'he'
    expect(i18n.isRTL()).toBe(true);
    // Mock assistantLanguage = 'en'
    expect(i18n.isRTL()).toBe(false);
  });

  it("should translate UI strings correctly", () => {
    // Mock assistantLanguage = 'fr'
    expect(i18n.tUi("card.openNow")).toBe("Ouvert maintenant");
  });
});
```

## Migration Guide

### Before (Hardcoded Strings)

```typescript
getOpenStatusLabel(): string {
  return this.openNow ? 'Open now' : 'Closed';
}
```

### After (i18n)

```typescript
private readonly i18n = inject(I18nService);

getOpenStatusLabel(): string {
  return this.openNow
    ? this.i18n.tUi('card.openNow')
    : this.i18n.tUi('card.closed');
}
```

## FAQ

### Q: Where does the language come from?

**A:** The backend WebSocket sends `assistantLanguage` field. The frontend uses this as the single source of truth.

### Q: What if assistantLanguage is not supported?

**A:** The system falls back to English (`en`).

### Q: Can I override the language manually?

**A:** No. The language is controlled by the backend to ensure consistency with assistant messages.

### Q: How do I add a new language?

**A:** You need to:

1. Add to `Lang` / `UiLang` type
2. Add translations to all `MESSAGES` / `UI_STRINGS` objects
3. Update `normalizeLang()` function
4. Regenerate JSON files

### Q: Do I translate restaurant names or addresses?

**A:** No. Only static UI strings. Restaurant data is user-generated or from Google Maps.

### Q: How do I handle plurals?

**A:** Use separate keys or variable interpolation:

```typescript
'results.count': '{count} restaurants'
```

## Support

For questions or issues with the i18n system:

1. Check this README
2. Review translation modules (`*.i18n.ts`)
3. Test with `I18nService` in dev mode
4. Ensure `assistantLanguage` is set correctly from backend

---

**Last Updated:** 2026-02-01  
**Version:** 1.0.0
