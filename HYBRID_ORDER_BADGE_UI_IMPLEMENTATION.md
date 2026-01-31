# Hybrid Order Badge UI Implementation - Summary

## Problem

The UI was showing a static "Order: Balanced" badge that didn't reflect which hybrid ordering rules were applied. Users couldn't see whether results were sorted by proximity, quality, budget, or other factors.

## Solution

Updated the UI to display dynamic hybrid order metadata with reason codes:

- Backend now includes `reasonCodes` in `response.meta.order`
- Frontend computes user-friendly badge text (e.g., "Hybrid · Nearby+OpenNow")
- Badge updates per-requestId (no stale state)
- Existing weights row remains unchanged

---

## Files Modified

### Backend (1 file)

**1. `server/src/services/search/route2/orchestrator.response.ts`**

Added `reasonCodes` to both main response and early exit response:

```diff
  // Convert to response format (profile name for compatibility)
  const orderMetadata = {
    profile: hybridOrderMetadata.base as 'balanced',
    weights: hybridOrderMetadata.weights,
+   reasonCodes: hybridOrderMetadata.reasonCodes // NEW: Include reason codes for UI display
  };
```

```diff
  const defaultOrderMetadata = {
    profile: hybridOrderMetadata.base as 'balanced',
    weights: hybridOrderMetadata.weights,
+   reasonCodes: hybridOrderMetadata.reasonCodes // NEW: Include reason codes for UI
  };
```

**What it does:**

- Passes `reasonCodes` array from hybrid weights resolution to response
- Ensures UI always has reason codes (even for early exits)
- Example: `["BASE_BALANCED", "RULE_A_DISTANCE", "RULE_B_OPEN_NOW"]`

---

### Frontend (3 files)

**2. `llm-angular/src/app/domain/types/search.types.ts`**

Added `reasonCodes` to `order` metadata type:

```diff
  // Order profile (NEW: hybrid deterministic ranking with reason codes)
  order?: {
    profile: 'balanced' | 'nearby' | 'quality' | 'budget' | ...;
    weights: {
      rating: number;      // 0-100
      reviews: number;     // 0-100
      price: number;       // 0-100
      openNow: number;     // 0-100
      distance: number;    // 0-100
    };
+   reasonCodes?: string[]; // NEW: Reason codes explaining which rules were applied
  };
```

**3. `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`**

Added `hybridBadgeText` computed signal:

```typescript
// NEW: Hybrid badge text with reason codes
readonly hybridBadgeText = computed(() => {
  const order = this.orderProfile();
  if (!order || !order.reasonCodes || order.reasonCodes.length === 0) {
    return 'Hybrid'; // Fallback if no reason codes
  }

  // Extract meaningful labels from reason codes
  const reasonLabels: string[] = [];

  for (const code of order.reasonCodes) {
    if (code === 'BASE_BALANCED') continue; // Skip base, it's implicit

    // Map reason codes to user-friendly labels
    if (code === 'RULE_A_DISTANCE') reasonLabels.push('Nearby');
    else if (code === 'RULE_B_OPEN_NOW') reasonLabels.push('OpenNow');
    else if (code === 'RULE_C_BUDGET') reasonLabels.push('Budget');
    else if (code === 'RULE_D_QUALITY') reasonLabels.push('Quality');
    else reasonLabels.push(code); // Fallback: use raw code
  }

  // Build badge text: "Hybrid" or "Hybrid · Nearby+OpenNow"
  if (reasonLabels.length === 0) {
    return 'Hybrid';
  } else {
    return `Hybrid · ${reasonLabels.join('+')}`;
  }
});
```

**What it does:**

- Maps backend reason codes to user-friendly labels
- Skips `BASE_BALANCED` (implicit)
- Joins multiple rules with `+` (e.g., "Nearby+OpenNow")
- Reactive: updates automatically when response changes

**4. `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`**

Updated badge to use `hybridBadgeText()`:

```diff
  <div class="order-explain-header">
    <span class="order-label">Order:</span>
-   <span class="order-profile">{{ orderProfileName() }}</span>
+   <span class="order-profile">{{ hybridBadgeText() }}</span>
    <!-- DEV-ONLY: Debug info -->
    @if (orderDebugInfo()) {
      <span class="order-debug" title="Debug: ...">⚙️</span>
    }
  </div>
```

---

## Badge Examples

### Example 1: Base Query (No Special Rules)

**Query:** "מסעדות איטלקיות בגדרה" (Italian restaurants)

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED"]
}
```

**UI Badge:**

```
Order: Hybrid
⭐ 25%  💬 20%  💰 15%  🟢 15%  📍 25%
```

### Example 2: Proximity Query

**Query:** "restaurants near me"

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED", "RULE_A_DISTANCE"]
}
```

**UI Badge:**

```
Order: Hybrid · Nearby
⭐ 15%  💬 10%  💰 10%  🟢 20%  📍 45%
```

### Example 3: Open Now Query

**Query:** "פתוח עכשיו" (open now)

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED", "RULE_B_OPEN_NOW"]
}
```

**UI Badge:**

```
Order: Hybrid · OpenNow
⭐ 15%  💬 10%  💰 5%  🟢 35%  📍 35%
```

### Example 4: Romantic Query

**Query:** "מסעדות רומנטיות" (romantic restaurants)

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED", "RULE_D_QUALITY"]
}
```

**UI Badge:**

```
Order: Hybrid · Quality
⭐ 40%  💬 35%  💰 5%  🟢 10%  📍 10%
```

### Example 5: Cheap Query

**Query:** "cheap restaurants"

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED", "RULE_C_BUDGET"]
}
```

**UI Badge:**

```
Order: Hybrid · Budget
⭐ 15%  💬 15%  💰 35%  🟢 5%  📍 30%
```

### Example 6: Multiple Rules

**Query:** "cheap restaurants near me open now"

**Backend:**

```json
{
  "reasonCodes": [
    "BASE_BALANCED",
    "RULE_A_DISTANCE",
    "RULE_B_OPEN_NOW",
    "RULE_C_BUDGET"
  ]
}
```

**UI Badge:**

```
Order: Hybrid · Nearby+OpenNow+Budget
⭐ 5%  💬 10%  💰 25%  🟢 35%  📍 50%
```

_(Note: Actual weights clamped to [5, 50] and normalized)_

---

## Verification Steps

### Setup

1. **Start Backend:**

   ```bash
   cd server
   npm run dev
   ```

2. **Start Frontend:**

   ```bash
   cd llm-angular
   ng serve
   ```

3. **Open Browser:**
   Navigate to `http://localhost:4200`

---

### Test Case 1: Near Me Query

**Query:** "restaurants near me" (with location enabled)

**Expected UI Badge:**

```
Order: Hybrid · Nearby
```

**Expected Weights:**

- 📍 Distance: ~40-50% (highest)
- 🟢 OpenNow: ~15-25%
- ⭐ Rating: ~10-20%
- Others: lower

**Verification:**

1. Search for "restaurants near me"
2. Check badge shows "Hybrid · Nearby"
3. Verify distance weight is highest in weight chips
4. Hover over ⚙️ to see debug info (should show `preset=balanced`)

**Backend Log Check:**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected Log:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": ["BASE_BALANCED", "RULE_A_DISTANCE"],
  "weights": {
    "distance": 45,
    "openNow": 20,
    "rating": 15,
    "reviews": 10,
    "price": 10
  }
}
```

---

### Test Case 2: Open Now Query

**Query:** "מסעדות פתוח עכשיו" (restaurants open now)

**Expected UI Badge:**

```
Order: Hybrid · OpenNow
```

**Expected Weights:**

- 🟢 OpenNow: ~30-40% (highest)
- 📍 Distance: ~30-40%
- ⭐ Rating: ~10-20%
- Others: lower

**Verification:**

1. Search for "מסעדות פתוח עכשיו"
2. Check badge shows "Hybrid · OpenNow"
3. Verify openNow weight is highest or second-highest
4. Hover over ⚙️ to confirm requestId matches this search

**Backend Log Check:**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected Log:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": ["BASE_BALANCED", "RULE_B_OPEN_NOW"],
  "ctx": {
    "openNowRequested": true,
    "distanceIntent": false
  }
}
```

---

### Test Case 3: Romantic Query

**Query:** "מסעדות רומנטיות בתל אביב" (romantic restaurants in Tel Aviv)

**Expected UI Badge:**

```
Order: Hybrid · Quality
```

**Expected Weights:**

- ⭐ Rating: ~35-45% (highest)
- 💬 Reviews: ~30-40%
- Others: much lower (~5-15%)

**Verification:**

1. Search for "מסעדות רומנטיות בתל אביב"
2. Check badge shows "Hybrid · Quality"
3. Verify rating and reviews weights are dominant
4. Price/distance/openNow should be minimal

**Backend Log Check:**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected Log:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": ["BASE_BALANCED", "RULE_D_QUALITY"],
  "ctx": {
    "qualityIntent": true,
    "occasion": "romantic"
  },
  "weights": {
    "rating": 40,
    "reviews": 35,
    "price": 5,
    "openNow": 10,
    "distance": 10
  }
}
```

---

### Test Case 4: Cheap Query

**Query:** "cheap restaurants" or "מסעדות זולות"

**Expected UI Badge:**

```
Order: Hybrid · Budget
```

**Expected Weights:**

- 💰 Price: ~30-40% (highest)
- 📍 Distance: ~25-35%
- Others: lower

**Verification:**

1. Search for "cheap restaurants"
2. Check badge shows "Hybrid · Budget"
3. Verify price weight is highest
4. Distance should be second-highest (budget queries often care about proximity)

**Backend Log Check:**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected Log:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": ["BASE_BALANCED", "RULE_C_BUDGET"],
  "ctx": {
    "priceIntent": "cheap"
  },
  "weights": {
    "price": 35,
    "distance": 30,
    "rating": 15,
    "reviews": 15,
    "openNow": 5
  }
}
```

---

### Test Case 5: Multiple Rules

**Query:** "cheap restaurants near me open now"

**Expected UI Badge:**

```
Order: Hybrid · Nearby+OpenNow+Budget
```

**Expected Weights:**

- Multiple factors boosted
- Distance, OpenNow, and Price should all be elevated
- Rating/Reviews should be lower

**Verification:**

1. Search for "cheap restaurants near me open now"
2. Check badge shows "Hybrid · Nearby+OpenNow+Budget" (or similar combination)
3. Verify multiple weights are elevated (not just one dominant factor)
4. Check that weights still sum to 100% and stay within [5%, 50%] bounds

**Backend Log Check:**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected Log:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": [
    "BASE_BALANCED",
    "RULE_A_DISTANCE",
    "RULE_B_OPEN_NOW",
    "RULE_C_BUDGET"
  ],
  "ctx": {
    "distanceIntent": true,
    "openNowRequested": true,
    "priceIntent": "cheap",
    "hasUserLocation": true
  }
}
```

---

## State Management (Per-RequestId)

### How State is Managed

**Frontend:**

- `orderProfile` is a computed signal that reads from `this.response()?.meta?.order`
- `hybridBadgeText` is computed from `orderProfile()`
- Both automatically update when `response()` changes
- Angular signals ensure no stale state

**Backend:**

- Each request generates a unique `requestId`
- Response includes `requestId` + `meta.order.reasonCodes`
- JobStore caches order metadata per `requestId` for load-more consistency

**Load-More Consistency:**

- Load-more requests reuse the same `requestId`
- JobStore returns cached order metadata
- UI badge remains consistent across pagination

### Verification

**Test: Load More Consistency**

1. Search for "romantic restaurants" → Badge shows "Hybrid · Quality"
2. Scroll to bottom and click "Load More"
3. **Expected:** Badge still shows "Hybrid · Quality" (not changed)
4. **Expected:** Weights remain the same (40/35/5/10/10)

**Test: New Search Clears State**

1. Search for "romantic restaurants" → Badge shows "Hybrid · Quality"
2. Search for "cheap near me" → Badge should change to "Hybrid · Nearby+Budget"
3. **Expected:** Badge updates immediately (no stale "Quality" text)
4. **Expected:** Weights update to reflect new search

---

## Edge Cases

### Edge Case 1: Missing ReasonCodes

**Scenario:** Backend doesn't send `reasonCodes` (e.g., cached old response)

**Expected Behavior:**

- Badge shows "Hybrid" (fallback)
- Weights still display correctly
- No errors in console

**Code:**

```typescript
if (!order || !order.reasonCodes || order.reasonCodes.length === 0) {
  return "Hybrid"; // Fallback
}
```

### Edge Case 2: Only BASE_BALANCED

**Scenario:** No special rules applied, only base weights

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED"]
}
```

**Expected UI:**

- Badge shows "Hybrid" (not "Hybrid · BASE_BALANCED")
- Weights show base values: 25/20/15/15/25

**Code:**

```typescript
for (const code of order.reasonCodes) {
  if (code === "BASE_BALANCED") continue; // Skip base
  // ...
}
```

### Edge Case 3: Unknown Reason Code

**Scenario:** Backend sends a new reason code not yet mapped in frontend

**Backend:**

```json
{
  "reasonCodes": ["BASE_BALANCED", "RULE_E_NEW_FEATURE"]
}
```

**Expected UI:**

- Badge shows "Hybrid · RULE_E_NEW_FEATURE" (raw code as fallback)
- No errors
- Weights still display correctly

**Code:**

```typescript
else reasonLabels.push(code); // Fallback: use raw code
```

---

## Browser DevTools Verification

### Response Inspection

**Open DevTools:**

1. Network tab → Filter: XHR
2. Search for "romantic restaurants"
3. Find `/api/v1/search` or `/api/v1/search/results/{requestId}` call
4. Check Response JSON

**Expected Response Structure:**

```json
{
  "requestId": "abc123...",
  "meta": {
    "order": {
      "profile": "balanced",
      "weights": {
        "rating": 40,
        "reviews": 35,
        "price": 5,
        "openNow": 10,
        "distance": 10
      },
      "reasonCodes": ["BASE_BALANCED", "RULE_D_QUALITY"]
    }
  }
}
```

### Console Verification

**Open Console:**

```javascript
// Get current response
const response = window["ng"]
  ?.getComponent(document.querySelector("app-search-page"))
  ?.response();

// Check order metadata
console.log("Order profile:", response?.meta?.order?.profile);
console.log("Reason codes:", response?.meta?.order?.reasonCodes);
console.log("Weights:", response?.meta?.order?.weights);

// Check badge text
const component = window["ng"]?.getComponent(
  document.querySelector("app-search-page")
);
console.log("Badge text:", component?.hybridBadgeText());
```

---

## Summary

### What Changed

**Backend:**

- ✅ `orchestrator.response.ts` now includes `reasonCodes` in `response.meta.order`
- ✅ Both main response and early exit response include reason codes

**Frontend:**

- ✅ Types updated: `order.reasonCodes?: string[]`
- ✅ New computed signal: `hybridBadgeText()` maps reason codes to labels
- ✅ Template updated: Badge shows `{{ hybridBadgeText() }}` instead of static profile name
- ✅ Styling: No changes needed (existing styles apply)

### Badge Display Examples

| Query                  | Badge Text                     | Dominant Weights                      |
| ---------------------- | ------------------------------ | ------------------------------------- |
| Italian restaurants    | Hybrid                         | Rating 25%, Reviews 20%, Distance 25% |
| Near me                | Hybrid · Nearby                | Distance 45%, OpenNow 20%             |
| Open now               | Hybrid · OpenNow               | OpenNow 35%, Distance 35%             |
| Romantic               | Hybrid · Quality               | Rating 40%, Reviews 35%               |
| Cheap                  | Hybrid · Budget                | Price 35%, Distance 30%               |
| Cheap near me open now | Hybrid · Nearby+OpenNow+Budget | Multiple elevated                     |

### State Management

- ✅ Per-requestId: Badge updates when response changes
- ✅ No stale state: Angular signals ensure reactivity
- ✅ Load-more consistency: JobStore caches order metadata
- ✅ Edge cases handled: Missing reasonCodes, unknown codes, BASE_BALANCED filtering

The UI now clearly communicates which ordering rules are active! 🎉
