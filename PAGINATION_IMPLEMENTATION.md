# Google Places Text Search Pagination Implementation

## Summary
Implemented pagination for Google Places Text Search API to guarantee up to 20 results per query by iterating through multiple pages.

## Changes Made

### 1. **pagination-handler.ts** - Core Pagination Logic
**File**: `server/src/services/search/route2/stages/google-maps/pagination-handler.ts`

#### Changes:
- Added `maxPages` parameter (default 3) to `fetchAllPages()` function signature
- Changed `maxResults` default from 40 to 20
- Added per-page logging with `google_textsearch_page` event
- Enhanced aggregated logging with `google_textsearch_aggregated` event
- Added `stopReason` tracking (max_results_reached, max_pages_reached, no_more_pages, completed)
- Improved deduplication metrics (tracks duplicatesRemoved count)

#### Key Features:
- **Safety Cap**: Maximum 3 Google API requests per attempt
- **Per-Page Logging**: Tracks fetchedCount, newUniqueCount, cumulativeCount per page
- **Aggregated Summary**: Logs requested vs returned counts, pages used, stop reason
- **Deduplication**: Removes duplicates across pages using Set<placeId>

### 2. **text-search.handler.ts** - Query Orchestration
**File**: `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

#### Changes:
- Changed `maxResults` from 40 to 20 in `executeTextSearchAttempt()`
- Added `maxPages = 3` constant for safety cap
- Updated `fetchAllPages()` call to pass both `maxResults` and `maxPages`
- **CRITICAL FIX**: Cache key generation now uses `mapping.providerTextQuery` instead of `mapping.textQuery`
- **CRITICAL FIX**: Cache key now uses `mapping.providerLanguage` instead of `mapping.language`

#### Cache Key Fix Rationale:
The cache key must use the ACTUAL query sent to Google (`providerTextQuery`) not the internal textQuery. Different providerTextQueries could map to the same textQuery, causing incorrect cache hits. Similarly, `providerLanguage` is the deterministically-built language code sent to Google.

### 3. **pagination.test.ts** - Unit Tests
**File**: `server/src/services/search/route2/stages/google-maps/__tests__/pagination.test.ts`

#### Test Coverage:
1. **2-page aggregation**: Verifies 20 unique places from page1 (12) + page2 (8)
2. **Early termination**: Returns <20 when nextPageToken is missing
3. **maxPages cap**: Stops at 3 pages (returns 15 from 3×5)
4. **Deduplication**: Removes duplicates across pages (10 from page1 + 10 new from page2)
5. **Mid-page stop**: Stops exactly at 20 even when page2 has more results

All tests pass ✅

## Behavior Changes

### Before:
- Fetched up to 40 results across pages
- Sometimes returned only 6-12 results when Google didn't provide nextPageToken
- No per-page visibility in logs

### After:
- Fetches up to 20 unique results (matches Google's default page size)
- Iterates up to 3 pages to reach 20 results
- Detailed per-page logging shows fetch progress
- Cache key correctly uses providerTextQuery/providerLanguage

## Log Examples

### Per-Page Logs:
```json
{
  "requestId": "abc123",
  "event": "google_textsearch_page",
  "page": 1,
  "fetchedCount": 12,
  "cumulativeCount": 12,
  "hasNextPageToken": true
}

{
  "requestId": "abc123",
  "event": "google_textsearch_page",
  "page": 2,
  "fetchedCount": 10,
  "newUniqueCount": 8,
  "cumulativeCount": 20,
  "hasNextPageToken": false
}
```

### Aggregated Summary:
```json
{
  "requestId": "abc123",
  "event": "google_textsearch_aggregated",
  "requested": 20,
  "returned": 20,
  "pagesUsed": 2,
  "maxPagesAllowed": 3,
  "totalFetched": 22,
  "duplicatesRemoved": 2,
  "stopReason": "max_results_reached",
  "hadMorePages": false
}
```

## Testing

### Unit Tests:
```bash
cd server
node --test --import tsx src/services/search/route2/stages/google-maps/__tests__/pagination.test.ts
```

### Integration Test:
Query "מסעדות איטלקיות בגדרה" should now show:
- `google_textsearch_aggregated` event with `returned: 20` (or close to 20 if Google has fewer results)
- Multiple `google_textsearch_page` events if pagination occurred

## Hard Constraints Verification

✅ **Query builder logic unchanged**: No changes to providerTextQuery, providerLanguage, or bias logic  
✅ **Cuisine enforcer untouched**: No changes to cuisine enforcement logic  
✅ **Caching correct**: Cache key includes providerTextQuery + providerLanguage (not pageToken, which would break aggregation)  
✅ **Deduplication working**: Set<placeId> prevents duplicates across pages  
✅ **Rate limits respected**: No artificial delays needed (Google Places API New doesn't require them)  
✅ **Other flows preserved**: No changes to kosher/meat/dairy/openNow/nearbySearch flows  

## Performance Impact

- **Best case**: 1 API call when Google returns 20 results on page 1
- **Typical case**: 2 API calls (e.g., 12 + 8 results)
- **Worst case**: 3 API calls (safety cap) when Google has many pages

The maxPages=3 cap ensures we don't make excessive API calls even for very popular queries.

## Notes

1. **Why not cache individual pages?**  
   Caching happens at the `executeTextSearch` level, which caches the ENTIRE aggregated result after pagination. This is correct - each unique query gets one cache entry with the full 20 results.

2. **Why maxResults=20 not 40?**  
   Google typically returns 20 results per page. Requesting 20 aligns with this and reduces unnecessary API calls while still providing good coverage.

3. **Why maxPages=3?**  
   Safety cap to prevent runaway API calls. 3 pages × ~20 results = up to 60 places fetched, which is more than enough to get 20 unique results.

## Files Modified

1. `server/src/services/search/route2/stages/google-maps/pagination-handler.ts`
2. `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`

## Files Created

1. `server/src/services/search/route2/stages/google-maps/__tests__/pagination.test.ts`
