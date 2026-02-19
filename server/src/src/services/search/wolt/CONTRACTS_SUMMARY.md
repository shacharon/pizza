# Wolt Link Enrichment - Contracts Summary

Quick reference for data contracts, WS events, and Redis schema.

---

## TS Types/Interfaces

### Restaurant DTO Extension

```typescript
// In: server/src/services/search/types/search.types.ts

export interface RestaurantResult {
  // ... existing fields (id, placeId, name, etc.)

  // External enrichments (async, non-blocking)
  wolt?: {
    status: "FOUND" | "NOT_FOUND" | "PENDING";
    url: string | null;
  };
}
```

### Wolt Enrichment Types

```typescript
// In: server/src/services/search/wolt/wolt-enrichment.contracts.ts

export type WoltEnrichmentStatus = "FOUND" | "NOT_FOUND" | "PENDING";

export interface WoltEnrichment {
  status: WoltEnrichmentStatus;
  url: string | null;
}

export interface WoltCacheEntry {
  url: string | null;
  status: "FOUND" | "NOT_FOUND";
  updatedAt: string; // ISO timestamp
}
```

---

## WebSocket Event Schema

### RESULT_PATCH Event

```typescript
// In: server/src/infra/websocket/websocket-protocol.ts

export interface WSServerResultPatch {
  type: "RESULT_PATCH";
  requestId: string; // Original search request
  placeId: string; // Restaurant identifier (matches RestaurantResult.placeId)
  patch: {
    wolt?: {
      status: "FOUND" | "NOT_FOUND"; // Never PENDING in patch
      url: string | null;
    };
  };
}

// Added to WSServerMessage union type:
export type WSServerMessage =
  | WSServerStatus
  | WSServerStreamDelta
  | WSServerStreamDone
  | WSServerRecommendation
  | WSServerError
  | WSServerAssistantProgress
  | WSServerAssistantSuggestion
  | WSServerAssistant
  | WSServerAssistantError
  | WSServerSubAck
  | WSServerSubNack
  | WSServerConnectionStatus
  | WSServerResultPatch; // ← NEW
```

### Where Consumed

**Backend:**

- `server/src/services/search/wolt/wolt-matcher.worker.ts`
  → Publishes `RESULT_PATCH` after enrichment completes

**Frontend:**

- `llm-angular/src/app/features/unified-search/services/websocket.service.ts`
  → Parses `RESULT_PATCH`, emits to result store

- `llm-angular/src/app/features/unified-search/state/search-results.store.ts`
  → `patchRestaurant(placeId, patch)` method

---

## Redis Key Naming + TTL Constants

### Key Patterns

```typescript
// In: server/src/services/search/wolt/wolt-enrichment.contracts.ts

export const WOLT_REDIS_KEYS = {
  /**
   * Cache key for Wolt link by placeId
   * Pattern: ext:wolt:place:<placeId>
   * Example: ext:wolt:place:ChIJ7cv00DxMHRURm-NuI6SVf8k
   */
  place: (placeId: string) => `ext:wolt:place:${placeId}`,

  /**
   * Anti-thrash lock (prevents duplicate parallel jobs)
   * Pattern: ext:wolt:lock:<placeId>
   * Value: '1' (simple flag)
   */
  lock: (placeId: string) => `ext:wolt:lock:${placeId}`,
} as const;
```

### TTL Constants

```typescript
export const WOLT_CACHE_TTL_SECONDS = {
  /**
   * TTL for successful Wolt link match
   * 14 days = 1,209,600 seconds
   */
  FOUND: 14 * 24 * 60 * 60,

  /**
   * TTL for negative result (restaurant not on Wolt)
   * 24 hours = 86,400 seconds
   */
  NOT_FOUND: 24 * 60 * 60,

  /**
   * TTL for anti-thrash lock
   * 60 seconds (job execution window)
   */
  LOCK: 60,
} as const;
```

### Redis Value Schema

**Cache Entry (`ext:wolt:place:<placeId>`):**

```json
{
  "url": "https://wolt.com/en/isr/tel-aviv/restaurant/xyz" | null,
  "status": "FOUND" | "NOT_FOUND",
  "updatedAt": "2026-02-03T14:23:45.123Z"
}
```

**Lock Entry (`ext:wolt:lock:<placeId>`):**

```
"1"
```

---

## Acceptance Criteria ✓

✅ **Initial response returns restaurants immediately**

- Wolt enrichment is async, non-blocking

✅ **Cache miss → restaurant.wolt.status='PENDING', url=null**

- Check Redis: `ext:wolt:place:<placeId>`
- Not found → attach `{ status: 'PENDING', url: null }`
- Trigger background job (if lock acquired)

✅ **Enrichment completes → WS RESULT_PATCH updates only that restaurant**

- Job finishes → store in Redis with TTL
- Publish `WSServerResultPatch` with `placeId`
- Client matches by `placeId`, merges `patch.wolt`

✅ **Redis storage (no DB)**

- Key: `ext:wolt:place:<placeId>`
- Value: `{ url: string|null, status: 'FOUND'|'NOT_FOUND', updatedAt: ISO }`
- TTL: FOUND=14d, NOT_FOUND=24h

✅ **Anti-thrash lock**

- Key: `ext:wolt:lock:<placeId>` => '1'
- TTL: 60s
- Prevents duplicate parallel enrichment jobs

---

## Files Modified

✅ `server/src/infra/websocket/websocket-protocol.ts`

- Added `WSServerResultPatch` interface
- Added to `WSServerMessage` union type

✅ `server/src/services/search/types/search.types.ts`

- Extended `RestaurantResult` with `wolt?` field

✅ `server/src/services/search/wolt/wolt-enrichment.contracts.ts` (NEW)

- All types, Redis keys, TTL constants

✅ `server/src/services/search/wolt/WOLT_ENRICHMENT_DESIGN.md` (NEW)

- Full implementation guide

✅ `server/src/services/search/wolt/CONTRACTS_SUMMARY.md` (NEW)

- This file (quick reference)
