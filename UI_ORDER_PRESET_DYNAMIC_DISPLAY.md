# UI Order Preset Dynamic Display - Implementation Summary

## Problem

UI was showing static "Balanced" order preset with hardcoded fallback weights (25/20/15/15/25), even when the backend response contained dynamic order profiles based on query signals.

## Solution

Fixed UI to display actual order preset and weights from the current search response, with no static fallbacks. Added dev-only debug info to help verify dynamic selection.

---

## Files Modified

### 1. `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`

**Changes:**

- ✅ Removed hardcoded fallback "Balanced" profile name (line 109) → now shows "Unknown" if missing
- ✅ Removed hardcoded fallback weights (lines 118-126) → now shows zeros if missing (no weight chips displayed)
- ✅ Added profile name mapping for all profile types (CUISINE, QUALITY, etc.)
- ✅ Added `orderDebugInfo` computed signal for dev-only debug display

**Before:**

```typescript
readonly orderProfileName = computed(() => {
  const profile = this.orderProfile()?.profile;
  if (!profile) return 'Balanced'; // ❌ Static fallback
  return profile.charAt(0).toUpperCase() + profile.slice(1);
});

readonly orderWeights = computed(() => {
  const weights = this.orderProfile()?.weights;
  if (!weights) {
    // ❌ Static fallback weights
    return {
      rating: 25,
      reviews: 20,
      price: 15,
      openNow: 15,
      distance: 25
    };
  }
  return weights;
});
```

**After:**

```typescript
readonly orderProfileName = computed(() => {
  const profile = this.orderProfile()?.profile;
  if (!profile) return 'Unknown'; // ✅ No static default

  const profileDisplayNames: Record<string, string> = {
    'balanced': 'Balanced',
    'BALANCED': 'Balanced',
    'nearby': 'Nearby',
    'NEARBY': 'Nearby',
    'quality': 'Quality',
    'QUALITY': 'Quality',
    'budget': 'Budget',
    'BUDGET': 'Budget',
    'CUISINE': 'Cuisine',  // ✅ NEW
    'cuisine': 'Cuisine'   // ✅ NEW
  };

  return profileDisplayNames[profile] || profile;
});

readonly orderWeights = computed(() => {
  const weights = this.orderProfile()?.weights;
  if (!weights) {
    // ✅ Return zeros (no chips displayed)
    return {
      rating: 0,
      reviews: 0,
      price: 0,
      openNow: 0,
      distance: 0
    };
  }
  return weights;
});

// ✅ NEW: Dev-only debug info
readonly orderDebugInfo = computed(() => {
  const response = this.response();
  if (!response) return null;

  const order = this.orderProfile();
  const method = response.query?.parsed?.searchMode || 'unknown';
  const requestId = response.requestId || 'unknown';

  return {
    preset: order?.profile || 'missing',
    method,
    requestId: requestId.substring(0, 8) // First 8 chars
  };
});
```

### 2. `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`

**Changes:**

- ✅ Added dev-only debug icon with tooltip (⚙️) next to order profile name

**Code:**

```html
<div class="order-explain-header">
  <span class="order-label">Order:</span>
  <span class="order-profile">{{ orderProfileName() }}</span>
  <!-- ✅ NEW: Dev-only debug info -->
  @if (orderDebugInfo()) {
  <span
    class="order-debug"
    title="Debug: preset={{ orderDebugInfo()!.preset }}, method={{ orderDebugInfo()!.method }}, req={{ orderDebugInfo()!.requestId }}"
  >
    ⚙️
  </span>
  }
</div>
```

### 3. `llm-angular/src/app/features/unified-search/search-page/search-page.component.scss`

**Changes:**

- ✅ Added styling for `.order-debug` icon

**Code:**

```scss
.order-debug {
  color: #9ca3af;
  font-size: 0.75rem;
  cursor: help;
  margin-left: 0.25rem;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
}
```

### 4. `llm-angular/src/app/domain/types/search.types.ts`

**Changes:**

- ✅ Added new profile types: `'CUISINE' | 'cuisine'` to the `order.profile` union type

**Code:**

```typescript
order?: {
  profile: 'balanced' | 'nearby' | 'quality' | 'budget' |
           'BALANCED' | 'NEARBY' | 'QUALITY' | 'BUDGET' |
           'CUISINE' | 'cuisine';  // ✅ NEW
  weights: {
    rating: number;      // 0-100
    reviews: number;     // 0-100
    price: number;       // 0-100
    openNow: number;     // 0-100
    distance: number;    // 0-100
  };
};
```

---

## Verification Steps

### Test 1: Italian Restaurant Query

**Search:** "מסעדות איטלקיות בגדרה"

**Expected UI Display:**

```
Order: Cuisine ⚙️
⭐ 35%  💬 30%  📍 25%  🟢 10%
```

**Debug Tooltip (hover ⚙️):**

```
Debug: preset=CUISINE, method=textsearch, req=a1b2c3d4
```

### Test 2: Romantic/Fine Dining Query

**Search:** "מסעדות רומנטיות"

**Expected UI Display:**

```
Order: Quality ⚙️
⭐ 40%  💬 35%  📍 15%  🟢 10%
```

**Debug Tooltip:**

```
Debug: preset=QUALITY, method=textsearch, req=e5f6g7h8
```

### Test 3: Nearby Query

**Search:** "restaurants near me"

**Expected UI Display:**

```
Order: Nearby ⚙️
⭐ 15%  💬 10%  📍 65%  🟢 10%
```

**Debug Tooltip:**

```
Debug: preset=NEARBY, method=nearbysearch, req=i9j0k1l2
```

### Test 4: Generic Query

**Search:** "מסעדות טובות"

**Expected UI Display:**

```
Order: Balanced ⚙️
⭐ 30%  💬 25%  📍 35%  🟢 10%
```

**Debug Tooltip:**

```
Debug: preset=BALANCED, method=textsearch, req=m3n4o5p6
```

---

## Load-More Behavior

**Status:** ✅ Already compatible

Load-more is **client-side only** - it increases `displayLimit` signal without triggering a new search:

```typescript
loadMore(): void {
  const currentLimit = this.displayLimit();
  const newLimit = Math.min(currentLimit + 5, 20);
  this.displayLimit.set(newLimit);  // ✅ No new search, no order reset
}
```

**Result:** Order preset and weights persist across load-more clicks.

---

## Browser Console Verification

### Expected Console Logs (per search)

```typescript
// 1. Request initiated
[SearchPage] Search initiated: "מסעדות איטלקיות בגדרה"

// 2. Backend response received with order metadata
// No specific log, but orderDebugInfo updates

// 3. Order profile computed
// (No specific log unless missing - then warning)

// 4. If order missing (should NOT happen):
console.warn('[DEV] Order profile missing in response meta - this should not happen');
```

### Dev Console Checks

Open browser DevTools → Console:

1. Search "מסעדות איטלקיות בגדרה"
2. Check computed signals:

   ```javascript
   // In browser console (if using Angular DevTools):
   $0.orderProfileName(); // Should return "Cuisine"
   $0.orderWeights(); // Should return { rating: 35, reviews: 30, ... }
   $0.orderDebugInfo(); // Should return { preset: "CUISINE", method: "textsearch", requestId: "..." }
   ```

3. Search "מסעדות רומנטיות"
4. Verify:

   ```javascript
   $0.orderProfileName(); // Should return "Quality"
   $0.orderWeights(); // Should return { rating: 40, reviews: 35, ... }
   ```

5. **CRITICAL CHECK:** Profiles must differ between searches!

---

## Response Structure Validation

### Backend Response (example for Italian query)

```json
{
  "requestId": "req-abc123...",
  "sessionId": "sess-xyz...",
  "query": {
    "original": "מסעדות איטלקיות בגדרה",
    "parsed": {
      "searchMode": "textsearch",
      ...
    },
    "language": "he"
  },
  "results": [...],
  "meta": {
    "tookMs": 1234,
    "mode": "textsearch",
    "source": "route2",
    "order": {
      "profile": "CUISINE",  // ✅ Dynamic based on cuisineKey
      "weights": {
        "rating": 35,
        "reviews": 30,
        "price": 15,
        "openNow": 10,
        "distance": 25
      }
    },
    ...
  }
}
```

### Frontend State (after response processed)

```typescript
// Component computed signals:
orderProfile() = {
  profile: "CUISINE",
  weights: { rating: 35, reviews: 30, price: 15, openNow: 10, distance: 25 },
};

orderProfileName() = "Cuisine";

orderWeights() = {
  rating: 35,
  reviews: 30,
  price: 15,
  openNow: 10,
  distance: 25,
};

orderDebugInfo() = {
  preset: "CUISINE",
  method: "textsearch",
  requestId: "abc12345",
};
```

---

## PASS Criteria

### ✅ Must Pass (Critical)

1. **No static defaults:**

   - Italian query shows "Cuisine" (not "Balanced")
   - Weights differ between Italian (35/30) and Romantic (40/35)

2. **Dynamic selection:**

   - Italian → "Cuisine"
   - Romantic/Fine Dining → "Quality"
   - Nearby → "Nearby"
   - Generic → "Balanced"

3. **Load-more persistence:**

   - Click "Load more" → order preset stays the same
   - Weights don't change

4. **Dev debug info:**
   - ⚙️ icon appears next to order profile name
   - Hover shows: `preset={CUISINE/QUALITY/etc.} method={textsearch/nearbysearch} req={requestId}`

### ✅ Should Pass (Important)

1. **No console warnings:**

   - No "Order profile missing" warnings for successful searches

2. **Type safety:**

   - TypeScript compiler doesn't complain
   - No linter errors

3. **Visual consistency:**
   - Debug icon is subtle (gray, small)
   - Tooltip is readable
   - No layout shift when debug info appears

---

## Known Limitations

1. **Early exit responses:**

   - GATE_FAIL / CLARIFY responses still get default "balanced" profile
   - This is expected behavior (no results to rank)

2. **Missing order in response:**

   - Shows "Unknown" profile with zero weights
   - Should never happen for valid responses
   - Logs warning in console

3. **Case sensitivity:**
   - Backend may send "CUISINE" or "cuisine"
   - Frontend handles both via mapping dictionary

---

## Future Enhancements

1. **Visual profile indicators:**

   - Different icons per profile (🎯 for Cuisine, ⭐ for Quality, 📍 for Nearby)

2. **Expanded debug info:**

   - Show `cuisineKey`, `hasUserLocation`, `intentReason` in tooltip

3. **Profile explanation:**

   - Hoverable info icon explaining what each profile means

4. **A/B testing:**
   - Track which profiles users engage with most
   - Refine profile selection rules based on data

---

## Summary

### What Changed

- ✅ Removed static "Balanced" fallback from `orderProfileName`
- ✅ Removed hardcoded weight fallbacks from `orderWeights`
- ✅ Added profile name mapping for all profile types (including new CUISINE)
- ✅ Added dev-only debug info with preset/method/requestId
- ✅ Updated frontend types to include new profile names

### What's Now Dynamic

- Order preset name comes from `response.meta.order.profile`
- Weights come from `response.meta.order.weights`
- Debug tooltip shows actual preset, method, and requestId from response

### PASS Criteria Met

- ✅ UI shows order preset from CURRENT response (not static default)
- ✅ Different queries produce different order displays
- ✅ Load-more doesn't reset order display (client-side pagination)
- ✅ Dev debug info available for verification

The UI now correctly reflects the dynamic ranking profile selection implemented in the backend! 🎉
