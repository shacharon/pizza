# Wolt Enrichment Module

## Overview

Cache-first enrichment stage that attaches Wolt restaurant link data to search results.

**Pipeline Position:** AFTER Google results available, BEFORE final response build.

## Flow

```
Google Results (finalResults)
    ↓
[Wolt Enrichment Service]
    ├─ For each restaurant:
    │   ├─ Check Redis: ext:wolt:place:<placeId>
    │   │   ├─ Cache HIT → Attach wolt.status/url
    │   │   └─ Cache MISS → Attach wolt.status='PENDING', url=null
    │   │
    │   └─ On cache miss:
    │       ├─ Acquire lock: ext:wolt:lock:<placeId> (SET NX, TTL 60s)
    │       │   ├─ Lock acquired → Trigger background job
    │       │   └─ Lock held → Skip (another worker handling it)
    │       │
    │       └─ Background job (TODO: Prompt 3)
    │           ├─ Search Wolt API
    │           ├─ Match restaurant
    │           ├─ Cache result (TTL: 14d FOUND, 24h NOT_FOUND)
    │           └─ Publish WS RESULT_PATCH event
    ↓
Final Response (with wolt data attached)
```

## Files

- `wolt-enrichment.service.ts` - Main enrichment logic
- `wolt-enrichment.service.test.ts` - Unit tests
- `README.md` - This file

## Usage

```typescript
import { enrichWithWoltLinks } from "./enrichment/wolt/wolt-enrichment.service.js";

// In orchestrator, after finalResults are available:
await enrichWithWoltLinks(finalResults, requestId, cityText, ctx);

// Results are mutated in-place with wolt field:
// {
//   placeId: "ChIJ...",
//   name: "Pizza House",
//   wolt: {
//     status: "FOUND" | "NOT_FOUND" | "PENDING",
//     url: "https://..." | null
//   }
// }
```

## Environment Variables

```bash
# Feature flag (required)
ENABLE_WOLT_ENRICHMENT=true

# Redis connection (required)
REDIS_URL=redis://localhost:6379
```

## Structured Logs

All events include:

- `requestId` - Search request ID
- `placeId` - Google Place ID
- `restaurantName` - Restaurant name
- `cityText` - Optional city context

### Event Types

- `wolt_cache_hit` - Cache hit, attached FOUND/NOT_FOUND
- `wolt_cache_miss` - Cache miss, attached PENDING
- `wolt_lock_acquired` - Lock acquired, background job triggered
- `wolt_lock_skipped` - Lock held by another worker
- `wolt_enrichment_disabled` - Feature flag disabled
- `wolt_enrichment_error` - Error occurred (non-fatal)

## Redis Schema

### Cache Entry

```
Key: ext:wolt:place:<placeId>
Value: { url: string|null, status: 'FOUND'|'NOT_FOUND', updatedAt: ISO }
TTL: 14 days (FOUND) | 24 hours (NOT_FOUND)
```

### Anti-thrash Lock

```
Key: ext:wolt:lock:<placeId>
Value: "1"
TTL: 60 seconds
```

## Testing

```bash
# Run unit tests
npm test -- wolt-enrichment.service.test.ts

# Coverage includes:
# - Cache hit attaches FOUND/NOT_FOUND
# - Cache miss sets PENDING
# - Lock prevents duplicate enqueue
# - Feature flag disables enrichment
# - Handles missing Redis gracefully
# - Error handling (cache read, lock, invalid JSON)
```

## Next Steps (Prompt 3)

- [ ] Implement background job queue integration
- [ ] Implement Wolt API client
- [ ] Implement fuzzy restaurant matching
- [ ] Publish WS RESULT_PATCH events
- [ ] Add integration tests with real Redis

## Design Principles

✅ **Non-blocking** - Always returns immediately  
✅ **Cache-first** - Check cache before triggering jobs  
✅ **Anti-thrash** - Lock prevents duplicate parallel jobs  
✅ **Graceful degradation** - Errors are non-fatal  
✅ **Minimal DTO extension** - Only adds `wolt?` field  
✅ **Structured logging** - All events are observable
