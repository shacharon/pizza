# Budget Filter Implementation

## Status
✅ **COMPLETE** — Budget filtering now works correctly per SEARCH_POOL_PAGINATION_RULES.md

---

## Problem (Before)

When user clicked **Budget (💰)** chip:
- ❌ Chip became "active" visually
- ❌ NO filtering happened
- ❌ All restaurants still showed
- ❌ TODO comment: `// TODO: Apply filters and re-search`

**Why it was broken:**
- Frontend only updated visual state
- No API call was triggered
- Violated pool rules (tried to filter client-side)

---

## Solution (After)

### ✅ Core Principle (from SEARCH_POOL_PAGINATION_RULES.md)

> **Filter changes MUST create a new pool via re-search**

When user clicks Budget chip:
1. Parse chip filter string (`"price<=2"` → `priceLevel: 2`)
2. Re-search with new filter (creates **new pool**)
3. Backend fetches candidates with `maxprice=2` from Google API
4. Backend ranks entire new pool
5. Return first page of new pool

---

## Implementation Details

### Frontend: `search.facade.ts`

#### 1. Updated `onChipClick()` Method

**Before:**
```typescript
case 'filter':
  filters.add(chipId);
  this.filterState.set(filters);
  // TODO: Apply filters and re-search  ❌
  break;
```

**After:**
```typescript
case 'filter':
  // Toggle filter state
  const filters = new Set(this.filterState());
  const isRemoving = filters.has(chipId);
  
  if (isRemoving) {
    filters.delete(chipId);
  } else {
    filters.add(chipId);
  }
  
  this.filterState.set(filters);
  
  // Parse all active filters into SearchFilters
  const searchFilters = this.buildSearchFilters(filters);
  console.log('[SearchFacade] 🔄 Re-searching with filters:', searchFilters);
  
  // Re-search creates a new pool (per pool rules) ✅
  this.search(currentQuery, searchFilters);
  break;
```

---

#### 2. New Method: `buildSearchFilters()`

Parses chip filter strings into `SearchFilters`:

```typescript
private buildSearchFilters(activeFilterIds: Set<string>): SearchFilters {
  const filters: SearchFilters = {};
  const allChips = this.chips();

  for (const chipId of activeFilterIds) {
    const chip = allChips.find(c => c.id === chipId);
    if (!chip || chip.action !== 'filter') continue;

    const filterStr = chip.filter || '';

    // Parse filter string
    if (filterStr === 'opennow') {
      filters.openNow = true;
    } else if (filterStr === 'closednow') {
      filters.openNow = false;
    } else if (filterStr.startsWith('price<=')) {
      // Parse "price<=2" → priceLevel: 2
      const maxPrice = parseInt(filterStr.replace('price<=', ''), 10);
      if (!isNaN(maxPrice) && maxPrice >= 1 && maxPrice <= 4) {
        filters.priceLevel = maxPrice;  // ✅
      }
    } else if (filterStr === 'delivery') {
      filters.mustHave = filters.mustHave || [];
      filters.mustHave.push('delivery');
    } else if (filterStr === 'kosher' || filterStr === 'vegan' || filterStr === 'glutenfree') {
      filters.dietary = filters.dietary || [];
      filters.dietary.push(filterStr);
    }
  }

  return filters;
}
```

**Supported Filter Strings:**
| Chip Filter String | Parsed To | Example |
|--------------------|-----------|---------|
| `"price<=2"` | `priceLevel: 2` | Budget chip (€€ max) |
| `"opennow"` | `openNow: true` | Open now chip |
| `"closednow"` | `openNow: false` | Closed now chip |
| `"delivery"` | `mustHave: ['delivery']` | Delivery chip |
| `"vegan"` | `dietary: ['vegan']` | Vegan chip |
| `"kosher"` | `dietary: ['kosher']` | Kosher chip |

---

### Backend: Already Implemented ✅

#### 1. `SearchParams` Type (search.types.ts)

```typescript
export interface SearchParams {
  query: string;
  location: Coordinates;
  filters: {
    openNow?: boolean;
    priceLevel?: number;  // ✅ Already exists
    dietary?: string[];
    mustHave?: string[];
  };
  // ...
}
```

---

#### 2. `SearchOrchestrator` (search.orchestrator.ts)

```typescript
// Line 415-416: Extract priceLevel from request or intent
const priceLevel = request.filters?.priceLevel ?? intent.filters.priceLevel;
if (priceLevel !== undefined) filters.priceLevel = priceLevel;

// Line 446-454: Pass filters to places provider
const searchParams: SearchParams = {
  query: queryForGoogle,
  location: location.coords,
  filters,  // ✅ Includes priceLevel
  // ...
};
```

---

#### 3. `PlacesProviderService` (places-provider.service.ts)

```typescript
// Line 142: Convert priceLevel to priceMax for Google API
searchParams.priceMax = params.filters.priceLevel;

// Line 163: For nearbysearch mode
searchParams.priceMax = params.filters.priceLevel;
```

---

#### 4. `GooglePlacesClient` (google-places.client.ts)

```typescript
// Line 57 & 81: Send maxprice to Google Places API
if (params.priceMax != null) {
  url.searchParams.set('maxprice', String(params.priceMax));
}
```

**Google Places API:**
- `maxprice`: 0-4 (filters out restaurants above this price level)
- ✅ Fully supported by backend

---

## User Flow (Complete)

### Example: "pizza in tel aviv" → Budget Filter

#### Step 1: Initial Search
```
User types: "pizza in tel aviv"
↓
Frontend: facade.search("pizza in tel aviv")
↓
Backend: Fetch 30 candidates, rank all, return top 10
↓
Response: 10 restaurants (mix of €, €€, €€€, €€€€)
Chips: [💰 Budget] [⭐ Top rated] [🟢 Open now]
```

#### Step 2: User Clicks Budget Chip
```
User clicks: 💰 Budget chip
↓
Frontend: onChipClick('budget')
  → Parse filter: "price<=2" → { priceLevel: 2 }
  → Re-search: facade.search("pizza in tel aviv", { priceLevel: 2 })
↓
Backend: Fetch 30 candidates WITH maxprice=2, rank all, return top 10
↓
Response: 10 restaurants (only € and €€)
Chips: [💰 Budget ✅] [⭐ Top rated] [🟢 Open now]
Assistant: "Found 10 budget-friendly options"
```

**Key Point:**
- New pool created (30 candidates, all ≤ €€)
- New ranking computed
- New assistant message generated
- Pagination works correctly (page 2 shows results 11-20 from same pool)

---

#### Step 3: User Removes Budget Filter
```
User clicks: 💰 Budget chip again (to deactivate)
↓
Frontend: onChipClick('budget')
  → Parse filters: {} (empty)
  → Re-search: facade.search("pizza in tel aviv", {})
↓
Backend: Fetch 30 candidates WITHOUT maxprice, rank all, return top 10
↓
Response: 10 restaurants (all price levels)
Chips: [💰 Budget] [⭐ Top rated] [🟢 Open now]
Assistant: "Found 10 restaurants"
```

**Key Point:**
- Another new pool created (back to unfiltered)
- Returns to original search state

---

## Pool Lifecycle (Critical)

Per `SEARCH_POOL_PAGINATION_RULES.md`:

### When New Pool Is Created ✅
- User types new query
- User clicks filter chip (budget, open now, etc.)
- User removes filter chip
- User changes location

### When Pool Is Reused (Pagination) ✅
- User clicks page 2, 3, 4
- User scrolls within same results
- UI re-renders

---

## Testing

### Manual Test Cases

**Test 1: Budget Filter Activates**
1. Search: "pizza in tel aviv"
2. Click: Budget (💰) chip
3. ✅ Verify: Only € and €€ restaurants show
4. ✅ Verify: New API call in network tab
5. ✅ Verify: Assistant message updates

**Test 2: Budget Filter Deactivates**
1. (From Test 1 state)
2. Click: Budget (💰) chip again
3. ✅ Verify: All price levels return
4. ✅ Verify: New API call in network tab
5. ✅ Verify: Assistant message updates

**Test 3: Multiple Filters**
1. Search: "pizza in tel aviv"
2. Click: Budget (💰) chip
3. Click: Open now (🟢) chip
4. ✅ Verify: Only open € and €€ restaurants show
5. ✅ Verify: Filters combined correctly

**Test 4: Pagination Consistency**
1. (From Test 1 state - budget active)
2. Click: Page 2
3. ✅ Verify: Only € and €€ restaurants on page 2
4. ✅ Verify: NO new API call (uses same pool)
5. ✅ Verify: Assistant message unchanged

---

## Logs (What You'll See)

### Frontend Console
```
[SearchFacade] ✅ Filter chip added, re-searching with filter: budget
[SearchFacade] 🔄 Re-searching with filters: { priceLevel: 2 }
```

### Backend Logs
```json
{
  "msg": "Google Places API parameters",
  "query": "pizza",
  "language": "en",
  "region": "il",
  "filters": {
    "priceLevel": 2
  }
}
```

### Google API Request
```
GET https://maps.googleapis.com/maps/api/place/textsearch/json?query=pizza&location=32.08,34.78&radius=3000&maxprice=2&key=...
```

---

## Benefits

1. **Correctness**: Follows pool rules (no client-side filtering)
2. **Consistency**: Pagination works correctly
3. **Assistant Accuracy**: Message reflects filtered pool
4. **Performance**: Backend filters efficiently at source
5. **Extensibility**: Easy to add more filters (delivery, dietary, etc.)

---

## Future Enhancements

### 1. Sort by Price
Currently not implemented. Would follow same pattern:
```typescript
case 'sort':
  const sortKey = this.mapChipToSortKey(chipId);
  // TODO: Pass sort to backend when API supports it
  this.search(currentQuery, filters, { sort: sortKey });
  break;
```

### 2. Multiple Price Ranges
Allow "Budget (€)", "Mid-range (€€)", "Upscale (€€€)":
```typescript
// Chip filter: "price=2" (exact match instead of <=)
if (filterStr.startsWith('price=')) {
  const exactPrice = parseInt(filterStr.replace('price=', ''), 10);
  filters.priceLevel = exactPrice;
}
```

### 3. Price Range Filter
Allow "€-€€" or "€€-€€€":
```typescript
// Would require backend support for minprice + maxprice
filters.priceRange = { min: 1, max: 2 };
```

---

## Related Documentation

- `SEARCH_POOL_PAGINATION_RULES.md` — Core search mechanics
- `SYSTEM_TOOLS_AND_OPTIONS.md` — All chips and their semantics
- `UI_UX_CONTRACT.md` — Frontend chip behavior rules

---

**Status:** ✅ **Budget filtering fully functional**  
**Implemented:** December 28, 2025  
**Compliant with:** SEARCH_POOL_PAGINATION_RULES.md

