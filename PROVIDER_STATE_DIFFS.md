# ProviderState Implementation - Key Diffs

## Quick Reference: All Changes

### 1. Backend: Define ProviderState Type
**File:** `server/src/services/search/types/search.types.ts`
```typescript
+export interface ProviderState {
+  status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
+  url: string | null;
+}
```

---

### 2. Backend: Update RestaurantResult
**File:** `server/src/services/search/types/search.types.ts`
```typescript
export interface RestaurantResult {
  // ... existing fields ...
  
+ providers?: {
+   wolt?: ProviderState;
+ };
  wolt?: {                    // DEPRECATED (kept for backward compat)
    status: 'FOUND' | 'NOT_FOUND' | 'PENDING';
    url: string | null;
  };
}
```

---

### 3. Backend: Update WSServerResultPatch
**File:** `server/src/infra/websocket/websocket-protocol.ts`
```typescript
export interface WSServerResultPatch {
  type: 'RESULT_PATCH';
  requestId: string;
  placeId: string;
  patch: {
+   providers?: {
+     wolt?: ProviderState;
+   };
    wolt?: {                  // DEPRECATED (kept for backward compat)
      status: 'FOUND' | 'NOT_FOUND';
      url: string | null;
    };
  };
}
```

---

### 4. Backend: Update Result Mapper
**File:** `server/src/services/search/route2/stages/google-maps/result-mapper.ts`
```typescript
return {
  // ... other fields ...
  
+ providers: {
+   wolt: { status: 'PENDING', url: null }
+ },
  wolt: { status: 'PENDING', url: null }  // DEPRECATED
};
```

---

### 5. Backend: Update Wolt Worker Patch Publisher
**File:** `server/src/services/search/route2/enrichment/wolt/wolt-worker.ts`
```typescript
const patchEvent: WSServerResultPatch = {
  type: 'RESULT_PATCH',
  requestId,
  placeId,
  patch: {
+   providers: {
+     wolt: { status, url }
+   },
    wolt: { status, url }   // DEPRECATED
  }
};
```

---

### 6. Backend: Update Wolt Job Queue Fallback Patches (2 locations)
**File:** `server/src/services/search/route2/enrichment/wolt/wolt-job-queue.ts`
```typescript
const patchEvent = {
  type: 'RESULT_PATCH',
  requestId: job.requestId,
  placeId: job.placeId,
  patch: {
+   providers: {
+     wolt: { status: 'NOT_FOUND', url: null }
+   },
    wolt: { status: 'NOT_FOUND', url: null }  // DEPRECATED
  }
};
```

---

### 7. Frontend: Define ProviderState Type
**File:** `llm-angular/src/app/domain/types/search.types.ts`
```typescript
+export interface ProviderState {
+  status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
+  url: string | null;
+}
```

---

### 8. Frontend: Update Restaurant Interface
**File:** `llm-angular/src/app/domain/types/search.types.ts`
```typescript
export interface Restaurant {
  // ... existing fields ...
  
+ providers?: {
+   wolt?: ProviderState;
+ };
  wolt?: {                    // DEPRECATED (kept for backward compat)
    status: 'FOUND' | 'NOT_FOUND' | 'PENDING';
    url: string | null;
  };
}
```

---

### 9. Frontend: Update WSServerResultPatch
**File:** `llm-angular/src/app/core/models/ws-protocol.types.ts`
```typescript
export interface WSServerResultPatch {
  type: 'RESULT_PATCH';
  requestId: string;
  placeId: string;
  patch: {
+   providers?: {
+     wolt?: ProviderState;
+   };
    wolt?: {                  // DEPRECATED (kept for backward compat)
      status: 'FOUND' | 'NOT_FOUND';
      url: string | null;
    };
  };
}
```

---

### 10. Frontend: Update SearchStore Patch Handler
**File:** `llm-angular/src/app/state/search.store.ts`
```typescript
patchRestaurant(placeId: string, patch: Partial<Restaurant>): void {
  const updatedResults = currentResponse.results?.map(restaurant => {
    if (restaurant.placeId === placeId) {
+     // Deep merge providers field to preserve other providers
+     const mergedProviders = patch.providers 
+       ? { ...restaurant.providers, ...patch.providers }
+       : restaurant.providers;
-     return { ...restaurant, ...patch };
+     return { ...restaurant, ...patch, providers: mergedProviders };
    }
    return restaurant;
  });
  
  // Same deep merge for groups array
  let updatedGroups = currentResponse.groups?.map(group => ({
    ...group,
    results: group.results.map(restaurant => {
      if (restaurant.placeId === placeId) {
+       const mergedProviders = patch.providers 
+         ? { ...restaurant.providers, ...patch.providers }
+         : restaurant.providers;
-       return { ...restaurant, ...patch };
+       return { ...restaurant, ...patch, providers: mergedProviders };
      }
      return restaurant;
    })
  }));
}
```

---

### 11. NEW FILE: Zod Schemas
**File:** `server/src/services/search/types/search.schemas.ts`
```typescript
import { z } from 'zod';

export const ProviderStateSchema = z.object({
  status: z.enum(['PENDING', 'FOUND', 'NOT_FOUND']),
  url: z.string().nullable()
});

export const ProvidersSchema = z.object({
  wolt: ProviderStateSchema.optional()
});

export const RestaurantProviderFieldsSchema = z.object({
  providers: ProvidersSchema.optional(),
  wolt: z.object({
    status: z.enum(['PENDING', 'FOUND', 'NOT_FOUND']),
    url: z.string().nullable()
  }).optional()
});

export const WSServerResultPatchSchema = z.object({
  type: z.literal('RESULT_PATCH'),
  requestId: z.string().min(1),
  placeId: z.string().min(1),
  patch: z.object({
    providers: ProvidersSchema.optional(),
    wolt: z.object({
      status: z.enum(['FOUND', 'NOT_FOUND']),  // No PENDING in patches
      url: z.string().nullable()
    }).optional()
  })
});
```

---

### 12. NEW FILE: Schema Tests
**File:** `server/tests/provider-state-schema.test.ts`
- 19 comprehensive tests
- All passing ✅
- Coverage: ProviderState, Providers, WSServerResultPatch, RestaurantProviderFields, Integration flow

---

## Summary Stats

| Category | Count |
|----------|-------|
| Files Modified | 9 |
| New Files | 2 |
| Backend Changes | 6 files |
| Frontend Changes | 3 files |
| Tests Added | 19 tests |
| Test Status | ✅ All Passing |

## Validation Commands

```bash
# Run schema tests
cd server && npm test tests/provider-state-schema.test.ts

# Build check (backend)
cd server && npm run build

# Build check (frontend)
cd llm-angular && npm run build
```

## Key Design Decisions

1. **Dual Field Strategy**: Both `providers.wolt` (new) and `wolt` (legacy) maintained for zero-downtime migration
2. **Deep Merge**: Frontend merges `providers` object to preserve multiple provider states
3. **Type + Zod**: TypeScript for compile-time, Zod for runtime validation
4. **Extensibility**: `providers` object ready for future providers (tripadvisor, yelp, etc.)
5. **SOLID**: Single responsibility, open for extension, interface segregation

## Migration Path

**Current State**: Both fields present and populated
**Future State**: Remove legacy `wolt` field after all consumers migrated to `providers.wolt`
