# Rating Filter Quick Reference

## TL;DR
- **Location**: `server/src/services/search/route2/post-filters/rating/`
- **Pattern**: BaseFilters LLM → Canonical Matrix → Post Filter
- **Policy**: Unknown ratings are KEPT (conservative)
- **Auto-relax**: Returns all results if rating filter yields 0

## Rating Buckets

| Bucket | Threshold | Keeps | Description |
|--------|-----------|-------|-------------|
| R35 | 3.5 | rating ≥ 3.5 + unknowns | Decent/satisfactory |
| R40 | 4.0 | rating ≥ 4.0 + unknowns | High-rated |
| R45 | 4.5 | rating ≥ 4.5 + unknowns | Top-rated/excellent |
| null | - | All ratings | No filtering |

## Canonical Matrix

```typescript
RATING_MATRIX = {
    R35: { threshold: 3.5 },
    R40: { threshold: 4.0 },
    R45: { threshold: 4.5 }
}
```

## Keywords Detected by LLM

### Hebrew
- **R35**: לפחות 3.5, סביר
- **R40**: דירוג גבוה, מעל 4, 4 כוכבים
- **R45**: מעל 4.5, הכי טובים, מצוין

### English
- **R35**: decent, 3.5+, 3.5 stars, above 3.5
- **R40**: high rated, 4+ stars, 4 stars, above 4
- **R45**: top rated, 4.5+, 4.5 stars, best rated, excellent

### Null (No Filter)
- No explicit rating preference
- User says: "not important", "לא חשוב", "בלי דירוג"

## Filter Behavior

```typescript
// NO FILTER (default)
minRatingBucket: null
Input:  [5.0, 4.5, 4.0, 3.5, 3.0, null]
Output: [5.0, 4.5, 4.0, 3.5, 3.0, null]  // All kept

// R35 (3.5+)
minRatingBucket: "R35"
Input:  [5.0, 4.5, 4.0, 3.5, 3.0, null]
Output: [5.0, 4.5, 4.0, 3.5, null]       // 3.5+ + unknowns

// R40 (4.0+)
minRatingBucket: "R40"
Input:  [5.0, 4.5, 4.0, 3.5, 3.0, null]
Output: [5.0, 4.5, 4.0, null]            // 4.0+ + unknowns

// R45 (4.5+)
minRatingBucket: "R45"
Input:  [5.0, 4.5, 4.0, 3.5, 3.0, null]
Output: [5.0, 4.5, null]                 // 4.5+ + unknowns
```

## Auto-Relax Examples

### Example 1: Zero results → Relax
```typescript
Query: "top rated restaurants open now"
Results before rating filter: 10 (all open, none rated 4.5+)
Rating filter result: 0
AUTO-RELAX: Returns 10 results
Output: {
  applied: { minRatingBucket: null },
  relaxed: { minRating: true }
}
```

### Example 2: One result → No relax
```typescript
Query: "top rated restaurants"
Results before rating filter: 10
Rating filter result: 1 (one 4.5+ place)
NO RELAX: Returns 1 result
Output: {
  applied: { minRatingBucket: "R45" },
  relaxed: undefined
}
```

## Combined Filters

Rating filter can be combined with openState and priceIntent:

```typescript
Query: "cheap high-rated restaurants open now"
Step 1: openState filter:  20 -> 15 (keeps open)
Step 2: price filter:      15 -> 8  (keeps cheap)
Step 3: rating filter:     8  -> 5  (keeps 4.0+)
Result: 5 cheap, high-rated, open restaurants

// If rating filter yields 0:
Step 1: openState filter:  20 -> 15 (keeps open)
Step 2: price filter:      15 -> 8  (keeps cheap)
Step 3: rating filter:     8  -> 0  (no 4.0+)
Step 4: AUTO-RELAX:        0  -> 8  (remove rating, keep open+cheap)
Result: 8 cheap open restaurants (all ratings)
```

## Code Locations

| Component | File |
|-----------|------|
| Schema | `shared/shared-filters.types.ts` |
| LLM Prompt | `shared/base-filters-llm.ts` |
| Canonical Matrix | `post-filters/rating/rating-matrix.ts` |
| Post Filter Logic | `post-filters/post-results.filter.ts` |
| Tests | `post-filters/__tests__/post-results-rating.test.ts` |

## Common Patterns

### Reading Rating Filter from Request
```typescript
const filters: FinalSharedFilters = await resolveFilters(...);
const minRatingBucket = filters.minRatingBucket; // "R35" | "R40" | "R45" | null
```

### Applying Filter
```typescript
const output = applyPostFilters({
  results,
  sharedFilters: { ...filters, minRatingBucket: "R40" },
  requestId,
  pipelineVersion: "route2"
});

// Check if relaxed
if (output.relaxed?.minRating) {
  console.log("Rating filter was auto-relaxed");
}
```

### Checking Applied Filters
```typescript
if (output.applied.minRatingBucket === "R40") {
  // Filter was successfully applied
} else if (output.applied.minRatingBucket === null && output.relaxed?.minRating) {
  // Filter was relaxed due to 0 results
}
```

## Testing

```bash
# Run rating filter tests
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-rating.test.ts

# Run all post-filter tests
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-tristate.test.ts
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-price.test.ts
node --import tsx src/services/search/route2/post-filters/__tests__/post-results-rating.test.ts
```

## Logging Events

### Base Filters Completed
```json
{
  "event": "base_filters_llm_completed",
  "minRatingBucket": "R40"
}
```

### Rating Filter Relaxed
```json
{
  "event": "rating_filter_relaxed",
  "reason": "zero_results",
  "originalBucket": "R45",
  "beforeRelax": 0,
  "afterRelax": 15
}
```

## FAQs

**Q: Why keep unknown ratings?**
A: Conservative policy - better to show possibly low-rated places than show zero results.

**Q: Why auto-relax instead of showing 0 results?**
A: Better UX - user gets results even if their rating preference isn't available.

**Q: Does relax affect other filters?**
A: No - only rating filter is removed. OpenState and price filters remain active.

**Q: Can I disable auto-relax?**
A: Not currently - it's a core design decision for better UX.

**Q: How do I know if filter was relaxed?**
A: Check `output.relaxed.minRating === true`

**Q: Why buckets instead of exact thresholds?**
A: Simpler UX, better LLM intent detection, and avoids arbitrary precision issues.

**Q: Can users specify exact thresholds like 4.2?**
A: Not currently - only buckets (3.5, 4.0, 4.5) to keep it simple.

**Q: What happens with ratings like 3.9 when using R40?**
A: Filtered out - only 4.0+ ratings are kept (plus unknowns).

**Q: Are Google ratings always 1.0-5.0?**
A: Yes, Google Places API uses a 1.0-5.0 scale.

---

**See also:** `RATING_FILTER_IMPLEMENTATION.md` for full implementation details
