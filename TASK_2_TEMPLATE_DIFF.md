# TASK 2 — Template Diff: Single-Line Status Implementation

## Template Changes Overview

The restaurant card template now shows **one consolidated status line** instead of two separate elements.

---

## BEFORE (Old Multi-Line Approach)

### Location 1: In `.restaurant-meta` section (lines 34-57)

```html
<div class="restaurant-meta">
  @if (restaurant().rating) {
  <span class="rating" ...>
    <span class="rating-value">{{ restaurant().rating }}</span>
    @if (restaurant().userRatingsTotal) {
    <span class="rating-count">({{ restaurant().userRatingsTotal }})</span>
    }
  </span>
  } @if (restaurant().priceLevel) {
  <span class="price-level" ...>
    {{ getPriceLevel(restaurant().priceLevel) }}
  </span>
  }

  <!-- ❌ OLD: Separate status badge -->
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
</div>
```

### Location 2: In `.restaurant-enhanced-info` section (lines 61-84)

```html
<!-- Enhanced info line: distance/ETA, near badge, open until -->
<div class="restaurant-enhanced-info">
  @if (distanceInfo()) {
  <span class="distance-eta" ...> ... </span>
  } @if (showNearYouBadge()) {
  <span class="near-you-badge" ...> {{ i18n.t('card.badge.near_you') }} </span>
  }

  <!-- ❌ OLD: Separate "open until" line -->
  @if (closingTimeToday()) {
  <span
    class="open-until"
    [attr.aria-label]="i18n.t('card.hours.open_until', { time: closingTimeToday()! })"
  >
    {{ i18n.t('card.hours.open_until', { time: closingTimeToday()! }) }}
  </span>
  }
</div>
```

---

## AFTER (New Single-Line Approach)

### Location: After `.restaurant-address`, before `.restaurant-enhanced-info`

```html
<div class="restaurant-meta">
  @if (restaurant().rating) {
  <span class="rating" ...>
    <span class="rating-value">{{ restaurant().rating }}</span>
    @if (restaurant().userRatingsTotal) {
    <span class="rating-count">({{ restaurant().userRatingsTotal }})</span>
    }
  </span>
  } @if (restaurant().priceLevel) {
  <span class="price-level" ...>
    {{ getPriceLevel(restaurant().priceLevel) }}
  </span>
  }

  <!-- ✅ Status badge REMOVED from here -->
</div>

<p class="restaurant-address">{{ restaurant().address }}</p>

<!-- ✅ NEW: Single consolidated status line -->
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

<!-- Enhanced info line: distance/ETA, near badge -->
<div class="restaurant-enhanced-info">
  @if (distanceInfo()) {
  <span class="distance-eta" ...> ... </span>
  } @if (showNearYouBadge()) {
  <span class="near-you-badge" ...> {{ i18n.t('card.badge.near_you') }} </span>
  }

  <!-- ✅ "open until" REMOVED from here -->
</div>
```

---

## Card Structure Comparison

### BEFORE (3 locations, 2 different sections):

```
.restaurant-info
├── .restaurant-name-row
├── .restaurant-meta
│   ├── .rating
│   ├── .price-level
│   └── .open-status ← ❌ Status here (inline with meta)
├── .restaurant-address
└── .restaurant-enhanced-info
    ├── .distance-eta
    ├── .near-you-badge
    └── .open-until ← ❌ Hours here (separate line)
```

### AFTER (1 location, dedicated line):

```
.restaurant-info
├── .restaurant-name-row
├── .restaurant-meta
│   ├── .rating
│   └── .price-level ← Status removed from meta
├── .restaurant-address
├── .status-line ← ✅ NEW: Single line with status + hours
└── .restaurant-enhanced-info
    ├── .distance-eta
    └── .near-you-badge ← Hours removed from enhanced info
```

---

## Helper Function Call

The template uses a computed signal that calls the pure helper function:

```typescript
// In component:
readonly statusLine = computed(() => {
  return formatOpenStatusLine({
    isOpenNow: this.restaurant().openNow,
    closeTime: this.closingTimeToday(),
    nextOpenTime: this.getNextOpenTime(),
    hoursRange: this.getTodayHoursRange(),
    i18nGetText: (key, vars) => this.i18n.t(key, vars)
  });
});

// In template:
{{ statusLine().text }}
[class.open]="statusLine().tone === 'open'"
```

---

## Visual Result Examples

### Open Restaurant with Close Time

**Before:**

```
Rating: 4.5 (123)  $  Open now
123 Main St, Tel Aviv
📍 500m  Near you  Open until 22:00
```

**After:**

```
Rating: 4.5 (123)  $
123 Main St, Tel Aviv
Open now · until 22:00
📍 500m  Near you
```

### Closed Restaurant with Next Opening

**Before:**

```
Rating: 4.5 (123)  $  Closed
123 Main St, Tel Aviv
📍 500m  Near you
```

**After:**

```
Rating: 4.5 (123)  $
123 Main St, Tel Aviv
Closed · opens at 08:00
📍 500m  Near you
```

---

## Benefits

✅ **Cleaner layout:** One dedicated line for hours information  
✅ **Better hierarchy:** Status not mixed with rating/price metadata  
✅ **More informative:** Shows both status AND relevant time in one glance  
✅ **RTL-friendly:** Proper Hebrew punctuation (·, ב־) in single line  
✅ **Mobile-optimized:** Single line reduces vertical space  
✅ **Accessible:** Proper aria-label on single element

---

## Lines Removed vs Added

**Removed:** 16 lines (2 separate elements)  
**Added:** 7 lines (1 consolidated element)  
**Net change:** -9 lines (simpler template)
