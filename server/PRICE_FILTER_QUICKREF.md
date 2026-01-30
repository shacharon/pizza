# Price Filter Quick Reference

## TL;DR
- **Location**: `server/src/services/search/route2/post-filters/price/`
- **Pattern**: BaseFilters LLM → Canonical Matrix → Post Filter
- **Policy**: Unknown prices are KEPT (conservative)
- **Auto-relax**: Returns all results if price filter yields 0

## Price Levels (Google Places API)

| Level | Symbol | Description |
|-------|--------|-------------|
| 1 | $ | Cheap/Inexpensive |
| 2 | $$ | Moderate |
| 3 | $$$ | Expensive |
| 4 | $$$$ | Very Expensive |
| null | ? | Unknown |

## Canonical Matrix

```typescript
PRICE_MATRIX = {
    CHEAP:     { googleLevels: [1] },      // $
    MID:       { googleLevels: [2] },      // $$
    EXPENSIVE: { googleLevels: [3, 4] }    // $$$, $$$$
}
```

## Keywords Detected by LLM

### Hebrew
- **CHEAP**: זול, זולות, לא יקר, בתקציב, מחירים נמוכים
- **MID**: בינוני, בינונית, אמצע
- **EXPENSIVE**: יקר, יקרות, יוקרתי, יוקרה

### English
- **CHEAP**: cheap, budget, affordable, inexpensive, not expensive
- **MID**: mid, moderate, medium price, reasonable
- **EXPENSIVE**: expensive, luxury, upscale, fine dining, high-end

## Filter Behavior

```typescript
// NO FILTER (default)
priceIntent: null
Input:  [1, 2, 3, 4, null]
Output: [1, 2, 3, 4, null]  // All kept

// CHEAP
priceIntent: "CHEAP"
Input:  [1, 2, 3, 4, null]
Output: [1, null]            // Only 1 + unknowns

// MID
priceIntent: "MID"
Input:  [1, 2, 3, 4, null]
Output: [2, null]            // Only 2 + unknowns

// EXPENSIVE
priceIntent: "EXPENSIVE"
Input:  [1, 2, 3, 4, null]
Output: [3, 4, null]         // Only 3,4 + unknowns
```

## Auto-Relax Examples

### Example 1: Zero results → Relax
```typescript
Query: "cheap restaurants open now"
Results before price filter: 10 (all open, none cheap)
Price filter result: 0
AUTO-RELAX: Returns 10 results
Output: {
  applied: { priceIntent: null },
  relaxed: { priceIntent: true }
}
```

### Example 2: One result → No relax
```typescript
Query: "cheap restaurants"
Results before price filter: 10
Price filter result: 1
NO RELAX: Returns 1 result
Output: {
  applied: { priceIntent: "CHEAP" },
  relaxed: undefined
}
```

## Combined Filters

Price filter can be combined with openState:

```typescript
Query: "cheap restaurants open now"
Step 1: openState filter: 20 -> 12 (keeps open)
Step 2: price filter:      12 -> 5  (keeps cheap)
Result: 5 cheap open restaurants

// If price filter yields 0:
Step 1: openState filter: 20 -> 12 (keeps open)
Step 2: price filter:      12 -> 0  (no cheap)
Step 3: AUTO-RELAX:        0  -> 12 (remove price, keep openState)
Result: 12 open restaurants (all prices)
```

## Code Locations

| Component | File |
|-----------|------|
| Schema | `shared/shared-filters.types.ts` |
| LLM Prompt | `shared/base-filters-llm.ts` |
| Canonical Matrix | `post-filters/price/price-matrix.ts` |
| Post Filter Logic | `post-filters/post-results.filter.ts` |
| Tests | `post-filters/__tests__/post-results-price.test.ts` |

## Common Patterns

### Reading Price Filter from Request
```typescript
const filters: FinalSharedFilters = await resolveFilters(...);
const priceIntent = filters.priceIntent; // "CHEAP" | "MID" | "EXPENSIVE" | null
```

### Applying Filter
```typescript
const output = applyPostFilters({
  results,
  sharedFilters: { ...filters, priceIntent: "CHEAP" },
  requestId,
  pipelineVersion: "route2"
});

// Check if relaxed
if (output.relaxed?.priceIntent) {
  console.log("Price filter was auto-relaxed");
}
```

### Checking Applied Filters
```typescript
if (output.applied.priceIntent === "CHEAP") {
  // Filter was successfully applied
} else if (output.applied.priceIntent === null && output.relaxed?.priceIntent) {
  // Filter was relaxed due to 0 results
}
```

## Testing

```bash
# Run price filter tests
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-price.test.ts

# Run all post-filter tests
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-tristate.test.ts
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-price.test.ts
```

## Logging Events

### Base Filters Completed
```json
{
  "event": "base_filters_llm_completed",
  "priceIntent": "CHEAP"
}
```

### Price Filter Relaxed
```json
{
  "event": "price_filter_relaxed",
  "reason": "zero_results",
  "originalIntent": "CHEAP",
  "beforeRelax": 0,
  "afterRelax": 12
}
```

## FAQs

**Q: Why keep unknown prices?**
A: Conservative policy - better to show possibly expensive places than show zero results.

**Q: Why auto-relax instead of showing 0 results?**
A: Better UX - user gets results even if their price preference isn't available.

**Q: Does relax affect other filters?**
A: No - only price filter is removed. OpenState and other filters remain active.

**Q: Can I disable auto-relax?**
A: Not currently - it's a core design decision for better UX.

**Q: How do I know if filter was relaxed?**
A: Check `output.relaxed.priceIntent === true`

**Q: What if I want to show "no results" instead of relaxing?**
A: Check `output.applied.priceIntent` and handle accordingly in your code.

---

**See also:** `PRICE_FILTER_IMPLEMENTATION.md` for full implementation details
