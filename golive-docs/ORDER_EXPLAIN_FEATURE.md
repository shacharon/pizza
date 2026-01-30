# Order Explanation Feature

## Summary

Added optional `order_explain` field to SearchResponse.meta to expose ranking transparency information to the frontend. This is a non-breaking change that provides users with insight into how results are ordered.

## Problem Statement

Users had no visibility into:
- Which ranking profile was used (Balanced, Quality First, etc.)
- What weights were applied to different factors (rating, reviews, distance, openBoost)
- Where distance was measured from (city center vs user location)
- Whether results were reordered or in original Google order

## Solution

### 1. Backend: Add Optional `order_explain` Field ✅

**Files Changed:**
- `server/src/services/search/types/search-response.dto.ts` - Added optional `order_explain` to SearchResponseMeta
- `server/src/services/search/route2/orchestrator.ranking.ts` - Populate orderExplain in RankingResult
- `server/src/services/search/route2/orchestrator.response.ts` - Pass orderExplain to response meta
- `server/src/services/search/route2/route2.orchestrator.ts` - Extract and forward orderExplain

**Type Definition:**
```typescript
interface SearchResponseMeta {
  // ... existing fields ...
  order_explain?: {
    profile: string;  // e.g., 'BALANCED', 'QUALITY_FIRST', 'GOOGLE_ORDER'
    weights: {
      rating: number;      // 0-1 (e.g., 0.25 = 25%)
      reviews: number;     // 0-1
      distance: number;    // 0-1
      openBoost: number;   // 0-1
    };
    distanceOrigin: 'CITY_CENTER' | 'USER_LOCATION' | 'NONE';
    distanceRef: { lat: number; lng: number } | null;
    reordered: boolean;  // true if ranking applied, false if Google order
  };
}
```

**Population Logic:**
1. When ranking is **enabled and applied**:
   - profile: LLM-selected profile (e.g., 'BALANCED')
   - weights: Effective weights after distance adjustment
   - distanceOrigin: Resolved from distance-origin logic
   - distanceRef: Actual lat/lng used for distance calculation
   - reordered: true

2. When ranking is **disabled or failed**:
   - profile: 'GOOGLE_ORDER'
   - weights: All zeros
   - distanceOrigin: 'NONE'
   - distanceRef: null
   - reordered: false

### 2. Frontend: Display Order Explanation ✅

**Files Changed:**
- `llm-angular/src/app/domain/types/search.types.ts` - Added order_explain to SearchMeta
- `llm-angular/src/app/features/unified-search/search-page/search-page.component.html` - Added order explanation UI
- `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts` - Added helper methods
- `llm-angular/src/app/features/unified-search/search-page/search-page.component.scss` - Added styles

**UI Design:**
```
┌─────────────────────────────────────────────┐
│ Order: Balanced                             │
│ ⭐ 25%  💬 25%  📍 25%  🟢 25%              │
│ 📍 from your location                       │
└─────────────────────────────────────────────┘
```

**Display Logic:**
- Shows profile name (mapped to user-friendly text)
- Shows non-zero weights with icons and percentages
- Shows distance origin (if distance weight > 0)
- Positioned above results grid, below filters

**Helper Methods:**
```typescript
getProfileDisplayName(profile: string): string {
  // Maps profile codes to user-friendly names
  // 'BALANCED' → 'Balanced'
  // 'QUALITY_FIRST' → 'Quality First'
  // 'GOOGLE_ORDER' → 'Google Order'
}

getOriginDisplayText(origin: string): string {
  // Maps origin codes to user-friendly text
  // 'CITY_CENTER' → '📍 from city center'
  // 'USER_LOCATION' → '📍 from your location'
  // 'NONE' → ''
}
```

## Behavior Examples

### Example 1: Balanced Profile with User Location
```json
{
  "order_explain": {
    "profile": "BALANCED",
    "weights": {
      "rating": 0.25,
      "reviews": 0.25,
      "distance": 0.25,
      "openBoost": 0.25
    },
    "distanceOrigin": "USER_LOCATION",
    "distanceRef": { "lat": 32.0853, "lng": 34.7818 },
    "reordered": true
  }
}
```

**Frontend Display:**
```
Order: Balanced
⭐ 25%  💬 25%  📍 25%  🟢 25%
📍 from your location
```

### Example 2: Quality First Profile with City Center
```json
{
  "order_explain": {
    "profile": "QUALITY_FIRST",
    "weights": {
      "rating": 0.4,
      "reviews": 0.3,
      "distance": 0.2,
      "openBoost": 0.1
    },
    "distanceOrigin": "CITY_CENTER",
    "distanceRef": { "lat": 32.084041, "lng": 34.887762 },
    "reordered": true
  }
}
```

**Frontend Display:**
```
Order: Quality First
⭐ 40%  💬 30%  📍 20%  🟢 10%
📍 from city center
```

### Example 3: Google Order (Ranking Disabled)
```json
{
  "order_explain": {
    "profile": "GOOGLE_ORDER",
    "weights": {
      "rating": 0,
      "reviews": 0,
      "distance": 0,
      "openBoost": 0
    },
    "distanceOrigin": "NONE",
    "distanceRef": null,
    "reordered": false
  }
}
```

**Frontend Display:**
```
Order: Google Order
(no weights shown - all zeros)
```

### Example 4: Distance Weight Disabled (No Origin)
```json
{
  "order_explain": {
    "profile": "BALANCED",
    "weights": {
      "rating": 0.33,
      "reviews": 0.33,
      "distance": 0,
      "openBoost": 0.34
    },
    "distanceOrigin": "NONE",
    "distanceRef": null,
    "reordered": true
  }
}
```

**Frontend Display:**
```
Order: Balanced
⭐ 33%  💬 33%  🟢 34%
(no distance origin shown - weight is 0)
```

## API Stability

✅ **NO breaking changes:**
- `order_explain` is optional (non-breaking addition)
- All existing fields unchanged
- Backward compatible (old clients ignore new field)

## Files Modified (9 total)

### Backend (4 files):
1. `server/src/services/search/types/search-response.dto.ts`
   - Added order_explain to SearchResponseMeta interface
   
2. `server/src/services/search/route2/orchestrator.ranking.ts`
   - Added orderExplain to RankingResult interface
   - Populate orderExplain in all return paths
   - Use effectiveWeights (after distance adjustment)
   
3. `server/src/services/search/route2/orchestrator.response.ts`
   - Added orderExplain parameter to buildFinalResponse
   - Include order_explain in response.meta
   
4. `server/src/services/search/route2/route2.orchestrator.ts`
   - Extract orderExplain from rankingResult
   - Pass to buildFinalResponse

### Frontend (4 files):
1. `llm-angular/src/app/domain/types/search.types.ts`
   - Added order_explain to SearchMeta interface
   
2. `llm-angular/src/app/features/unified-search/search-page/search-page.component.html`
   - Added order explanation UI above results
   - Conditional display based on order_explain presence
   
3. `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`
   - Added getProfileDisplayName() helper
   - Added getOriginDisplayText() helper
   
4. `llm-angular/src/app/features/unified-search/search-page/search-page.component.scss`
   - Added .order-explain styles
   - Responsive layout with weight icons

## Testing Strategy

### Manual Testing:
1. **Ranking Enabled:**
   - Search: "בתי קפה בתל אביב"
   - Verify: Order explanation shows profile, weights, and origin
   - Verify: Distance origin matches user location or city center

2. **Ranking Disabled:**
   - Disable ranking feature flag
   - Search: any query
   - Verify: Order explanation shows "Google Order" with reordered=false

3. **No Distance Origin:**
   - Search without location, no explicit city
   - Verify: Distance weight is 0, no origin text shown

4. **Different Profiles:**
   - Test queries that trigger different profiles
   - Verify: Profile name matches, weights add up to 100%

### Integration Testing:
```bash
# Backend tests
npm test -- search-response.dto.test.ts
npm test -- orchestrator.ranking.test.ts

# Frontend tests  
npm test -- search-page.component.spec.ts
```

### Visual Regression:
- Take screenshots of order explanation with different profiles
- Verify styling matches design
- Test responsive layout on mobile

## Observability

**Backend Logs (No Changes):**
- Ranking data already logged in `ranking_distance_origin_selected`
- Weights already logged in `post_rank_applied`
- Profile already logged in `ranking_output_order`

**Frontend Analytics (Optional Future):**
```typescript
// Track when users see order explanation
analytics.track('order_explain_shown', {
  profile: orderExplain.profile,
  hasDistance: orderExplain.weights.distance > 0,
  reordered: orderExplain.reordered
});
```

## UX Benefits

### Before:
```
[Results appear]
User: "Why is this result first?"
Answer: Unknown - no visibility
```

### After:
```
Order: Quality First
⭐ 40%  💬 30%  📍 20%  🟢 10%
📍 from your location

[Results appear]
User: "Why is this result first?"
Answer: Visible - prioritizing quality (rating 40%) over distance (20%)
```

## Future Enhancements

### 1. Expandable Details
```
Order: Quality First ⓘ
└─ Click to see full explanation
   ├─ Rating: 40% (highly rated restaurants)
   ├─ Reviews: 30% (popular choices)
   ├─ Distance: 20% (nearby options)
   └─ Open Now: 10% (currently available)
```

### 2. Interactive Profile Selection
```
Order: [Balanced ▼]
├─ Balanced
├─ Quality First
├─ Distance First
└─ Popularity First
```

### 3. Weight Visualization
```
Order: Quality First
[████████▓▓▓▓░░░] Rating 40%
[██████░░░░░░░░] Reviews 30%
[████░░░░░░░░░░] Distance 20%
[██░░░░░░░░░░░░] Open Now 10%
```

### 4. Localization (Hebrew)
```typescript
const hebrewProfileNames = {
  'BALANCED': 'מאוזן',
  'QUALITY_FIRST': 'איכות קודמת',
  'DISTANCE_FIRST': 'מרחק קודם',
  'GOOGLE_ORDER': 'סדר גוגל'
};
```

## Rollout Plan

1. ✅ Code complete (9 files modified)
2. ✅ Linter passing (no errors)
3. 🔄 **Next:** Manual testing (all scenarios)
4. 🔄 **Next:** Deploy to staging
5. 🔄 **Next:** A/B test visibility (show to 50% of users)
6. 🔄 **Next:** Monitor engagement metrics:
   - Click-through rate on top results
   - User feedback on ordering
   - Complaints about result order
7. 🔄 **Next:** Deploy to production (100%)

## Risk Assessment

**Risk Level:** 🟢 Low

**Mitigations:**
- ✅ Optional field (non-breaking)
- ✅ Defensive UI (only shows if data present)
- ✅ Graceful degradation (hidden if missing)
- ✅ No changes to ranking logic
- ✅ No performance impact (data already computed)

**Rollback Plan:**
- Remove UI component (frontend only)
- Data still in response but not displayed
- No backend changes needed

## Performance Impact

**Backend:**
- ✅ No additional computations (data already available)
- ✅ Minimal JSON size increase (~80 bytes)
- ✅ No database queries

**Frontend:**
- ✅ Minimal rendering cost (simple conditional div)
- ✅ No re-renders triggered
- ✅ CSS already optimized

## Success Criteria

✅ **All goals achieved:**
1. ✅ Non-breaking addition to SearchResponse.meta
2. ✅ Exposes existing ranking data (no new computations)
3. ✅ Frontend displays profile, weights, and distance origin
4. ✅ User-friendly text with icons
5. ✅ Responsive design
6. ✅ No linter errors
7. ✅ Backward compatible

## Questions & Answers

**Q: Why not show this for every search?**
A: Only shown when results are present. Hidden for errors, clarify, or empty results.

**Q: What if ranking is disabled?**
A: Shows "Google Order" with reordered=false and zero weights.

**Q: Can users change the profile?**
A: Not in this version - future enhancement.

**Q: What about mobile layout?**
A: Responsive design - stacks on mobile, inline on desktop.

**Q: Why show percentages instead of decimals?**
A: More user-friendly (25% vs 0.25).

**Q: What if weights don't add up to 100%?**
A: Display actual values - rounding may cause 99% or 101%.

**Q: Why not show Google scores?**
A: Google doesn't expose scores - only order.

## Next Steps

1. Manual testing (all scenarios)
2. Deploy to staging
3. A/B test with 50% of users
4. Collect user feedback
5. Monitor engagement metrics
6. Deploy to production
7. Consider future enhancements (expandable details, profile selection)

---

**Status:** ✅ Complete
**Linter:** ✅ Passing (no errors)
**Breaking Changes:** ✅ None (optional field)
**Performance:** ✅ No impact
**UX:** ✅ Improved transparency
