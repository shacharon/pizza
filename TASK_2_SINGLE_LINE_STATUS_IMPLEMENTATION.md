# TASK 2/3 — Single-Line "Status + Hours" Implementation Summary

## Overview

Replaced the multi-line open/closed status display with a single consolidated line that shows status and relevant hours information.

---

## Changes Made

### 1. i18n Keys Added

**File:** `llm-angular/src/app/core/services/i18n.service.ts`

Added three new translation keys for all 8 languages:

```typescript
'card.hours.open_now_until': string;   // "Open now · until {time}"
'card.hours.closed_opens_at': string;  // "Closed · opens at {time}"
'card.hours.closed_hours': string;     // "Closed · hours: {range}"
```

**Translations:**

- **Hebrew:** `'פתוח עכשיו · עד {time}'`, `'סגור · נפתח ב־{time}'`, `'סגור · שעות: {range}'`
- **English:** `'Open now · until {time}'`, `'Closed · opens at {time}'`, `'Closed · hours: {range}'`
- **Russian:** `'Открыто сейчас · до {time}'`, `'Закрыто · откроется в {time}'`, `'Закрыто · часы: {range}'`
- **Arabic:** `'مفتوح الآن · حتى {time}'`, `'مغلق · يفتح في {time}'`, `'مغلق · ساعات: {range}'`
- **French:** `'Ouvert maintenant · jusqu\'à {time}'`, `'Fermé · ouvre à {time}'`, `'Fermé · horaires: {range}'`
- **Spanish:** `'Abierto ahora · hasta {time}'`, `'Cerrado · abre a las {time}'`, `'Cerrado · horario: {range}'`
- **German:** `'Jetzt geöffnet · bis {time}'`, `'Geschlossen · öffnet um {time}'`, `'Geschlossen · Zeiten: {range}'`
- **Italian:** `'Aperto ora · fino alle {time}'`, `'Chiuso · apre alle {time}'`, `'Chiuso · orari: {range}'`

---

### 2. Helper Function

**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`

Created a pure helper function with no side effects:

```typescript
export function formatOpenStatusLine(params: {
  isOpenNow: boolean | "UNKNOWN" | undefined;
  closeTime: string | null; // HH:mm format
  nextOpenTime: string | null; // HH:mm format
  hoursRange: string | null; // e.g., "09:00–22:00"
  i18nGetText: (key: string, vars?: Record<string, string>) => string;
}): { text: string; tone: "open" | "closed" | "neutral" };
```

**Logic:**

- **UNKNOWN/undefined:** Returns "Hours unverified" with `neutral` tone
- **OPEN:**
  - With closeTime: "Open now · until {time}" with `open` tone
  - Without closeTime: "Open now" with `open` tone
- **CLOSED:**
  - With nextOpenTime: "Closed · opens at {time}" with `closed` tone
  - Without nextOpenTime but with hoursRange: "Closed · hours: {range}" with `closed` tone
  - Without both: "Closed" with `closed` tone

**Edge Cases Handled:**

- Missing closeTime while open → "Open now"
- Missing nextOpenTime while closed → fallback to hoursRange if exists, else "Closed"
- Double spaces / duplicated dots prevented by template structure
- RTL punctuation: uses "·" separator and "ב־" with maqaf in Hebrew

---

### 3. Supporting Methods

**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`

Added two new private methods:

#### `getNextOpenTime(): string | null`

Derives the next opening time for closed restaurants:

- Checks today's periods for later openings
- Falls back to tomorrow's first opening
- Returns formatted time (HH:mm) or null

#### `getTodayHoursRange(): string | null`

Derives today's hours range:

- Only shows if exactly one period for today (unambiguous)
- Returns formatted range (HH:mm–HH:mm) or null

---

### 4. Computed Signal

**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`

Created a computed signal that calls the helper function:

```typescript
readonly statusLine = computed(() => {
  const restaurant = this.restaurant();
  const isOpenNow = restaurant.openNow;
  const closeTime = this.closingTimeToday();
  const nextOpenTime = this.getNextOpenTime();
  const hoursRange = this.getTodayHoursRange();

  return formatOpenStatusLine({
    isOpenNow,
    closeTime,
    nextOpenTime,
    hoursRange,
    i18nGetText: (key, vars) => this.i18n.t(key, vars)
  });
});
```

---

### 5. Template Changes

**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.html`

#### REMOVED (Old multi-line approach):

**From `.restaurant-meta` section:**

```html
@if (getOpenStatus()) {
<span
  class="open-status"
  [class.open]="getOpenStatus() === 'open'"
  [class.closed]="getOpenStatus() === 'closed'"
  [class.unknown]="getOpenStatus() === 'unknown'"
  [attr.aria-label]="getOpenStatusLabel()"
>
  {{ getOpenStatusLabel() }}
</span>
}
```

**From `.restaurant-enhanced-info` section:**

```html
@if (closingTimeToday()) {
<span
  class="open-until"
  [attr.aria-label]="i18n.t('card.hours.open_until', { time: closingTimeToday()! })"
>
  {{ i18n.t('card.hours.open_until', { time: closingTimeToday()! }) }}
</span>
}
```

#### ADDED (New single-line):

**After `.restaurant-address`:**

```html
@if (statusLine().text) {
<div
  class="status-line"
  [class.open]="statusLine().tone === 'open'"
  [class.closed]="statusLine().tone === 'closed'"
  [class.neutral]="statusLine().tone === 'neutral'"
  [attr.aria-label]="statusLine().text"
>
  {{ statusLine().text }}
</div>
}
```

**Location in card structure:**

```
<div class="restaurant-info">
  <div class="restaurant-name-row">...</div>
  <div class="restaurant-meta">...</div>
  <p class="restaurant-address">...</p>
  <div class="status-line">...</div>  ← NEW LOCATION
  <div class="restaurant-enhanced-info">...</div>
</div>
```

---

### 6. SCSS Styles

**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss`

Added new styles for `.status-line`:

```scss
// Single-line status + hours (NEW)
.status-line {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.4;
  margin-top: 0.25rem;

  // RTL-safe: respect parent directionality but keep time values stable
  unicode-bidi: plaintext;

  &.open {
    color: #059669;
  }

  &.closed {
    color: #6b7280;
  }

  &.neutral {
    color: #9ca3af;
    font-style: italic;
  }
}
```

---

## Implementation Contract

✅ **Pure helper function:** `formatOpenStatusLine` is side-effect free  
✅ **No new API calls:** Uses existing data fields  
✅ **No backend changes:** Works with current contracts  
✅ **RTL support:** Uses "·" separator and proper Hebrew punctuation  
✅ **Edge cases handled:** Missing data, UNKNOWN status, ambiguous hours  
✅ **i18n support:** All 8 languages supported  
✅ **CSS classes:** `open`, `closed`, `neutral` tones for styling

---

## Visual Examples

### Open Restaurant (with close time):

```
Hebrew:  פתוח עכשיו · עד 22:00
English: Open now · until 22:00
```

### Open Restaurant (no close time):

```
Hebrew:  פתוח עכשיו
English: Open now
```

### Closed Restaurant (with next opening):

```
Hebrew:  סגור · נפתח ב־08:00
English: Closed · opens at 08:00
```

### Closed Restaurant (with hours range):

```
Hebrew:  סגור · שעות: 09:00–22:00
English: Closed · hours: 09:00–22:00
```

### Closed Restaurant (no additional info):

```
Hebrew:  סגור
English: Closed
```

### Unknown Status:

```
Hebrew:  שעות לא מאומתות
English: Hours unverified
```

---

## Testing Recommendations

1. **Open restaurants:** Verify close time displays correctly
2. **Closed restaurants:** Verify next opening time preference over hours range
3. **Edge cases:** Missing data, UNKNOWN status, ambiguous periods
4. **RTL languages:** Verify Hebrew/Arabic display with proper directionality
5. **All languages:** Verify translations render correctly
6. **Mobile responsive:** Verify single-line fits on small screens

---

## Files Modified

1. `llm-angular/src/app/core/services/i18n.service.ts` (i18n keys)
2. `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts` (logic)
3. `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.html` (template)
4. `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss` (styles)
