# UX Signals Model

## Overview

Canonical priority-based signal system for restaurant result cards. Ensures **only ONE signal** is displayed per card, following strict priority rules.

---

## Design Philosophy

**"One Signal Per Card"**

Users should see exactly ONE contextual hint per result. Multiple signals create noise and slow scanning. The signal system automatically selects the highest-priority signal based on clear rules.

---

## Priority Order (Hard Rules)

### 1. OPEN/CLOSED (Priority 1) - **Always Wins**

If `openNow` field exists (true/false), this signal **always** takes precedence.

**Signals:**
- `OPEN_NOW` → "פתוח עכשיו" (Green accent, emphasized)
- `CLOSED_NOW` → "סגור עכשיו" (Light gray, calm)

**Rationale:** Open/closed status is a hard constraint for users. If a place is closed, nothing else matters.

---

### 2. PRICE (Priority 2)

If no open/closed signal exists, show price level.

**Signals:**
- `PRICE_CHEAP` → "$" (priceLevel: 1)
- `PRICE_MID` → "$$" (priceLevel: 2)
- `PRICE_EXPENSIVE` → "$$$" (priceLevel: 3+)

**Color:** Medium gray (#6b7280) - neutral, not accent

**Rationale:** Price is a primary filter for many users.

---

### 3. DISTANCE (Priority 3)

If no open/closed or price signal exists, show nearby indicator.

**Signal:**
- `NEARBY` → "קרוב" (if `distanceMeters < 500`)

**Color:** Medium gray (#6b7280) - neutral

**Rationale:** Proximity is valuable context when other signals are absent.

---

### 4. INTENT_MATCH (Priority 4)

If no higher-priority signal exists, show intent match reason.

**Signal:**
- `INTENT_MATCH` → Custom label (e.g., "Great for breakfast")

**Color:** Medium gray (#6b7280) - neutral

**Rationale:** Helpful context when no other signals apply.

---

## Signal Types

```typescript
export type CardSignalType = 
  | 'OPEN_NOW'        // Priority 1: Currently open
  | 'CLOSED_NOW'      // Priority 1: Currently closed
  | 'PRICE_CHEAP'     // Priority 2: $ (priceLevel 1)
  | 'PRICE_MID'       // Priority 2: $$ (priceLevel 2)
  | 'PRICE_EXPENSIVE' // Priority 2: $$$ (priceLevel 3+)
  | 'NEARBY'          // Priority 3: < 500m distance
  | 'INTENT_MATCH';   // Priority 4: Matches query intent

export interface CardSignal {
  type: CardSignalType;
  priority: 1 | 2 | 3 | 4;
  label: string;      // UI display text
  metadata?: {        // Optional context
    distanceMeters?: number;
    priceLevel?: number;
    matchReason?: string;
  };
}
```

---

## Usage

### 1. Compute Signal

```typescript
import { computeCardSignal } from '@domain/utils/card-signal.util';

const signal = computeCardSignal(restaurant);
// Returns CardSignal | null
```

### 2. Display Signal

```typescript
// In component
readonly cardSignal = computed(() => 
  computeCardSignal(this.restaurant())
);

// In template
@if (cardSignal()) {
<p class="card-signal-text" 
  [class.emphasized]="isCardSignalEmphasized()"
  [style.color]="getCardSignalColor()">
  {{ cardSignal().label }}
</p>
}
```

---

## Examples

### Example 1: Open Restaurant
```typescript
{
  name: "Pizza Place",
  openNow: true,
  priceLevel: 2,
  distanceMeters: 300
}

// Signal: OPEN_NOW
// Label: "פתוח עכשיו"
// Color: #10b981 (green)
// Emphasized: true
```

**Rationale:** Open/closed wins over price and distance.

---

### Example 2: Closed Restaurant
```typescript
{
  name: "Sushi Bar",
  openNow: false,
  priceLevel: 3,
  distanceMeters: 200
}

// Signal: CLOSED_NOW
// Label: "סגור עכשיו"
// Color: #9ca3af (light gray)
// Emphasized: false
```

**Rationale:** Closed status wins over price and distance. Displayed calmly (not alarming red).

---

### Example 3: Price (No Open/Closed Data)
```typescript
{
  name: "Burger Joint",
  openNow: undefined,  // No data
  priceLevel: 1,
  distanceMeters: 800
}

// Signal: PRICE_CHEAP
// Label: "$"
// Color: #6b7280 (medium gray)
// Emphasized: false
```

**Rationale:** No open/closed data → price wins over distance.

---

### Example 4: Nearby (No Open/Closed or Price)
```typescript
{
  name: "Café",
  openNow: undefined,
  priceLevel: undefined,
  distanceMeters: 400
}

// Signal: NEARBY
// Label: "קרוב"
// Color: #6b7280 (medium gray)
// Emphasized: false
```

**Rationale:** No open/closed or price → distance wins.

---

### Example 5: Intent Match (No Other Signals)
```typescript
{
  name: "Breakfast Spot",
  openNow: undefined,
  priceLevel: undefined,
  distanceMeters: 1000,  // > 500m (not nearby)
  matchReason: "Great for breakfast"
}

// Signal: INTENT_MATCH
// Label: "Great for breakfast"
// Color: #6b7280 (medium gray)
// Emphasized: false
```

**Rationale:** No higher-priority signals → show intent match.

---

### Example 6: No Signal
```typescript
{
  name: "Restaurant",
  openNow: undefined,
  priceLevel: undefined,
  distanceMeters: undefined,
  matchReason: undefined
}

// Signal: null
// (No signal displayed)
```

**Rationale:** No applicable signals → show nothing.

---

## Color System

### ONE Accent Color:
```scss
OPEN_NOW: #10b981 (green)
```

### Neutral Colors:
```scss
CLOSED_NOW:      #9ca3af (light gray)
PRICE_*:         #6b7280 (medium gray)
NEARBY:          #6b7280 (medium gray)
INTENT_MATCH:    #6b7280 (medium gray)
```

**Rationale:** Only "open now" is emphasized with green accent. Everything else is neutral gray.

---

## Styling

### Desktop:
```scss
.card-signal-text {
  font-size: 0.8125rem;
  font-weight: 400;
  
  &.emphasized {
    font-weight: 500;  // OPEN_NOW only
  }
}
```

### Mobile:
```scss
.card-signal-text {
  font-size: 0.75rem;
  font-weight: 400;
  
  &.emphasized {
    font-weight: 500;  // OPEN_NOW only
  }
}
```

---

## Implementation Details

### Files:
1. **Domain Model:** `src/app/domain/types/search.types.ts`
   - `CardSignalType` enum
   - `CardSignal` interface

2. **Utility:** `src/app/domain/utils/card-signal.util.ts`
   - `computeCardSignal()` - Compute signal from restaurant
   - `getSignalColor()` - Get color for signal type
   - `isSignalEmphasized()` - Check if signal is emphasized

3. **Component:** `src/app/features/unified-search/components/restaurant-card/`
   - `restaurant-card.component.ts` - Uses computed signal
   - `restaurant-card.component.html` - Displays signal
   - `restaurant-card.component.scss` - Signal styles

---

## Benefits

✅ **Clear hierarchy** - ONE signal per card (no noise)  
✅ **Consistent logic** - Centralized priority rules  
✅ **Easy to maintain** - Add new signals by updating util  
✅ **Type-safe** - Full TypeScript types  
✅ **Testable** - Pure function (no side effects)  
✅ **Translatable** - Labels in one place (future: i18n)  
✅ **Visual polish** - ONE accent color (green for "open")  

---

## Future Enhancements

### Potential New Signals (Priority TBD):
- `DIETARY_MATCH` - "Vegan options" / "Gluten-free"
- `POPULAR` - "Trending now" (if userRatingsTotal > threshold)
- `NEW` - "New restaurant" (if recently opened)
- `VERIFIED` - "Verified by Piza" (if manually verified)

**Process:** Add new signal type → Update `computeCardSignal()` priority logic → Done.

---

## Testing

### Unit Test Examples:

```typescript
describe('computeCardSignal', () => {
  it('should prioritize OPEN_NOW over price', () => {
    const restaurant = {
      openNow: true,
      priceLevel: 3
    };
    const signal = computeCardSignal(restaurant);
    expect(signal?.type).toBe('OPEN_NOW');
  });

  it('should show PRICE_CHEAP when no open/closed data', () => {
    const restaurant = {
      priceLevel: 1
    };
    const signal = computeCardSignal(restaurant);
    expect(signal?.type).toBe('PRICE_CHEAP');
    expect(signal?.label).toBe('$');
  });

  it('should show NEARBY when distance < 500m', () => {
    const restaurant = {
      distanceMeters: 300
    };
    const signal = computeCardSignal(restaurant);
    expect(signal?.type).toBe('NEARBY');
  });

  it('should return null when no signals apply', () => {
    const restaurant = {};
    const signal = computeCardSignal(restaurant);
    expect(signal).toBeNull();
  });
});
```

---

## Migration Notes

### Old Approach:
```html
<!-- Multiple signals shown -->
<p class="open-status-text">{{ getOpenStatusText() }}</p>
<span class="price-level">{{ getPriceLevel() }}</span>
<span class="distance">{{ formatDistance() }}</span>
```

### New Approach:
```html
<!-- ONE signal shown (priority-based) -->
@if (cardSignal()) {
<p class="card-signal-text" 
  [class.emphasized]="isCardSignalEmphasized()"
  [style.color]="getCardSignalColor()">
  {{ cardSignal().label }}
</p>
}
```

**Impact:** Cleaner cards, faster scanning, consistent logic.

---

## Summary

The UX Signals model provides a **canonical, priority-based system** for displaying contextual hints on result cards. By enforcing **ONE signal per card** and clear priority rules, we ensure users can quickly scan results without cognitive overload.

**Priority Order:**
1. **OPEN/CLOSED** (hard rule - always wins)
2. **PRICE** (cheap/mid/expensive)
3. **DISTANCE** (nearby)
4. **INTENT_MATCH** (e.g., "Great for breakfast")

**Color System:**
- ONE accent color: Green (#10b981) for "פתוח עכשיו"
- Neutral grays: Everything else

**Implementation:**
- Domain model: `search.types.ts`
- Utility: `card-signal.util.ts`
- Component: `restaurant-card`
