# Mishloha "Verified Deep-Links Only" Policy

## Summary
Enforced strict policy for Mishloha: provider buttons only appear when a verified restaurant deep-link is found.
Same policy as 10bis - no fallback search URLs. If not found → no button.

---

## Changes Made

### 1. Backend Resolver Path Validation
**File:** `server/src/services/search/route2/enrichment/provider-deeplink-resolver.ts`
**Line:** 71-75

**Changed:**
- ❌ **Old:** Generic `/restaurant/` path validation
- ✅ **New:** Strict `/now/r/` path validation

**Result:**
```typescript
mishloha: {
  allowedHosts: ['mishloha.co.il', '*.mishloha.co.il'],
  internalSearchUrl: 'https://www.mishloha.co.il/search', // Unused (no L3 fallback)
  requiredPathSegments: ['/now/r/'], // Only matches: /now/r/* restaurant pages
}
```

**Accepted URLs:**
- ✅ `https://www.mishloha.co.il/now/r/12345-pizza-place`
- ✅ `https://www.mishloha.co.il/now/r/pizza-restaurant`
- ❌ `https://www.mishloha.co.il/search?q=pizza`
- ❌ `https://www.mishloha.co.il/homepage`
- ❌ `https://www.mishloha.co.il/restaurants` (wrong path)

---

### 2. Cache Cleanup Script
**File:** `server/src/scripts/cleanup-mishloha-legacy-cache.ts`

**Created:**
- ✅ New script to delete ANY Mishloha NOT_FOUND entry with a URL
- ✅ Same logic as 10bis cleanup script
- ✅ Idempotent (safe to run multiple times)

**Run command:**
```bash
cd server
npm run build
node dist/server/src/scripts/cleanup-mishloha-legacy-cache.js
```

**First run result:**
- Total keys scanned: 0
- Deleted: 0
- Cache was clean (no legacy entries)

---

### 3. Environment Configuration
**File:** `server/.env`

**Added:**
```bash
ENABLE_MISHLOHA_ENRICHMENT=true
```

This enables Mishloha enrichment in the provider enrichment service.

**Environment Variables:**
- ✅ `ENABLE_WOLT_ENRICHMENT=true`
- ✅ `ENABLE_TENBIS_ENRICHMENT=true`
- ✅ `ENABLE_MISHLOHA_ENRICHMENT=true` (NEW)

---

### 4. UI Validation
**File:** `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts`
**Line:** 729-732

**Already Correct (No Changes Needed):**
- ✅ Only renders buttons for `status === 'FOUND'`
- ✅ Only renders if `url` exists
- ✅ Validates URL prefix: `https://www.mishloha.co.il/now/r/`

**Configuration:**
```typescript
{
  id: 'mishloha',
  label: 'Mishloha',
  urlPrefix: 'https://www.mishloha.co.il/now/r/'
}
```

---

## Expected Behavior

### ✅ Scenario 1: Brave finds valid deep-link
**Backend Response:**
```json
{
  "providers": {
    "mishloha": {
      "status": "FOUND",
      "url": "https://www.mishloha.co.il/now/r/12345-pizza-place"
    }
  }
}
```

**UI:**
- ✅ Renders "Order on Mishloha" button
- ✅ Opens URL in new tab on click

---

### ❌ Scenario 2: No verified link found
**Backend Response:**
```json
{
  "providers": {
    "mishloha": {
      "status": "NOT_FOUND",
      "url": null
    }
  }
}
```

**UI:**
- ❌ No Mishloha button rendered
- ❌ No placeholder
- ❌ No "Search on Mishloha" fallback

---

### ❌ Scenario 3: Brave finds non-restaurant URL
**Backend Process:**
```
Candidate: https://www.mishloha.co.il/search?q=pizza
→ Rejected: missing required path segment '/now/r/'
→ Returns: status=NOT_FOUND, url=null
```

**Log:**
```json
{
  "event": "provider_url_rejected",
  "provider": "mishloha",
  "pathname": "/search",
  "requiredSegments": ["/now/r/"],
  "reason": "missing_required_path_segment"
}
```

**UI:**
- ❌ No button rendered

---

## Files Modified

### Backend (3 files)
1. ✅ `server/src/services/search/route2/enrichment/provider-deeplink-resolver.ts`
   - Updated Mishloha path validation to `/now/r/`

2. ✅ `server/src/scripts/cleanup-mishloha-legacy-cache.ts`
   - Created new cleanup script

3. ✅ `server/.env`
   - Added `ENABLE_MISHLOHA_ENRICHMENT=true`

### Frontend (0 files)
- ✅ No changes needed (already correct)

---

## System Status

### All Providers (Wolt, 10bis, Mishloha)
**Policy:** "Verified Deep-Links Only" ✅

**Path Validation:**
- ✅ Wolt: `/restaurant/`
- ✅ 10bis: `/next/`
- ✅ Mishloha: `/now/r/`

**L3 Fallback:**
- ❌ No fallback search URLs generated
- ✅ Returns `status=NOT_FOUND, url=null` when not found

**UI Rendering:**
- ✅ Only shows buttons for `FOUND` with valid URL
- ✅ Validates URL prefix
- ❌ No placeholders for `PENDING` or `NOT_FOUND`

**Cache Cleanup:**
- ✅ 10bis: 71 legacy entries deleted
- ✅ Mishloha: 0 entries (cache was clean)

**Enrichment Status:**
- ✅ Wolt: Enabled
- ✅ 10bis: Enabled
- ✅ Mishloha: Enabled (NEW)

---

## Testing

### Manual Test
1. **Restart server** (to load new .env)
2. **Search for restaurant:** e.g., "פיצה בגדרה"
3. **Check backend logs:**
   - `provider_enrichment_disabled=false` for Mishloha
   - `provider_url_rejected` if Brave finds non-restaurant URLs
   - `provider_not_found_no_url` if no deep-link found
   - `provider_link_resolved` if FOUND
4. **Check UI:**
   - Mishloha button appears ONLY if `status=FOUND` with `/now/r/` URL
   - No button if `NOT_FOUND`

---

## Logs to Monitor

### Success (FOUND)
```json
{
  "event": "provider_link_resolved",
  "provider": "mishloha",
  "status": "FOUND",
  "urlPath": "/now/r/12345-pizza-place"
}
```

### Rejection (Invalid URL)
```json
{
  "event": "provider_url_rejected",
  "provider": "mishloha",
  "pathname": "/search",
  "requiredSegments": ["/now/r/"],
  "reason": "missing_required_path_segment"
}
```

### Not Found (No URL)
```json
{
  "event": "provider_not_found_no_url",
  "provider": "mishloha",
  "status": "NOT_FOUND",
  "reason": "no_verified_deeplink"
}
```

### Enrichment Enabled
```json
{
  "event": "provider_enrichment_start",
  "provider": "mishloha",
  "enabled": true
}
```

---

## Acceptance Criteria ✅

- ✅ Mishloha path validation is strict: `/now/r/*` only
- ✅ No fallback search URLs generated or stored
- ✅ Cache cleaned (0 legacy entries)
- ✅ UI only shows FOUND with valid URL
- ✅ URL prefix validation: `https://www.mishloha.co.il/now/r/`
- ✅ Enrichment enabled via `ENABLE_MISHLOHA_ENRICHMENT=true`
- ✅ Build passes
- ✅ Cleanup script is idempotent

**Status:** ✅ Mishloha strict policy enforced!

---

## Next Steps

1. **Restart your server** to load the new `ENABLE_MISHLOHA_ENRICHMENT=true` env var
2. **Test with a search** to verify Mishloha enrichment is running
3. **Check logs** for Mishloha enrichment events
4. **Verify UI** shows Mishloha buttons only when verified links are found
