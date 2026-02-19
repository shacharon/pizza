# Google CSE 3-Layer Deep Link Resolution

## Overview

Implemented sophisticated 3-layer provider deep link resolution with Google Custom Search Engine (CSE) and intelligent fallback strategy.

## Architecture

### 3-Layer Resolution Strategy

```
┌─────────────────────────────────────────────┐
│  ProviderDeepLinkResolver                   │
│                                             │
│  L1: CSE with city (if cityText available)  │
│      q = site:<host> "<name>" "<city>"      │
│      ↓                                       │
│  L2: CSE without city                       │
│      q = site:<host> "<name>"               │
│      ↓                                       │
│  L3: Internal search fallback                │
│      url = https://<host>/search?q=<name>   │
│      status = NOT_FOUND (CTA "Search")      │
└─────────────────────────────────────────────┘
```

### Layer Details

#### L1: CSE with City Context
- **Query**: `site:wolt.com "Pizza House" "Tel Aviv"`
- **Trigger**: Only if `cityText` is available
- **Success**: Returns `status='FOUND'`, `url=<direct link>`, `meta.layerUsed=1`
- **Failure**: Falls through to L2

#### L2: CSE without City
- **Query**: `site:wolt.com "Pizza House"`
- **Trigger**: Always (whether L1 tried or not)
- **Success**: Returns `status='FOUND'`, `url=<direct link>`, `meta.layerUsed=2`
- **Failure**: Falls through to L3

#### L3: Internal Search Fallback
- **URL Generation**:
  - Wolt: `https://wolt.com/search?q=Pizza%20House`
  - 10bis: `https://www.10bis.co.il/search?q=Pizza%20House`
- **Always Succeeds**: Returns `status='NOT_FOUND'`, `url=<search link>`, `meta.layerUsed=3`
- **Purpose**: Provides fallback CTA ("Search on Wolt/10bis")

### Host Allowlisting

**Wolt**:
- `wolt.com`
- `*.wolt.com` (supports subdomains like `tel-aviv.wolt.com`)

**10bis**:
- `10bis.co.il`
- `*.10bis.co.il`

Only URLs matching these patterns are accepted from CSE results.

## Components

### 1. GoogleCSEClient (`google-cse-client.ts`)

Low-level CSE API client with reliability features:

```typescript
const client = new GoogleCSEClient({
  apiKey: 'your_key',
  searchEngineId: 'your_cx',
  timeoutMs: 5000,      // 5s timeout per search
  maxRetries: 2,        // 2 retries = 3 total attempts
});

// Returns normalized results
const results = await client.search(query, 5);
// [{title, url, snippet}, ...]
```

**Features**:
- ✅ Timeout protection (5s default)
- ✅ Exponential backoff (1s → 2s → 4s)
- ✅ Transient error detection (5xx, timeouts, network errors)
- ✅ Normalized result format

### 2. ProviderDeepLinkResolver (`provider-deeplink-resolver.ts`)

High-level resolution orchestrator:

```typescript
const resolver = new ProviderDeepLinkResolver(cseClient);

const result = await resolver.resolve({
  provider: 'wolt',
  name: 'Pizza House',
  cityText: 'Tel Aviv',
});

// Result:
// {
//   status: 'FOUND' | 'NOT_FOUND',
//   url: 'https://wolt.com/...',
//   meta: {
//     layerUsed: 1 | 2 | 3,
//     source: 'cse' | 'internal'
//   }
// }
```

**Logic Flow**:
1. If `cityText` → Try L1 (CSE + city)
2. If L1 fails or no city → Try L2 (CSE only)
3. If L2 fails → Return L3 (internal search)

### 3. Worker Integration

Both Wolt and 10bis workers now use the resolver:

```typescript
// Before (old approach):
const searchResults = await searchAdapter.searchWeb(query, 5);
const matchResult = findBestMatch(searchResults, name, city);

// After (new approach):
const resolveResult = await resolver.resolve({
  provider: 'wolt',
  name,
  cityText,
});
const { status, url, meta } = resolveResult;
```

## Data Model Changes

### ProviderState (Enhanced)

```typescript
interface ProviderState {
  status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
  url: string | null;
  updatedAt?: string;
  meta?: {
    layerUsed?: 1 | 2 | 3;    // NEW: Resolution layer
    source?: 'cse' | 'internal'; // NEW: Resolution source
  };
}
```

### Restaurant Result

```typescript
interface RestaurantResult {
  providers?: {
    wolt?: ProviderState;     // Includes meta
    tenbis?: ProviderState;   // Includes meta
  };
  
  // Legacy (no meta)
  wolt?: {
    status: 'FOUND' | 'NOT_FOUND' | 'PENDING';
    url: string | null;
  };
}
```

### WebSocket Patch

```typescript
{
  type: 'RESULT_PATCH',
  requestId: 'req_123',
  placeId: 'ChIJ...',
  patch: {
    providers: {
      wolt: {
        status: 'FOUND',
        url: 'https://wolt.com/...',
        updatedAt: '2026-02-03T20:00:00Z',
        meta: {
          layerUsed: 1,
          source: 'cse'
        }
      }
    },
    // Legacy field (backward compatible, no meta)
    wolt: {
      status: 'FOUND',
      url: 'https://wolt.com/...'
    }
  }
}
```

## Logging

### Per-Resolution Log

One log entry per provider resolution with full metadata:

```json
{
  "event": "provider_link_resolved",
  "provider": "wolt",
  "status": "FOUND",
  "layerUsed": 1,
  "source": "cse",
  "urlHost": "wolt.com",
  "query": "site:wolt.com \"Pizza House\" \"Tel Aviv\""
}
```

### Aggregate Metrics

Already tracked by `metrics-collector.ts`:
- `provider_layer_distribution` - Status counts per provider
- `cse_calls_per_request` - Total CSE API calls

## Configuration

### Environment Variables

```bash
# Google Custom Search API (required for L1/L2)
GOOGLE_CSE_API_KEY=AIzaSy...your_key_here
GOOGLE_CSE_ENGINE_ID=017576662512468239146:omuauf_lfve

# Feature flags
ENABLE_WOLT_ENRICHMENT=true
ENABLE_TENBIS_ENRICHMENT=true

# Cost controls (from previous implementation)
MAX_RESULTS_TO_ENRICH=10
MAX_CONCURRENT_PROVIDER_JOBS=3
```

### CSE Setup

1. **Create Programmable Search Engine**:
   - Go to https://programmablesearchengine.google.com/
   - Add sites: `wolt.com`, `10bis.co.il`
   - Or use "Search the entire web" (relies on `site:` operator)
   - Copy Search Engine ID

2. **Enable Custom Search API**:
   - Go to https://console.cloud.google.com/apis/library
   - Enable "Custom Search API"
   - Create API key
   - Copy API key

3. **Set Environment Variables**: See above

## Behavior Matrix

| Scenario | L1 Result | L2 Result | Final Status | Final URL | Layer | Source |
|----------|-----------|-----------|--------------|-----------|-------|--------|
| City + CSE hit | FOUND | - | FOUND | Direct link | 1 | cse |
| City + CSE miss | NOT_FOUND | FOUND | FOUND | Direct link | 2 | cse |
| No city + CSE hit | (skipped) | FOUND | FOUND | Direct link | 2 | cse |
| All CSE miss | NOT_FOUND | NOT_FOUND | NOT_FOUND | Search link | 3 | internal |
| No CSE configured | (skipped) | (skipped) | NOT_FOUND | Search link | 3 | internal |

## L3 Fallback Behavior

**Key Design Decision**: L3 returns `status='NOT_FOUND'` with a search URL.

**Rationale**:
- Provides better UX than leaving users with no action
- Frontend can show "Search on Wolt/10bis" CTA button
- Status remains `NOT_FOUND` to indicate we didn't find a direct link
- `meta.layerUsed=3` allows frontend to handle differently

**Frontend Implementation** (recommended):
```typescript
if (result.providers.wolt.status === 'NOT_FOUND' && 
    result.providers.wolt.meta?.layerUsed === 3) {
  // Show "Search on Wolt" button
  button.text = 'Search on Wolt';
  button.url = result.providers.wolt.url; // Search URL
} else if (result.providers.wolt.status === 'FOUND') {
  // Show "Order on Wolt" button
  button.text = 'Order on Wolt';
  button.url = result.providers.wolt.url; // Direct link
}
```

## Error Handling

### CSE Errors
- **Timeout** → Retried (exponential backoff)
- **5xx errors** → Retried
- **429 (rate limit)** → Retried
- **4xx errors** → NOT retried (permanent failure)

### Fallback Guarantee
- If all CSE attempts fail → L3 always succeeds
- No job can fail without providing a result
- `NOT_FOUND` is a valid success state

### Safety Guards (from previous implementation)
- Worker timeout → Write NOT_FOUND + publish patch
- Queue failure → Emergency NOT_FOUND patch
- Redis unavailable → Fallback NOT_FOUND patch

## Testing

### Test L1 (CSE with city)
```bash
# Set CSE credentials
export GOOGLE_CSE_API_KEY=your_key
export GOOGLE_CSE_ENGINE_ID=your_cx

# Search with city
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza house tel aviv"}'

# Check logs
grep "provider_link_resolved.*layerUsed.*1" server/logs/server.log
```

### Test L2 (CSE without city)
```bash
# Search without city or with unknown restaurant
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "unknown restaurant name"}'

# Check logs
grep "provider_link_resolved.*layerUsed.*2" server/logs/server.log
```

### Test L3 (Internal fallback)
```bash
# Unset CSE credentials (or use invalid)
unset GOOGLE_CSE_API_KEY

# Any search will use L3
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza tel aviv"}'

# Check logs
grep "provider_link_resolved.*layerUsed.*3.*source.*internal" server/logs/server.log
```

## Monitoring Queries

```bash
# Watch layer distribution
grep "provider_link_resolved" server/logs/server.log | \
  jq -r '[.layerUsed, .source, .status] | @csv' | \
  sort | uniq -c

# Watch CSE performance
grep "cse_search" server/logs/server.log | \
  jq -r '[.event, .resultCount, .attempt] | @csv'

# Watch L3 fallback usage
grep "layerUsed.*3" server/logs/server.log | wc -l
```

## API Cost Analysis

### CSE API Costs
- **Free tier**: 100 queries/day
- **Paid tier**: $5 per 1,000 queries

### Cost per Resolution
- **L1 attempt**: 1 CSE call
- **L2 attempt**: 1 CSE call
- **L3 fallback**: 0 CSE calls (free)

### Example Calculation
100 searches/day × 10 results/search × 2 providers = 2,000 potential resolutions/day

**Worst case** (all L1 + L2):
- 2,000 × 2 calls = 4,000 CSE calls/day
- Monthly: ~$600/month

**With caching** (70% hit rate):
- 600 cache misses × 2 calls = 1,200 CSE calls/day
- Monthly: ~$180/month

**With L3 fallback** (50% hit L1/L2, 50% L3):
- 1,000 × 1.5 avg calls = 1,500 CSE calls/day
- Monthly: ~$225/month

## Files Created/Modified

### New Files
- `google-cse-client.ts` - Low-level CSE API client
- `provider-deeplink-resolver.ts` - 3-layer resolution orchestrator
- `CSE_3LAYER_IMPLEMENTATION.md` - This document

### Modified Files
**Type Definitions**:
- `search.types.ts` - Added `meta` to `ProviderState`
- `websocket-protocol.ts` - Added `meta` to `ProviderState`

**Wolt**:
- `wolt-worker.ts` - Uses resolver instead of search adapter
- `wolt-job-queue.ts` - Constructor takes resolver
- `wolt-job-queue.instance.ts` - Creates resolver from env

**10bis**:
- `tenbis-worker.ts` - Uses resolver instead of search adapter
- `tenbis-job-queue.ts` - Constructor takes resolver
- `tenbis-job-queue.instance.ts` - Creates resolver from env

**WebSocket**:
- `websocket-manager.ts` - `publishProviderPatch()` accepts meta parameter

## Backward Compatibility

✅ **Legacy `wolt` field**: Still populated (without meta)
✅ **Existing cache entries**: Work without meta (graceful degradation)
✅ **Frontend**: Can ignore meta if not needed
✅ **WebSocket protocol**: Additive changes only

## Future Enhancements

1. **L4: Fuzzy matching fallback**: If L3, try fuzzy name search on CSE
2. **Smart layer selection**: ML model to predict best layer
3. **Regional CSE engines**: Different engines per country
4. **Cache L3 results**: Cache internal search URLs too
5. **A/B testing**: Test L2-only vs full 3-layer

## Summary

✅ **3-layer resolution**: L1 (CSE+city) → L2 (CSE) → L3 (internal)
✅ **Host allowlisting**: Only accept URLs from provider domains
✅ **Timeout + retry**: 5s timeout, 2 retries with exponential backoff
✅ **Structured logging**: One log per resolution with full metadata
✅ **Meta field**: `{layerUsed, source}` in cache + WebSocket patches
✅ **Backward compatible**: Legacy fields still work
✅ **Cost optimized**: L3 fallback prevents unnecessary CSE calls
✅ **Zero failures**: L3 always succeeds, no stuck PENDING states
