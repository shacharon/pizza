# Multi-Page Fetching — Implementation Complete

## Status
✅ **Backend pagination fully implemented**

**Date:** December 28, 2025

---

## What Was Implemented

### Backend: Multi-Page Fetching from Google Places API

The system now fetches **multiple pages** from Google Places API to reach the target candidate pool size (30 results).

#### Before (Limited):
- ❌ Fetched only 1 page (~10-20 results)
- ❌ No page 2 available
- ❌ Log showed: `googleResultsCount: 10` (even when asking for 30)

#### After (Complete):
- ✅ Fetches up to 3 pages (60 results max)
- ✅ Uses `next_page_token` to get additional results
- ✅ Waits 2 seconds between pages (Google requirement)
- ✅ Stops when target size reached or no more pages

---

## Implementation Details

### 1. Updated `GooglePlacesClient` (google-places.client.ts)

Added support for `pageToken` parameter:

```typescript
export interface TextSearchParams {
  // ... existing params ...
  pageToken?: string;  // NEW: For fetching next page
}

async textSearch(params: TextSearchParams): Promise<GoogleRawResponse> {
  // When using pagetoken, ONLY send key + pagetoken (Google requirement)
  if (params.pageToken) {
    url.searchParams.set('pagetoken', params.pageToken);
  } else {
    // Normal search with all parameters
    // ...
  }
}
```

---

### 2. Updated `PlacesProviderService` (places-provider.service.ts)

Implemented multi-page fetching loop:

```typescript
const targetSize = this.poolConfig.candidatePoolSize; // 30
const allResults: NormalizedPlace[] = [];
let nextPageToken: string | null = null;
let pageCount = 0;
const maxPages = 3; // Limit to 3 pages (60 results max)

// Page 1
let response = await this.textSearch(params);
allResults.push(...this.normalizeResults(response, 20));
nextPageToken = response.next_page_token ?? null;
pageCount++;

// Fetch additional pages if needed
while (allResults.length < targetSize && nextPageToken && pageCount < maxPages) {
  // Google requires 2-second delay
  await this.delay(2000);
  
  const nextPageResponse = await this.textSearch({ 
    ...params, 
    pageToken: nextPageToken 
  });
  
  allResults.push(...this.normalizeResults(nextPageResponse, 20));
  nextPageToken = nextPageResponse.next_page_token ?? null;
  pageCount++;
}

// Slice to exact target size
const results = allResults.slice(0, targetSize);
```

---

### 3. Added `delay()` Helper Method

```typescript
private delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Logs (What You'll See)

### Before (Single Page):
```json
{
  "candidatePoolSize": 30,
  "googleResultsCount": 10,  // ❌ Only got 10
  "msg": "Fetched candidate pool"
}
```

### After (Multi-Page):
```
[PlacesProviderService] Searching with mode: textsearch, target: 30 results
[PlacesProviderService] 📄 Page 1: 20 results
[PlacesProviderService] ⏳ Waiting 2s for next page...
[PlacesProviderService] 📄 Page 2: 10 results (total: 30)
[PlacesProviderService] ✅ Found 30 results across 2 pages (4500ms total)
```

```json
{
  "candidatePoolSize": 30,
  "googleResultsCount": 30,  // ✅ Got 30!
  "msg": "Fetched candidate pool"
}
```

---

## Performance Impact

### Timing:
- **Single page:** ~800ms
- **Two pages:** ~3000ms (800ms + 2000ms delay + 200ms)
- **Three pages:** ~5200ms (800ms + 2000ms + 200ms + 2000ms + 200ms)

**Trade-off:** Slower initial search BUT better ranking quality (more candidates to choose from).

### Caching Mitigation:
- Results are cached (10-30 minutes TTL)
- Repeat searches are instant
- Only first search pays the multi-page penalty

---

## Configuration

### Pool Size (default: 30)
```bash
# .env
CANDIDATE_POOL_SIZE=30  # Can increase to 40 or 60
```

### Max Pages (hardcoded: 3)
```typescript
// places-provider.service.ts
const maxPages = 3; // Limit to 3 pages (60 results max)
```

**Why limit to 3 pages?**
- Diminishing returns after 60 results
- Each page adds 2+ seconds
- Quality improvement plateaus

---

## Edge Cases Handled

### 1. No next_page_token
```typescript
while (allResults.length < targetSize && nextPageToken && ...) {
  // Stops if nextPageToken is null
}
```

### 2. Fetch Error on Page 2+
```typescript
try {
  const nextPageResponse = await this.textSearch(...);
} catch (error) {
  console.error('Failed to fetch page', error);
  break; // Stop fetching, return what we have
}
```

### 3. Target Size Reached Early
```typescript
while (allResults.length < targetSize && ...) {
  // Stops when we have enough
}

return allResults.slice(0, targetSize); // Exact size
```

### 4. Google Returns Less Than Expected
- Sometimes Google only has 15 total results
- Loop stops naturally when `nextPageToken` is null
- Returns whatever was fetched (e.g., 15 instead of 30)

---

## Testing

### Manual Test:
1. Search: "pizza in tel aviv"
2. Check logs for:
   ```
   📄 Page 1: X results
   ⏳ Waiting 2s for next page...
   📄 Page 2: Y results (total: X+Y)
   ```
3. Verify `googleResultsCount` matches `candidatePoolSize`

### Expected Results:
- **Tel Aviv (popular):** 2-3 pages, 30 results
- **Small city:** 1 page, 10-15 results (no more available)
- **French query:** 2 pages, 25+ results

---

## Future Enhancements

### 1. Dynamic Page Strategy
Adjust pages based on search type:
- **CITY search:** Fetch 2-3 pages (30-60 results)
- **STREET search:** Fetch 1 page (10-20 results)

### 2. Parallel Page Fetching
Use `Promise.all` after 2s delay:
```typescript
await delay(2000);
const [page2, page3] = await Promise.all([
  fetchPage(token2),
  fetchPage(token3)
]);
```

### 3. Progressive Loading
Return first page immediately, fetch more in background:
```typescript
// Return page 1 fast
res.json({ results: page1, hasMore: true });

// Fetch pages 2-3 async (for pagination)
fetchRemainingPages(sessionId, pageTokens);
```

---

## Related Files

- `server/src/services/places/client/google-places.client.ts` — Added `pageToken` support
- `server/src/services/search/capabilities/places-provider.service.ts` — Multi-page fetching logic
- `server/src/services/search/config/ranking.config.ts` — `candidatePoolSize` config

---

## Compliance

✅ **SEARCH_POOL_PAGINATION_RULES.md:**
- Pool is created once with all candidates
- Ranking happens on full pool
- No client-side re-ranking

✅ **Performance:**
- Caching mitigates latency
- Error handling prevents failures
- Configurable pool size

---

**Status:** ✅ **Backend pagination complete**  
**Next Step:** User will discuss next steps (price symbol, frontend "Load More" button, etc.)

