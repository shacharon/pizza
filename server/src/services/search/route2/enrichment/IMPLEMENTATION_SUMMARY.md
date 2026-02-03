# Provider Enrichment Implementation Summary

## Overview

Successfully implemented dual provider enrichment (Wolt + 10bis) with comprehensive cost controls, metrics tracking, and error handling guarantees.

## Architecture

### Provider Support
- **Wolt**: Food delivery provider (existing, enhanced)
- **10bis**: Food delivery provider (newly implemented)
- **Extensible**: Architecture supports adding more providers easily

### Cost Controls

#### 1. Per-Search Caps
- **MAX_RESULTS_TO_ENRICH**: Default 10 results per search
- Only the first N results are enriched to control API costs
- Configurable via environment variable

#### 2. Concurrency Limits
- **MAX_CONCURRENT_PROVIDER_JOBS**: Default 3 concurrent jobs
- Prevents overwhelming search APIs
- Queue-based scheduling for excess jobs
- Implemented in `concurrency-manager.ts`

#### 3. Cache-First Strategy
- Redis cache checked before triggering any job
- TTL-based: FOUND (7 days), NOT_FOUND (24 hours)
- Idempotent lock mechanism (SET NX) prevents duplicate jobs

### Error Handling Guarantees

**NO STUCK PENDING STATES** - Triple-layer safety net:

1. **Worker Level**: All errors write NOT_FOUND + publish patch
   - Timeout errors → NOT_FOUND
   - Search API errors → NOT_FOUND
   - Matching errors → NOT_FOUND

2. **Queue Level**: Fallback patch publishing
   - Worker unavailable → NOT_FOUND patch
   - Job processing error → Emergency patch

3. **Timeout Guards**: 30s job timeout with retry logic
   - Exponential backoff: 1s → 2s → 4s
   - Max 2 retries (3 total attempts)

## Metrics & Observability

### Aggregate Metrics (per requestId)

#### 1. Provider Layer Distribution
```typescript
{
  event: 'provider_layer_distribution',
  requestId: string,
  distribution: {
    wolt_found: number,
    wolt_not_found: number,
    wolt_pending: number,
    wolt_cached: number,
    tenbis_found: number,
    tenbis_not_found: number,
    tenbis_pending: number,
    tenbis_cached: number
  }
}
```

#### 2. CSE Calls Per Request
```typescript
{
  event: 'cse_calls_per_request',
  requestId: string,
  cseCallsTotal: number,
  totalRestaurants: number,
  callsPerRestaurant: number
}
```

## Feature Flags

### Environment Variables
```bash
# Enable/disable providers
ENABLE_WOLT_ENRICHMENT=true
ENABLE_TENBIS_ENRICHMENT=true

# Cost controls
MAX_RESULTS_TO_ENRICH=10
MAX_CONCURRENT_PROVIDER_JOBS=3

# Google Custom Search API (required for production)
GOOGLE_CSE_API_KEY=your_api_key_here
GOOGLE_CSE_ENGINE_ID=your_search_engine_id_here
```

## File Structure

### Core Services
```
server/src/services/search/route2/enrichment/
├── wolt/                           # Wolt provider
│   ├── wolt-search.adapter.ts      # Search adapter interface
│   ├── wolt-search.mock.ts         # Stub adapter (dev/test)
│   ├── wolt-matcher.ts             # Fuzzy name matching
│   ├── wolt-worker.ts              # Job processor
│   ├── wolt-job-queue.ts           # In-memory queue
│   ├── wolt-job-queue.instance.ts  # Singleton w/ Google CSE
│   ├── wolt-enrichment.service.ts  # Cache-first orchestrator
│   └── wolt-enrichment.contracts.ts # Types & constants
│
├── tenbis/                         # 10bis provider (NEW)
│   ├── tenbis-search.adapter.ts
│   ├── tenbis-search.mock.ts
│   ├── tenbis-matcher.ts
│   ├── tenbis-worker.ts
│   ├── tenbis-job-queue.ts
│   ├── tenbis-job-queue.instance.ts
│   ├── tenbis-enrichment.service.ts
│   └── tenbis-enrichment.contracts.ts
│
├── google-cse.adapter.ts           # Shared Google CSE adapter (NEW)
├── concurrency-manager.ts          # Job concurrency control (NEW)
└── metrics-collector.ts            # Metrics aggregation (NEW)
```

### Integration Points
```
server/src/services/search/route2/
└── route2.orchestrator.ts          # STAGE 6.5: Provider Enrichment

server/src/services/search/types/
└── search.types.ts                 # RestaurantResult.providers.{wolt,tenbis}

server/src/infra/websocket/
├── websocket-protocol.ts           # WSServerResultPatch type
└── websocket-manager.ts            # publishProviderPatch() method
```

## Data Model

### Restaurant Result (Enhanced)
```typescript
interface RestaurantResult {
  // ... existing fields
  
  // NEW: Structured providers field
  providers?: {
    wolt?: ProviderState;
    tenbis?: ProviderState;
  };
  
  // DEPRECATED: Legacy wolt field (backward compatible)
  wolt?: {
    status: 'FOUND' | 'NOT_FOUND' | 'PENDING';
    url: string | null;
  };
}

interface ProviderState {
  status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
  url: string | null;
  updatedAt?: string; // ISO timestamp
}
```

### WebSocket Protocol
```typescript
interface WSServerResultPatch {
  type: 'RESULT_PATCH';
  requestId: string;
  placeId: string;
  patch: {
    providers?: {
      wolt?: ProviderState;
      tenbis?: ProviderState;
    };
    // Legacy wolt field (backward compatible)
    wolt?: {
      status: 'FOUND' | 'NOT_FOUND';
      url: string | null;
    };
  };
}
```

## Redis Keys

### Wolt
- Cache: `provider:wolt:{placeId}` (TTL: 7d FOUND, 24h NOT_FOUND)
- Lock: `provider:wolt:lock:{placeId}` (TTL: 60s)

### 10bis
- Cache: `provider:tenbis:{placeId}` (TTL: 7d FOUND, 24h NOT_FOUND)
- Lock: `provider:tenbis:lock:{placeId}` (TTL: 60s)

## Flow Diagram

```
User Search Request
    ↓
Route2 Orchestrator (STAGE 6.5)
    ↓
[Cost Control: Take first 10 results]
    ↓
┌─────────────────────────────────────┐
│  Parallel Provider Enrichment       │
│  ┌───────────────┬───────────────┐  │
│  │ Wolt Service  │ 10bis Service │  │
│  └───────┬───────┴───────┬───────┘  │
└──────────┼───────────────┼──────────┘
           │               │
    ┌──────▼──────┐ ┌──────▼──────┐
    │ Check Cache │ │ Check Cache │
    └──────┬──────┘ └──────┬──────┘
           │               │
    ┌──────▼──────┐ ┌──────▼──────┐
    │ Cache Hit?  │ │ Cache Hit?  │
    └──────┬──────┘ └──────┬──────┘
           │               │
      YES  │  NO      YES  │  NO
           │               │
    ┌──────▼──────┐ ┌──────▼──────┐
    │ Return Data │ │ Return Data │
    └─────────────┘ └─────────────┘
           │               │
    ┌──────▼──────┐ ┌──────▼──────┐
    │ Set PENDING │ │ Set PENDING │
    │ Acquire Lock│ │ Acquire Lock│
    └──────┬──────┘ └──────┬──────┘
           │               │
    ┌──────▼──────────────▼──────┐
    │  Concurrency Manager        │
    │  (Max 3 concurrent jobs)    │
    └──────┬──────────────────────┘
           │
    ┌──────▼──────────────────────┐
    │  Background Worker           │
    │  1. Google CSE Search        │
    │  2. Fuzzy Name Matching      │
    │  3. Write to Redis Cache     │
    │  4. Publish WS RESULT_PATCH  │
    └──────┬──────────────────────┘
           │
    ┌──────▼──────────────────────┐
    │  WebSocket → Frontend        │
    │  (Update button state)       │
    └──────────────────────────────┘
```

## Configuration Guide

### Step 1: Enable Feature Flags
```bash
# In server/.env
ENABLE_WOLT_ENRICHMENT=true
ENABLE_TENBIS_ENRICHMENT=true
```

### Step 2: Configure Cost Controls
```bash
# Cap enrichment to first 10 results per search
MAX_RESULTS_TO_ENRICH=10

# Limit concurrent provider jobs to 3
MAX_CONCURRENT_PROVIDER_JOBS=3
```

### Step 3: Set Up Google Custom Search

#### 3.1 Create Programmable Search Engine
1. Go to https://programmablesearchengine.google.com/
2. Click "Add" to create a new search engine
3. Configure search features:
   - Sites to search: Add `wolt.com` and `10bis.co.il`
   - Or use "Search the entire web" and filter with `site:` operators
4. Copy the **Search Engine ID** (cx parameter)

#### 3.2 Get API Key
1. Go to https://console.cloud.google.com/apis/credentials
2. Enable "Custom Search API"
3. Create credentials → API Key
4. Copy the API key

#### 3.3 Configure Environment
```bash
GOOGLE_CSE_API_KEY=AIzaSy...your_key_here
GOOGLE_CSE_ENGINE_ID=017576662512468239146:omuauf_lfve
```

### Step 4: Restart Server
```bash
cd server && npm run dev
```

### Step 5: Verify Setup
Check logs for adapter type on startup:
```bash
grep "worker_boot" server/logs/server.log
```

Expected output:
```
[BOOT] Wolt job queue created with Google CSE adapter
[BOOT] 10bis job queue created with Google CSE adapter
```

If missing Google CSE config, you'll see:
```
[BOOT] Wolt job queue created with STUB adapter (configure GOOGLE_CSE_API_KEY...)
```

## Testing

### Test Cache Hit
```bash
# First search (cache miss → PENDING)
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza tel aviv"}'

# Second search (cache hit → FOUND/NOT_FOUND immediately)
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza tel aviv"}'
```

### Monitor Metrics
```bash
# Watch provider distribution
grep "provider_layer_distribution" server/logs/server.log | tail -5

# Watch CSE calls
grep "cse_calls_per_request" server/logs/server.log | tail -5

# Watch job queue
grep "provider_job_" server/logs/server.log | tail -20
```

### Test Cost Controls
```bash
# Search with 20 results (should only enrich first 10)
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pizza tel aviv", "limit": 20}'

# Check metrics log
grep "enrichedResults.*10" server/logs/server.log
```

## Production Checklist

- [ ] Configure Google CSE API key
- [ ] Configure Google CSE engine ID
- [ ] Restrict CSE to `wolt.com` and `10bis.co.il` domains
- [ ] Set appropriate `MAX_RESULTS_TO_ENRICH` (default: 10)
- [ ] Set appropriate `MAX_CONCURRENT_PROVIDER_JOBS` (default: 3)
- [ ] Enable Redis (required for caching)
- [ ] Monitor API quota usage in Google Cloud Console
- [ ] Set up alerts for high CSE call volume
- [ ] Monitor Redis memory usage (cache keys)

## API Costs

### Google Custom Search API
- **Free tier**: 100 queries/day
- **Paid tier**: $5 per 1,000 queries (up to 10k/day)
- **Cost per enrichment**: 1 query per provider per restaurant

### Example Calculation
- 100 searches/day × 10 results/search × 2 providers = **2,000 queries/day**
- Monthly cost: ~$300/month (if all cache misses)
- With 70% cache hit rate: ~$90/month

### Cost Optimization
1. **Cache hit rate**: 70%+ typical after warm-up
2. **Result cap**: Limit enrichment to top N results (default: 10)
3. **Concurrency cap**: Limit parallel jobs (default: 3)
4. **TTL strategy**: Longer TTL for FOUND (7d), shorter for NOT_FOUND (24h)

## Monitoring Queries

```bash
# Watch enrichment stage
grep "provider_enrichment" server/logs/server.log

# Watch cache performance
grep "cache_hit\|cache_miss" server/logs/server.log | grep -E "wolt|tenbis"

# Watch job queue stats
grep "provider_job" server/logs/server.log

# Watch error handling
grep "NOT_FOUND.*reason" server/logs/server.log

# Watch concurrency manager
grep "ConcurrencyManager" server/logs/server.log
```

## Troubleshooting

### Issue: All results show NOT_FOUND
**Cause**: Google CSE not configured or stub adapter in use
**Fix**: Set `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ENGINE_ID` in `.env`

### Issue: Some results stuck in PENDING
**Cause**: Worker errors or job timeout
**Fix**: Check logs for `job_processing_error` or `job_timeout`
**Note**: Safety guards should prevent this (triple-layer protection)

### Issue: High API costs
**Cause**: Low cache hit rate or too many results enriched
**Fix**: 
- Reduce `MAX_RESULTS_TO_ENRICH` (e.g., from 10 to 5)
- Reduce `MAX_CONCURRENT_PROVIDER_JOBS` (e.g., from 3 to 2)
- Increase cache TTL if appropriate

### Issue: Slow enrichment
**Cause**: Concurrency limit too low or search API slow
**Fix**:
- Increase `MAX_CONCURRENT_PROVIDER_JOBS` (e.g., from 3 to 5)
- Monitor Google CSE response times in logs

## Future Enhancements

1. **Additional Providers**: TripAdvisor, OpenTable, etc.
2. **Smarter Matching**: Machine learning-based name matching
3. **Cache Warming**: Pre-populate cache for popular restaurants
4. **A/B Testing**: Test different enrichment strategies
5. **Cost Analytics**: Dashboard for API usage and costs
6. **Regional CSE Engines**: Different engines per country/region

## Summary

✅ **Dual Provider Support**: Wolt + 10bis both working
✅ **Cost Controls**: Result cap (10) + concurrency limit (3)
✅ **No Stuck PENDING**: Triple-layer error handling
✅ **Metrics**: Provider distribution + CSE calls logged per request
✅ **Cache-First**: Redis with idempotent locks
✅ **Extensible**: Easy to add more providers
✅ **Production-Ready**: Google CSE integration with fallback to stub
