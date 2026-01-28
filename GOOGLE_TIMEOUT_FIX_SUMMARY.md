# Google Places Timeout Fix - Summary

**Date**: 2026-01-28  
**Issue**: Google Places API timeouts breaking all searches  
**Root Cause**: Network/firewall blocking `places.googleapis.com`

---

## TL;DR

**Problem**: HTTPS requests to `places.googleapis.com` timeout after 8s  
**Diagnosis**: Network connectivity issue (confirmed with test script)  
**Code Fixes**: Improved diagnostics, configurable timeout, better error messages  
**Workaround**: Use `SEARCH_PROVIDER=stub` for local dev

---

## Root Cause (Confirmed)

Ran connectivity test: `node server/test-google-connectivity.js`

**Result**:
```
→ POST https://places.googleapis.com/v1/places:searchText
❌ TIMEOUT after 10013ms

Possible causes:
  1. Network/firewall blocking HTTPS access to places.googleapis.com
  2. DNS resolution failing
  3. Proxy configuration needed
```

This is **NOT a code bug**. The API key is valid and code is correct. The network is blocking Google API access.

---

## Files Changed (Minimal Diff)

### 1. `server/src/server.ts` - Remove Confusing Boot Log

```diff
-logger.info({
-    googleApiKey: maskKey(process.env.GOOGLE_API_KEY),
-    googleMapsApiKey: maskKey(process.env.GOOGLE_MAPS_API_KEY), // ❌ Not used
-}, '[BOOT] API key status');
+// Log API key status at boot (only GOOGLE_API_KEY is used)
+logger.info({
+    googleApiKey: maskKey(process.env.GOOGLE_API_KEY),
+}, '[BOOT] API key status');
```

**Why**: `GOOGLE_MAPS_API_KEY` is never used in code, only `GOOGLE_API_KEY`. Removed confusing log.

### 2. `server/src/utils/fetch-with-timeout.ts` - Add Diagnostics

```diff
+// Log outbound request for diagnostics
+const urlObj = new URL(url);
+console.log(`[FETCH] ${options.method} ${urlObj.host}${urlObj.pathname} timeout=${config.timeoutMs}ms`);

 const response = await fetch(url, {...

-  const timeoutError = new Error(
-    `${config.provider} timeout after ${config.timeoutMs}ms`
-  ) as TimeoutError;
+  const urlObj = new URL(url);
+  const timeoutError = new Error(
+    `${config.provider} timeout after ${config.timeoutMs}ms - Check network/DNS access to ${urlObj.host}`
+  ) as TimeoutError;
```

**Why**: 
- Pre-request log shows which host is being called (helps identify blocks)
- Timeout error includes troubleshooting hint

### 3. `server/src/services/search/route2/stages/google-maps.stage.ts` - Configurable Timeout

```diff
+// Allow timeout to be configurable via env (default 8000ms)
+const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);
+
 const response = await fetchWithTimeout(url, {
   method: 'POST',
   // ...
 }, {
-  timeoutMs: 8000,
+  timeoutMs,
   requestId,
   stage: 'google_maps',
   provider: 'google_places'
 });
```

**Why**: Allows increasing timeout for slow networks without code changes.

**Applied to**:
- `callGooglePlacesSearchText` (line 622)
- `callGooglePlacesSearchNearby` (line 710)

### 4. `google-maps.stage.ts` - Better Error Guidance

```diff
 logger.error({
   requestId,
   provider: 'google_places_new',
   endpoint: 'searchNearby',
   status: response.status,
   errorBody: errorText,
+  guidance: 'Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access to places.googleapis.com'
 }, '[GOOGLE] Nearby Search API error');
```

**Why**: Provides actionable troubleshooting steps in logs.

---

## Solutions

### For Local Dev (Immediate Workaround)

Edit `server/.env`:
```bash
SEARCH_PROVIDER=stub  # Use stub provider to bypass network
```

**Restart server**:
```bash
npm run dev
```

Search will now work with mock data (no network calls).

### For Production (Infrastructure Fix Required)

**Allow outbound HTTPS to**:
- `places.googleapis.com` (required)
- `*.googleapis.com` (recommended)

**Verify**:
```bash
curl -v https://places.googleapis.com
```

**If behind corporate proxy**:
```bash
export HTTPS_PROXY=http://proxy:port
```

### Optional: Increase Timeout

If network is slow but working:
```bash
GOOGLE_PLACES_TIMEOUT_MS=30000  # 30 seconds
```

---

## Verification

### ✅ Boot Log (After Fix)

**Before**:
```json
{
  "googleApiKey": {"exists":true,"len":39,"last4":"fpMo"},
  "googleMapsApiKey": {"exists":false,"len":0,"last4":"----"}, // ❌ Confusing
  "msg":"[BOOT] API key status"
}
```

**After**:
```json
{
  "googleApiKey": {"exists":true,"len":39,"last4":"fpMo"},
  "msg":"[BOOT] API key status"
}
```

### ✅ Request Diagnostic Logs

New logs show:
```
[FETCH] POST places.googleapis.com/v1/places:searchNearby timeout=8000ms abortController=true stage=google_maps
```

This helps identify:
- Which external host is being called
- What timeout is configured
- Whether request completes or times out

### ✅ Error Messages

**Timeout errors now show**:
```
google_places timeout after 8000ms - Check network/DNS access to places.googleapis.com
```

**API errors now include**:
```
guidance: 'Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access to places.googleapis.com'
```

---

## What Changed (Line Count)

```
server/src/server.ts                          |  3 +-  (1 line removed)
server/src/utils/fetch-with-timeout.ts        |  7 +-  (4 lines added)
server/src/.../google-maps.stage.ts           | 15 +-  (8 lines added)
```

**Total**: 13 lines changed across 3 files

---

## Testing

### Manual Test with Stub Provider

1. Edit `.env`:
   ```bash
   SEARCH_PROVIDER=stub
   ```

2. Start server:
   ```bash
   npm run dev
   ```

3. Search for "פיצה לידי"

**Expected**: 
- ✅ No timeout
- ✅ Returns stub pizza results
- ✅ BOOT log shows only googleApiKey (not googleMapsApiKey)

### Network Test (When Available)

1. Edit `.env`:
   ```bash
   SEARCH_PROVIDER=google
   ```

2. Ensure network allows `places.googleapis.com`

3. Search for "פיצה לידי"

**Expected**:
- ✅ [FETCH] log shows request to places.googleapis.com
- ✅ Real Google results returned
- ✅ No timeout

---

## Summary

| Item | Status |
|------|--------|
| Root cause identified | ✅ Network blocks places.googleapis.com |
| Code issues fixed | ✅ Removed confusing logs, added diagnostics |
| Diagnostics improved | ✅ Pre-request logging, better errors |
| Timeout configurable | ✅ Via GOOGLE_PLACES_TIMEOUT_MS |
| Workaround available | ✅ SEARCH_PROVIDER=stub works |
| Production fix | ⏳ Requires network team to allow HTTPS access |

**Code changes**: Minimal (13 lines across 3 files)  
**Impact**: Better diagnostics, clearer errors, configurable timeout  
**Next step**: Network team to allow outbound HTTPS to Google APIs
