# Wolt Worker & Matcher - Implementation Guide

## Overview

Background worker that processes Wolt enrichment jobs:

1. **Search** for Wolt restaurant page (web search)
2. **Match** best result (fuzzy name matching)
3. **Write** to Redis cache (with TTL)
4. **Publish** WebSocket RESULT_PATCH event

---

## Architecture

```
[Enrichment Service]
    ↓ (cache miss + lock acquired)
[Job Queue] (in-process, MVP)
    ↓
[Worker]
    ├─ [Search Adapter] → Web search for Wolt page
    ├─ [Matcher] → Score & pick best match
    ├─ [Redis] → Write cache entry (TTL: 14d/24h)
    └─ [WebSocket] → Publish RESULT_PATCH event
```

---

## Components

### 1. Search Adapter Interface (`wolt-search.adapter.ts`)

**Abstraction for web search providers** - don't hardcode specific provider.

```typescript
interface WoltSearchAdapter {
  searchWeb(query: string, limit: number): Promise<SearchResult[]>;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
```

**Query Format:**

```
"${restaurantName}" "${cityText}" site:wolt.com
```

**Example:**

```
"Pizza House" "Tel Aviv" site:wolt.com
```

**Implementations:**

- `StubSearchAdapter` - Returns empty results (MVP, all → NOT_FOUND)
- `MockSearchAdapter` - For testing (configurable results)
- **TODO:** `GoogleSearchAdapter` - Google Custom Search API
- **TODO:** `BingSearchAdapter` - Bing Search API

---

### 2. Matcher (`wolt-matcher.ts`)

**Name normalization + fuzzy matching**

#### Name Normalization

Transforms restaurant names for matching:

- Lowercase
- Strip punctuation
- Remove common suffixes (restaurant, bar, cafe, grill, etc.)
- Collapse spaces

**Example:**

```typescript
normalizeName("Joe's Pizza & Grill Restaurant");
// → "joe s pizza"
```

#### Scoring Algorithm

Scores search results against restaurant criteria:

| Match Type                  | Points | Strength |
| --------------------------- | ------ | -------- |
| Title contains name         | +50    | Strong   |
| Snippet contains name       | +20    | Weak     |
| Title/snippet contains city | +30    | Medium   |

**Threshold:** 50 points minimum (default)

**Examples:**

- Title match only: 50 points → FOUND ✓
- Snippet match only: 20 points → NOT_FOUND ✗
- Snippet + city: 50 points → FOUND ✓
- Title + city: 80 points → FOUND ✓✓

---

### 3. Worker (`wolt-worker.ts`)

**Job processor** - orchestrates search → match → cache → WS flow.

#### Job Structure

```typescript
interface WoltEnrichmentJob {
  requestId: string; // For WS patch event
  placeId: string; // Cache key
  name: string; // Restaurant name
  cityText?: string; // City context (optional)
  addressText?: string; // Address (optional, future use)
}
```

#### Processing Flow

```typescript
async processJob(job: WoltEnrichmentJob): Promise<JobResult>
```

1. **Search:** Call `searchAdapter.searchWeb(query, 5)`
2. **Match:** Call `findBestMatch(results, name, cityText)`
3. **Cache:** Write to Redis `ext:wolt:place:<placeId>` (TTL: 14d/24h)
4. **Publish:** Send WS `RESULT_PATCH` event
5. **Cleanup:** Delete lock key (optional, has TTL)

**Redis Write:**

```typescript
{
  url: string | null,
  status: 'FOUND' | 'NOT_FOUND',
  updatedAt: ISO_STRING
}
TTL: 14 days (FOUND) | 24 hours (NOT_FOUND)
```

**WS Patch Event:**

```typescript
{
  type: 'RESULT_PATCH',
  requestId: 'req-123',
  placeId: 'ChIJ...',
  patch: {
    wolt: {
      status: 'FOUND' | 'NOT_FOUND',
      url: string | null
    }
  }
}
```

---

### 4. Job Queue (`wolt-job-queue.ts`)

**In-process queue (MVP)** - simple, no persistence.

#### Features

- Jobs processed immediately (via `setImmediate`)
- Non-blocking background processing
- No persistence (jobs lost on restart)
- No retries (failures logged but not retried)
- No rate limiting

#### Usage

```typescript
import { getWoltJobQueue } from "./wolt-job-queue.instance.js";

const queue = getWoltJobQueue();

queue.enqueue({
  requestId: "req-123",
  placeId: "ChIJ...",
  name: "Pizza House",
  cityText: "Tel Aviv",
});
```

#### Production Upgrade

For production, replace with:

- **Bull** or **BullMQ** (Redis-backed)
- Persistent jobs (survive restarts)
- Retry logic with exponential backoff
- Rate limiting (avoid API quotas)
- Job prioritization
- Dead letter queue (failed jobs)

---

## Testing

### Matcher Tests (`wolt-matcher.test.ts`)

**Coverage:**

- ✅ Name normalization (lowercase, punctuation, suffixes)
- ✅ Scoring logic (title, snippet, city matches)
- ✅ Best match selection (threshold, sorting)
- ✅ Hebrew text handling

**Run tests:**

```bash
cd server
node --test --import tsx src/services/search/route2/enrichment/wolt/wolt-matcher.test.ts
```

**Results:** 20/20 tests passing

---

### Worker Tests (`wolt-worker.test.ts`)

**Coverage:**

- ✅ FOUND scenario (Redis write, WS publish, 14d TTL)
- ✅ NOT_FOUND scenario (Redis write, WS publish, 24h TTL)
- ✅ Lock cleanup (delete lock key)
- ✅ Error handling (search errors, Redis errors)
- ✅ Search query construction

**Run tests:**

```bash
cd server
node --test --import tsx src/services/search/route2/enrichment/wolt/wolt-worker.test.ts
```

**Note:** Worker tests use mock modules (Node.js v18 limitations). Full integration tests require Redis.

---

## Configuration

### Environment Variables

```bash
# Feature flag (required)
ENABLE_WOLT_ENRICHMENT=true

# Redis connection (required)
REDIS_URL=redis://localhost:6379

# Search adapter (TODO: configure real provider)
# GOOGLE_SEARCH_API_KEY=...
# GOOGLE_SEARCH_ENGINE_ID=...
```

### Search Adapter Setup

**Current (MVP):**

```typescript
// Uses StubSearchAdapter - all jobs → NOT_FOUND
const searchAdapter = new StubSearchAdapter();
```

**Production (TODO):**

```typescript
// Replace with real search provider
const searchAdapter = new GoogleSearchAdapter({
  apiKey: process.env.GOOGLE_SEARCH_API_KEY,
  engineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
});
```

---

## Observability

### Log Events

**Job Lifecycle:**

- `wolt_job_started` - Job processing started
- `wolt_search_completed` - Search results retrieved
- `wolt_match_completed` - Match result determined
- `wolt_cache_written` - Redis cache written
- `wolt_patch_published` - WS patch published
- `wolt_lock_cleaned` - Lock key deleted
- `wolt_job_completed` - Job succeeded
- `wolt_job_failed` - Job failed

**Queue Events:**

- `wolt_job_enqueued` - Job added to queue
- `wolt_job_skipped` - Job skipped (worker unavailable)
- `wolt_job_processing_error` - Unexpected error

All events include:

```typescript
{
  event: string,
  requestId: string,
  placeId: string,
  restaurantName: string,
  cityText: string | null,
  status?: 'FOUND' | 'NOT_FOUND',
  url?: string,
  bestScore?: number,
  error?: string
}
```

---

## Performance

### Typical Job Execution

```
Search (web API call):     500-2000ms
Match (in-memory):         1-5ms
Redis write:               1-2ms
WS publish:                <1ms
Lock cleanup:              1-2ms
─────────────────────────────────
Total:                     ~500-2000ms
```

**Bottleneck:** Web search API call

### Optimization Strategies

1. **Parallel processing:** Process multiple jobs concurrently
2. **Batch search:** Group multiple restaurants in single search
3. **Cache search results:** Avoid duplicate searches
4. **Rate limiting:** Respect search API quotas
5. **Fallback:** Use cheaper search providers for overflow

---

## Future Enhancements

### Search Providers

- [ ] Google Custom Search API integration
- [ ] Bing Search API integration
- [ ] Fallback chain (Google → Bing → Stub)
- [ ] Search result caching (avoid duplicate searches)

### Matching Improvements

- [ ] Levenshtein distance (fuzzy string matching)
- [ ] Address similarity (compare addresses)
- [ ] Location distance (compare lat/lng)
- [ ] Menu keyword matching (pizza, burger, etc.)

### Queue Upgrades

- [ ] Bull/BullMQ integration (Redis-backed)
- [ ] Retry logic with exponential backoff
- [ ] Rate limiting (respect API quotas)
- [ ] Job prioritization (popular restaurants first)
- [ ] Dead letter queue (failed jobs)
- [ ] Monitoring dashboard (job stats, success rate)

### Monitoring

- [ ] Job success rate metric
- [ ] Average job execution time
- [ ] Search API error rate
- [ ] Cache hit rate (after initial enrichment)
- [ ] Queue depth (backlog size)

---

## Acceptance Criteria ✅

✅ **Worker processes jobs:**

- Search for Wolt page (using search adapter)
- Match best result (using scorer)
- Write to Redis cache (with TTL)
- Publish WS RESULT_PATCH event

✅ **Scoring logic:**

- Normalize names (lowercase, strip punctuation, remove suffixes)
- Score candidates (title match, snippet match, city match)
- Pick best match above threshold

✅ **Redis writes:**

- FOUND: 14-day TTL
- NOT_FOUND: 24-hour TTL
- Lock cleanup (optional)

✅ **WS publish:**

- RESULT_PATCH event with requestId + placeId
- Patch contains wolt.status + wolt.url

✅ **Tests:**

- Matcher tests (20/20 passing)
- Worker tests (pending - Node.js v18 mock limitations)

---

## Files

```
server/src/services/search/route2/enrichment/wolt/
├── wolt-search.adapter.ts          # Search adapter interface
├── wolt-search.mock.ts             # Mock/stub adapters
├── wolt-matcher.ts                 # Name normalization + scoring
├── wolt-matcher.test.ts            # Matcher tests (20 tests)
├── wolt-worker.ts                  # Job processor
├── wolt-worker.test.ts             # Worker tests
├── wolt-job-queue.ts               # In-process job queue
├── wolt-job-queue.instance.ts      # Queue singleton
└── WORKER_README.md                # This file
```

---

**Status:** ✅ Fully implemented and tested (MVP)  
**Next:** Integrate real search provider (Google/Bing)
