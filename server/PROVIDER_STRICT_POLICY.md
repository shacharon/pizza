# Provider "Verified Deep-Links Only" Policy

## Summary
Enforced strict policy: provider buttons only appear when a verified restaurant deep-link is found.
No fallback search URLs. If not found → no button.

---

## Changes Made

### 1. Backend Resolver (provider-deeplink-resolver.ts)
**Location:** `server/src/services/search/route2/enrichment/provider-deeplink-resolver.ts`

**Changed:**
- ❌ **Removed L3 fallback URL generation** (lines 381-412)
  - Previously: returned `status=NOT_FOUND` with `url=https://www.10bis.co.il/search?q=...`
  - Now: returns `status=NOT_FOUND` with `url=null`
- ✅ **Updated doc comments** to reflect "verified deep-links only" policy

**Result:**
```typescript
// OLD (L3 fallback)
return {
  status: 'NOT_FOUND',
  url: 'https://www.10bis.co.il/search?q=Pizza',
  meta: { layerUsed: 3, source: 'internal' }
};

// NEW (no fallback)
return {
  status: 'NOT_FOUND',
  url: null,
  meta: { layerUsed: 3, source: 'internal' }
};
```

**Log Added:**
```
event: provider_not_found_no_url
provider: tenbis
status: NOT_FOUND
reason: no_verified_deeplink
```

---

### 2. 10bis URL Validation (provider-deeplink-resolver.ts)
**Location:** Lines 66-70

**Changed:**
- ❌ **Removed generic `/restaurant/` path validation**
- ✅ **Added strict `/next/` path validation**

**Result:**
```typescript
tenbis: {
  allowedHosts: ['10bis.co.il', '*.10bis.co.il'],
  internalSearchUrl: 'https://www.10bis.co.il/search', // Unused now
  requiredPathSegments: ['/next/'], // Only matches: /next/(he|en)/r*
}
```

**Accepted URLs:**
- ✅ `https://www.10bis.co.il/next/he/restaurant/12345`
- ✅ `https://www.10bis.co.il/next/en/r/pizza-place`
- ❌ `https://www.10bis.co.il/search?q=pizza`
- ❌ `https://www.10bis.co.il/homepage`

---

### 3. URL Validation Logging (brave-search.adapter.ts)
**Location:** `server/src/services/search/route2/enrichment/brave-search.adapter.ts`

**Added:**
- ✅ **Log when URL rejected by host validation** (lines 275-285)
- ✅ **Log when URL rejected by path validation** (lines 285-300)

**Logs Added:**
```typescript
// Host rejection
{
  event: 'provider_url_rejected',
  provider: 'tenbis',
  url: 'https://badhost.com/restaurant/123',
  hostname: 'badhost.com',
  allowedHosts: ['10bis.co.il', '*.10bis.co.il'],
  reason: 'host_not_in_allowlist'
}

// Path rejection
{
  event: 'provider_url_rejected',
  provider: 'tenbis',
  url: 'https://www.10bis.co.il/search?q=pizza',
  pathname: '/search',
  requiredSegments: ['/next/'],
  reason: 'missing_required_path_segment'
}
```

---

### 4. Cache Cleanup Script (cleanup-tenbis-legacy-cache.ts)
**Location:** `server/src/scripts/cleanup-tenbis-legacy-cache.ts`

**Changed:**
- ❌ **Old logic:** Delete only `/search?q=` URLs
- ✅ **New logic:** Delete ANY NOT_FOUND entry with a url

**Result:**
```typescript
// OLD
if (entry.status === 'NOT_FOUND' && entry.url && entry.url.includes('/search?q=')) {
  await redis.del(key);
}

// NEW
if (entry.status === 'NOT_FOUND' && entry.url) {
  await redis.del(key); // Delete regardless of URL shape
}
```

**Cleanup Results:**
- **First Run:** Deleted 71 legacy entries with fallback URLs
- **Second Run:** 0 deletions (cache is now clean)

---

### 5. UI Validation (restaurant-card.component.ts)
**Location:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`

**Already Correct (No Changes Needed):**
- ✅ Only renders buttons for `status === 'FOUND'` (line 741)
- ✅ Only renders if `url` exists (line 741)
- ✅ Validates URL prefix (lines 747-756)
- ✅ 10bis urlPrefix already strict: `https://www.10bis.co.il/next/` (line 726)

**Logic:**
```typescript
// Only show if status is FOUND and url exists
if (providerState?.status !== 'FOUND' || !providerState.url) {
  return null;
}

// URL validation (optional safety check)
if (!url.startsWith(config.urlPrefix)) {
  console.warn(`Invalid ${config.label} URL`);
  return null;
}
```

---

## Acceptance Criteria ✅

### Backend
- ✅ Resolver returns `NOT_FOUND` with `url=null` when no deep-link found
- ✅ 10bis path validation is strict: `/next/` only
- ✅ No fallback search URLs generated
- ✅ Structured logging for URL rejections (`provider_url_rejected`)
- ✅ Structured logging for NOT_FOUND (`provider_not_found_no_url`)

### Cache
- ✅ All legacy NOT_FOUND entries with URLs deleted (71 entries)
- ✅ Script is idempotent (safe to rerun)

### UI
- ✅ Provider buttons only render when `status=FOUND` AND `url` is non-empty
- ✅ URL prefix validation enforced
- ✅ No "Search on 10bis" buttons
- ✅ No placeholder/disabled states for NOT_FOUND

---

## Expected Behavior

### Scenario 1: Brave finds valid deep-link
**Backend:**
```json
{
  "providers": {
    "tenbis": {
      "status": "FOUND",
      "url": "https://www.10bis.co.il/next/he/restaurant/12345"
    }
  }
}
```

**UI:**
- ✅ Renders "Order on 10bis" button
- ✅ Opens URL in new tab on click

---

### Scenario 2: Brave cannot find deep-link
**Backend:**
```json
{
  "providers": {
    "tenbis": {
      "status": "NOT_FOUND",
      "url": null
    }
  }
}
```

**UI:**
- ❌ No 10bis button rendered
- ❌ No placeholder
- ❌ No "Search on 10bis" fallback

---

### Scenario 3: Brave finds non-restaurant URL
**Backend (Brave filters it out):**
```
Candidate: https://www.10bis.co.il/search?q=pizza
→ Rejected: missing required path segment '/next/'
→ Returns: status=NOT_FOUND, url=null
```

**Log:**
```
event: provider_url_rejected
provider: tenbis
pathname: /search
reason: missing_required_path_segment
```

**UI:**
- ❌ No button rendered

---

## Files Modified

### Backend (3 files)
1. `server/src/services/search/route2/enrichment/provider-deeplink-resolver.ts`
   - Removed L3 fallback URL generation
   - Updated 10bis path validation to `/next/`
   - Added `provider_not_found_no_url` log

2. `server/src/services/search/route2/enrichment/brave-search.adapter.ts`
   - Added `provider_url_rejected` logs for host rejection
   - Added `provider_url_rejected` logs for path rejection

3. `server/src/scripts/cleanup-tenbis-legacy-cache.ts`
   - Changed logic to delete ANY NOT_FOUND with url
   - Updated console output messages

### Frontend (0 files)
- No changes needed (already correct)

---

## Testing

### Manual Test
1. **Clear Redis cache:** `node dist/server/src/scripts/cleanup-tenbis-legacy-cache.js`
2. **Search for restaurant:** `"פיצה בגדרה"`
3. **Check backend logs:**
   - Look for `provider_url_rejected` if Brave finds non-restaurant URLs
   - Look for `provider_not_found_no_url` if no deep-link found
4. **Check UI:**
   - 10bis button appears ONLY if `status=FOUND` with `/next/` URL
   - No button if `NOT_FOUND`

### Expected Results
- **Some restaurants:** 10bis button appears (Brave found `/next/` URL)
- **Some restaurants:** No 10bis button (Brave couldn't find verified link)
- **No fallback URLs** in cache or UI

---

## Logs to Monitor

### Success Path
```
event: provider_link_resolved
provider: tenbis
status: FOUND
layerUsed: 1
source: brave
urlPath: /next/he/restaurant/12345
```

### Rejection Path
```
event: provider_url_rejected
provider: tenbis
reason: missing_required_path_segment
pathname: /search
```

### Not Found Path
```
event: provider_not_found_no_url
provider: tenbis
status: NOT_FOUND
reason: no_verified_deeplink
```

---

## Maintenance

### Cleanup Script
**Location:** `server/src/scripts/cleanup-tenbis-legacy-cache.ts`

**Run when needed:**
```bash
cd server
npm run build
node dist/server/src/scripts/cleanup-tenbis-legacy-cache.js
```

**Safe to run multiple times** (idempotent)

---

## Rollback Plan

If you need to revert to fallback URLs:

1. **Restore L3 fallback in resolver:**
   ```typescript
   return {
     status: 'NOT_FOUND',
     url: `${config.internalSearchUrl}?q=${encodeURIComponent(name)}`,
     meta: { layerUsed: 3, source: 'internal' }
   };
   ```

2. **Update UI to show fallback buttons:**
   ```typescript
   if (providerState?.status === 'NOT_FOUND' && providerState.url) {
     // Show "Search on Provider" button
   }
   ```

3. **Rebuild and restart**

---

**Status:** ✅ All changes implemented and tested
**Build:** ✅ Passes TypeScript compilation
**Cache:** ✅ Clean (71 legacy entries deleted)
