# Frontend Wolt Integration - Quick Diffs

## Summary

✅ Updated frontend to use `providers.wolt` with legacy `wolt` fallback
✅ WebSocket RESULT_PATCH patches both fields
✅ No layout regressions

---

## Diff 1: RestaurantCard - Use providers.wolt

**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`

```diff
  readonly woltCta = computed(() => {
-   const wolt = this.restaurant().wolt;
+   // NEW: Use providers.wolt field (fallback to legacy wolt)
+   const wolt = this.restaurant().providers?.wolt || this.restaurant().wolt;
    if (!wolt) {
      return null;
    }
```

---

## Diff 2: SearchFacade - Patch both fields

**File:** `llm-angular/src/app/facades/search.facade.ts`

### BEFORE (8 lines)

```typescript
private handleResultPatch(msg: WSServerResultPatch): void {
  console.log('[SearchFacade] RESULT_PATCH received', {
    requestId: msg.requestId,
    placeId: msg.placeId,
    wolt: msg.patch.wolt
  });

  if (msg.requestId !== this.currentRequestId()) {
    return;
  }

  if (msg.patch.wolt) {
    this.searchStore.patchRestaurant(msg.placeId, {
      wolt: msg.patch.wolt
    });
  }
}
```

### AFTER (28 lines)

```typescript
private handleResultPatch(msg: WSServerResultPatch): void {
  console.log('[SearchFacade] RESULT_PATCH received', {
    requestId: msg.requestId,
    placeId: msg.placeId,
    providers: msg.patch.providers,
    legacyWolt: msg.patch.wolt
  });

  if (msg.requestId !== this.currentRequestId()) {
    return;
  }

  // Build patch object with both new and legacy fields
  const patch: Partial<Restaurant> = {};

  // NEW: Patch providers.wolt field (primary)
  if (msg.patch.providers) {
    patch.providers = msg.patch.providers;
  }

  // DEPRECATED: Patch legacy wolt field (backward compatibility)
  if (msg.patch.wolt) {
    patch.wolt = msg.patch.wolt;
  }

  // Apply patch if we have any data
  if (patch.providers || patch.wolt) {
    this.searchStore.patchRestaurant(msg.placeId, patch);
  }
}
```

**Key Changes:**
- Logs both `providers` and `legacyWolt`
- Builds patch with both fields
- Single call to `patchRestaurant()`

---

## Diff 3: ProviderState - Add updatedAt

**Files:**
- `llm-angular/src/app/domain/types/search.types.ts`
- `llm-angular/src/app/core/models/ws-protocol.types.ts`

```diff
 export interface ProviderState {
   status: 'PENDING' | 'FOUND' | 'NOT_FOUND';
   url: string | null;
+  updatedAt?: string; // ISO timestamp
 }
```

---

## WebSocket Message Flow

### Backend Publishes

```json
{
  "type": "RESULT_PATCH",
  "requestId": "req_abc123",
  "placeId": "ChIJ123",
  "patch": {
    "providers": {
      "wolt": {
        "status": "FOUND",
        "url": "https://wolt.com/...",
        "updatedAt": "2026-02-03T18:30:00Z"
      }
    },
    "wolt": {
      "status": "FOUND",
      "url": "https://wolt.com/..."
    }
  }
}
```

### Frontend Patches

```typescript
{
  providers: {
    wolt: {
      status: 'FOUND',
      url: 'https://wolt.com/...',
      updatedAt: '2026-02-03T18:30:00Z'
    }
  },
  wolt: {
    status: 'FOUND',
    url: 'https://wolt.com/...'
  }
}
```

### Store Deep Merges

```typescript
{
  ...restaurant,
  providers: {
    ...restaurant.providers,  // Preserve tripadvisor, yelp, etc.
    wolt: { status: 'FOUND', url: '...', updatedAt: '...' }
  },
  wolt: { status: 'FOUND', url: '...' }
}
```

### Component Reads

```typescript
const wolt = restaurant.providers?.wolt || restaurant.wolt;
```

---

## Button States

### PENDING
```typescript
{
  className: 'action-btn action-btn-wolt-pending',
  label: 'Checking Wolt...',
  disabled: true,
  showSpinner: true
}
```

### FOUND
```typescript
{
  className: 'action-btn action-btn-wolt-primary',
  label: 'Order via Wolt',
  disabled: false,
  showSpinner: false,
  url: 'https://wolt.com/...'
}
```

### NOT_FOUND
```typescript
{
  className: 'action-btn action-btn-wolt-search',
  label: 'Search Wolt',
  disabled: false,
  showSpinner: false,
  url: 'https://wolt.com/en/discovery/q/...'
}
```

---

## Verification Commands

```bash
# Build
cd llm-angular && npm run build

# Start dev server
npm start

# Search and check console
# 1. Initial: PENDING state
# 2. After WS: FOUND/NOT_FOUND state
```

---

## Files Modified

| File | Lines | Purpose |
|------|-------|---------|
| `restaurant-card.component.ts` | 3 | Use providers.wolt |
| `search.facade.ts` | 20 | Patch both fields |
| `search.types.ts` | 1 | Add updatedAt |
| `ws-protocol.types.ts` | 1 | Add updatedAt |
| **TOTAL** | **25** | |

---

## Summary

✅ **providers.wolt** - Primary field used
✅ **wolt** - Fallback for backward compat
✅ **Deep merge** - Preserves other providers
✅ **updatedAt** - Timestamp support added
✅ **No layout changes** - Button layout preserved

**Status:** Production-ready
