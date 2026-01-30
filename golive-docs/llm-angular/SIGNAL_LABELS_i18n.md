# Signal Labels (i18n-ready)

## Overview

Centralized translation dictionary for card signal labels in Hebrew and English. Prepared for future i18n integration without wiring actual translation service yet.

---

## Design Philosophy

**"Translation-Ready, Not Translation-Active"**

All signal labels are centralized in a single file with support for multiple languages. The system defaults to Hebrew but can easily switch to English or future languages. No i18n service is wired yet—this is pure preparation.

---

## File Structure

```
src/app/domain/i18n/
└── signal-labels.ts      # Central label dictionary
```

---

## Supported Languages

```typescript
export type SupportedLanguage = 'he' | 'en';

// Future: 'ar', 'ru', 'fr', etc.
```

**Current:** Hebrew (he), English (en)  
**Default:** Hebrew (he)

---

## Signal Label Dictionary

### Core Signals (Priority-Based)

```typescript
export const SIGNAL_LABELS: Record<CardSignalType, Record<SupportedLanguage, string>> = {
  // Priority 1: Open/Closed
  OPEN_NOW: {
    he: 'פתוח עכשיו',     // "Open now"
    en: 'Open now'
  },
  
  CLOSED_NOW: {
    he: 'סגור עכשיו',     // "Closed now"
    en: 'Closed now'
  },
  
  // Priority 2: Price
  PRICE_CHEAP: {
    he: 'זול',            // "Cheap"
    en: 'Cheap'
  },
  
  PRICE_MID: {
    he: 'בינוני',         // "Mid-price"
    en: 'Mid-price'
  },
  
  PRICE_EXPENSIVE: {
    he: 'יקר',            // "Expensive"
    en: 'Expensive'
  },
  
  // Priority 3: Distance
  NEARBY: {
    he: 'קרוב',           // "Nearby"
    en: 'Nearby'
  },
  
  // Priority 4: Intent match
  INTENT_MATCH: {
    he: 'מתאים',          // "Good match"
    en: 'Good match'
  }
};
```

---

## Extended Labels

### Intent Match Labels (Common Patterns)

```typescript
export const INTENT_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  // Meal times
  breakfast: {
    he: 'טוב לארוחת בוקר',
    en: 'Good for breakfast'
  },
  
  lunch: {
    he: 'טוב לארוחת צהריים',
    en: 'Good for lunch'
  },
  
  dinner: {
    he: 'טוב לארוחת ערב',
    en: 'Good for dinner'
  },
  
  brunch: {
    he: 'טוב לברנץ\'',
    en: 'Good for brunch'
  },
  
  // Occasions
  date: {
    he: 'רומנטי',
    en: 'Romantic'
  },
  
  family: {
    he: 'משפחתי',
    en: 'Family-friendly'
  },
  
  group: {
    he: 'טוב לקבוצות',
    en: 'Good for groups'
  },
  
  business: {
    he: 'עסקי',
    en: 'Business dining'
  },
  
  // Atmosphere
  casual: {
    he: 'נינוח',
    en: 'Casual'
  },
  
  fancy: {
    he: 'מפואר',
    en: 'Fine dining'
  },
  
  cozy: {
    he: 'אינטימי',
    en: 'Cozy'
  },
  
  trendy: {
    he: 'טרנדי',
    en: 'Trendy'
  },
  
  // Service
  takeout: {
    he: 'טייק אווי',
    en: 'Takeout'
  },
  
  delivery: {
    he: 'משלוחים',
    en: 'Delivery'
  },
  
  outdoor: {
    he: 'ישיבה בחוץ',
    en: 'Outdoor seating'
  },
  
  // Quality
  highly_rated: {
    he: 'מדורג גבוה',
    en: 'Highly rated'
  },
  
  popular: {
    he: 'פופולרי',
    en: 'Popular'
  },
  
  hidden_gem: {
    he: 'אבן חן מוסתרת',
    en: 'Hidden gem'
  }
};
```

### Distance Labels (Future Use)

```typescript
export const DISTANCE_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  very_close: {
    he: 'קרוב מאוד',
    en: 'Very close'
  },
  
  nearby: {
    he: 'קרוב',
    en: 'Nearby'
  },
  
  walkable: {
    he: 'הליכה קצרה',
    en: 'Short walk'
  },
  
  moderate: {
    he: 'מרחק בינוני',
    en: 'Moderate distance'
  },
  
  far: {
    he: 'רחוק',
    en: 'Far'
  }
};
```

---

## Helper Functions

### 1. Get Signal Label

```typescript
function getSignalLabel(
  signalType: CardSignalType,
  language: SupportedLanguage = 'he'
): string
```

**Usage:**
```typescript
getSignalLabel('OPEN_NOW', 'he')  // → 'פתוח עכשיו'
getSignalLabel('OPEN_NOW', 'en')  // → 'Open now'
getSignalLabel('PRICE_CHEAP')     // → 'זול' (default: he)
```

---

### 2. Get Intent Label

```typescript
function getIntentLabel(
  intentKey: string,
  language: SupportedLanguage = 'he'
): string
```

**Usage:**
```typescript
getIntentLabel('breakfast', 'he')  // → 'טוב לארוחת בוקר'
getIntentLabel('breakfast', 'en')  // → 'Good for breakfast'
getIntentLabel('romantic', 'he')   // → 'רומנטי'
getIntentLabel('unknown', 'he')    // → 'מתאים' (fallback)
```

---

### 3. Get Distance Label

```typescript
function getDistanceLabel(
  distanceKey: string,
  language: SupportedLanguage = 'he'
): string
```

**Usage:**
```typescript
getDistanceLabel('nearby', 'he')   // → 'קרוב'
getDistanceLabel('far', 'en')      // → 'Far'
```

---

### 4. Detect Language

```typescript
function detectLanguage(text: string): SupportedLanguage
```

**Usage:**
```typescript
detectLanguage('פיצה')          // → 'he'
detectLanguage('Pizza')          // → 'en'
detectLanguage('שלום World')     // → 'he' (has Hebrew chars)
```

**Heuristic:** Returns 'he' if Hebrew Unicode characters (U+0590 to U+05FF) detected, 'en' otherwise.

---

## Integration with Signal Utility

### Updated computeCardSignal()

```typescript
export function computeCardSignal(
  restaurant: Restaurant,
  userLocation?: { lat: number; lng: number },
  language: SupportedLanguage = 'he'  // ← NEW: Language parameter
): CardSignal | null {
  
  // Example: Open signal
  if (restaurant.openNow === true) {
    return {
      type: 'OPEN_NOW',
      priority: 1,
      label: getSignalLabel('OPEN_NOW', language),  // ← Uses label dictionary
    };
  }
  
  // Example: Intent match
  if (restaurant.matchReason) {
    return {
      type: 'INTENT_MATCH',
      priority: 4,
      label: getIntentLabel(restaurant.matchReason, language),  // ← Localized intent
      metadata: { matchReason: restaurant.matchReason }
    };
  }
  
  // ...
}
```

---

## Usage Examples

### Example 1: Hebrew (Default)

```typescript
const restaurant = {
  openNow: true,
  priceLevel: 2
};

const signal = computeCardSignal(restaurant);
// {
//   type: 'OPEN_NOW',
//   priority: 1,
//   label: 'פתוח עכשיו'  ← Hebrew
// }
```

---

### Example 2: English

```typescript
const restaurant = {
  openNow: false,
  priceLevel: 1
};

const signal = computeCardSignal(restaurant, undefined, 'en');
// {
//   type: 'CLOSED_NOW',
//   priority: 1,
//   label: 'Closed now'  ← English
// }
```

---

### Example 3: Intent Match with Localization

```typescript
const restaurant = {
  matchReason: 'breakfast'  // Backend sends intent key
};

// Hebrew
const signalHe = computeCardSignal(restaurant, undefined, 'he');
// {
//   type: 'INTENT_MATCH',
//   priority: 4,
//   label: 'טוב לארוחת בוקר'  ← Localized Hebrew
// }

// English
const signalEn = computeCardSignal(restaurant, undefined, 'en');
// {
//   type: 'INTENT_MATCH',
//   priority: 4,
//   label: 'Good for breakfast'  ← Localized English
// }
```

---

### Example 4: Unknown Intent (Fallback)

```typescript
const restaurant = {
  matchReason: 'custom_reason_not_in_dict'
};

const signal = computeCardSignal(restaurant);
// {
//   type: 'INTENT_MATCH',
//   priority: 4,
//   label: 'מתאים'  ← Fallback to generic "Good match"
// }
```

---

## Label Guidelines

### Rules:
1. **Short** - Max 2-3 words per label
2. **Neutral** - No subjective tone (avoid "amazing", "terrible")
3. **No emojis** - Text only
4. **No scores** - No percentages, ratings, or numeric values
5. **Consistent** - Use same voice across all labels

### Examples (Good):
```
✓ 'פתוח עכשיו'   (Open now)
✓ 'זול'          (Cheap)
✓ 'קרוב'         (Nearby)
✓ 'טוב לארוחת בוקר' (Good for breakfast)
```

### Examples (Bad):
```
✗ 'פתוח עכשיו!! 😊'  (emoji)
✗ 'מדהים'           (subjective)
✗ '95% דירוג'       (score/percentage)
✗ 'זול מאוד ושווה כסף' (too long)
```

---

## Future i18n Integration

### Current State:
```typescript
// NOT wired yet
const signal = computeCardSignal(restaurant, undefined, 'he');
```

### Future State (with i18n service):
```typescript
// Wired to i18n service
import { TranslateService } from '@ngx-translate/core';

class SignalService {
  constructor(private translate: TranslateService) {}
  
  computeSignal(restaurant: Restaurant): CardSignal | null {
    const language = this.translate.currentLang as SupportedLanguage;
    return computeCardSignal(restaurant, undefined, language);
  }
}
```

---

## Adding New Languages

### Step 1: Add Language Code

```typescript
export type SupportedLanguage = 'he' | 'en' | 'ar';  // ← Add Arabic
```

### Step 2: Add Labels

```typescript
export const SIGNAL_LABELS: Record<CardSignalType, Record<SupportedLanguage, string>> = {
  OPEN_NOW: {
    he: 'פתוח עכשיו',
    en: 'Open now',
    ar: 'مفتوح الآن'  // ← Add Arabic label
  },
  // ...
};
```

### Step 3: Done!

All existing code automatically supports the new language via `getSignalLabel()`.

---

## Adding New Intents

### Example: Add "vegetarian" intent

```typescript
export const INTENT_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  // ... existing intents ...
  
  vegetarian: {
    he: 'צמחוני',
    en: 'Vegetarian'
  },
  
  vegan: {
    he: 'טבעוני',
    en: 'Vegan'
  }
};
```

Backend sends `matchReason: 'vegetarian'` → Frontend displays localized label.

---

## Testing

### Unit Test Examples:

```typescript
describe('Signal Labels', () => {
  it('should return Hebrew label by default', () => {
    const label = getSignalLabel('OPEN_NOW');
    expect(label).toBe('פתוח עכשיו');
  });

  it('should return English label when specified', () => {
    const label = getSignalLabel('OPEN_NOW', 'en');
    expect(label).toBe('Open now');
  });

  it('should return localized intent label', () => {
    const label = getIntentLabel('breakfast', 'he');
    expect(label).toBe('טוב לארוחת בוקר');
  });

  it('should fallback to generic match for unknown intent', () => {
    const label = getIntentLabel('unknown_intent', 'he');
    expect(label).toBe('מתאים');
  });

  it('should detect Hebrew text', () => {
    const lang = detectLanguage('פיצה');
    expect(lang).toBe('he');
  });

  it('should detect English text', () => {
    const lang = detectLanguage('Pizza');
    expect(lang).toBe('en');
  });
});
```

---

## Benefits

✅ **Centralized** - All labels in one file  
✅ **Type-safe** - Full TypeScript types  
✅ **Easy to extend** - Add language = add column  
✅ **i18n-ready** - Prepared for future translation service  
✅ **Consistent** - Same labels across app  
✅ **Testable** - Pure functions (no side effects)  
✅ **Maintainable** - Update one place, affects all  
✅ **No emojis** - Clean, professional text  
✅ **Short labels** - Max 2-3 words (fast scanning)  

---

## Summary

The signal labels system provides a **centralized, translation-ready dictionary** for all card signal text. By separating labels from logic, we enable easy language expansion and future i18n integration without refactoring.

**Structure:**
- `SIGNAL_LABELS` - Core signals (priority-based)
- `INTENT_LABELS` - Extended intent patterns
- `DISTANCE_LABELS` - Distance ranges (future)

**Languages:**
- Hebrew (he) - Default
- English (en)
- Future: Arabic, Russian, French, etc.

**Integration:**
- `computeCardSignal()` uses `getSignalLabel()`
- Component displays `signal.label` (already localized)
- No i18n service wired yet (pure preparation)

**Expansion:**
- Add language: Add column to dictionaries
- Add intent: Add row to `INTENT_LABELS`
- Add signal: Add row to `SIGNAL_LABELS`
