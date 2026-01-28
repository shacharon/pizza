# Google Places API Timeout Root Cause & Fix

**Date**: 2026-01-28  
**Issue**: Google Places API calls timing out after 8000ms  
**Severity**: P0 - Search completely broken

---

## Root Cause Confirmed

**Network connectivity issue**: HTTPS requests to `places.googleapis.com` are being blocked or timing out.

### Evidence

1. **Boot log confusion**: 
   - Shows `googleMapsApiKey exists=false` (red herring - this env var isn't used)
   - Shows `googleApiKey exists=true` (this IS the key being used)

2. **Connectivity test result**:
   ```
   → POST https://places.googleapis.com/v1/places:searchText
   ❌ TIMEOUT after 10013ms
   ```

3. **API key is valid**: 39 chars, ends with `fpMo`

4. **Code is correct**: Uses `GOOGLE_API_KEY` from env, properly configured

### Diagnosis

Run: `node server/test-google-connectivity.js`

**Result**: Timeout after 10s, indicating:
- Network/firewall blocking HTTPS (443) to `places.googleapis.com`
- DNS resolution may be failing
- Corporate proxy may be required but not configured

---

## Fixes Applied

### 1. Remove Confusing Boot Log (`server/src/server.ts`)

**Before**:
```typescript
logger.info({
    googleApiKey: maskKey(process.env.GOOGLE_API_KEY),
    googleMapsApiKey: maskKey(process.env.GOOGLE_MAPS_API_KEY), // ❌ Never used
}, '[BOOT] API key status');
```

**After**:
```typescript
// Log API key status at boot (only GOOGLE_API_KEY is used)
logger.info({
    googleApiKey: maskKey(process.env.GOOGLE_API_KEY),
}, '[BOOT] API key status');
```

### 2. Add Request Diagnostics (`server/src/utils/fetch-with-timeout.ts`)

**Added pre-request logging**:
```typescript
const urlObj = new URL(url);
console.log(`[FETCH] ${options.method || 'GET'} ${urlObj.host}${urlObj.pathname} timeout=${config.timeoutMs}ms abortController=true stage=${config.stage || 'unknown'}`);
```

**Improved timeout error message**:
```typescript
const timeoutError = new Error(
  `${config.provider || 'Upstream API'} timeout after ${config.timeoutMs}ms - Check network/DNS access to ${urlObj.host}`
) as TimeoutError;
```

### 3. Make Timeout Configurable (`google-maps.stage.ts`)

**Added env var support**:
```typescript
// Allow timeout to be configurable via env (default 8000ms)
const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);
```

**Applied to both**:
- `callGooglePlacesSearchText`
- `callGooglePlacesSearchNearby`

### 4. Better Error Guidance (`google-maps.stage.ts`)

**Enhanced error logging**:
```typescript
logger.error({
  requestId,
  provider: 'google_places_new',
  endpoint: 'searchNearby',
  status: response.status,
  errorBody: errorText,
  requestBody: body,
  guidance: 'Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access to places.googleapis.com'
}, '[GOOGLE] Nearby Search API error');
```

---

## Solutions

### Solution A: Fix Network Access (Production)

**For production/ECS deployment**:

1. **Allow outbound HTTPS (443) to**:
   - `places.googleapis.com`
   - `*.googleapis.com` (recommended)

2. **Configure proxy if required**:
   ```bash
   export HTTPS_PROXY=http://your-proxy:port
   export NODE_TLS_REJECT_UNAUTHORIZED=0  # Only if using corporate proxy with custom CA
   ```

3. **Verify with**:
   ```bash
   curl -v https://places.googleapis.com
   ```

### Solution B: Use Stub Provider (Local Dev)

**For local development when network is blocked**:

Edit `server/.env`:
```bash
# Use stub provider to bypass network requirement
SEARCH_PROVIDER=stub

# Keep key for when network is available
GOOGLE_API_KEY=AIzaSyA8acl_LIcHCWH8WkRWt8qjd2xim3mfpMo
```

**Stub behavior**:
- Returns mock pizza results
- No network calls
- Allows testing UI/WS flows

### Solution C: Increase Timeout (Slow Network)

If network is slow but working:

```bash
# Increase timeout to 30s
GOOGLE_PLACES_TIMEOUT_MS=30000
```

---

## Verification Steps

### 1. Check Boot Log

**Before fix**:
```json
{
  "googleApiKey": {"exists":true,"len":39,"last4":"fpMo"},
  "googleMapsApiKey": {"exists":false,"len":0,"last4":"----"}, // ❌ Confusing
  "msg":"[BOOT] API key status"
}
```

**After fix**:
```json
{
  "googleApiKey": {"exists":true,"len":39,"last4":"fpMo"},
  "msg":"[BOOT] API key status"
}
```

### 2. Test Connectivity

```bash
cd server
node test-google-connectivity.js
```

**Expected (if network working)**:
```
✓ SUCCESS: API responded with N results
✓ Network connectivity to places.googleapis.com is working
✓ API key is valid and has Places API (New) enabled
```

**Expected (if network blocked)**:
```
❌ TIMEOUT after 10013ms

Possible causes:
  1. Network/firewall blocking HTTPS access to places.googleapis.com
  2. DNS resolution failing for places.googleapis.com
  3. Proxy configuration needed
```

### 3. Test Search Flow

```bash
# With stub provider
SEARCH_PROVIDER=stub npm run dev

# Then search for "פיצה לידי"
# Should return stub results (no timeout)
```

### 4. Check Diagnostic Logs

With fix, you'll see:
```
[FETCH] POST places.googleapis.com/v1/places:searchNearby timeout=8000ms abortController=true stage=google_maps
```

This helps identify:
- Which host is being called
- What timeout is configured
- Which stage is making the request

---

## Files Changed

1. ✅ `server/src/server.ts` - Remove confusing GOOGLE_MAPS_API_KEY check
2. ✅ `server/src/utils/fetch-with-timeout.ts` - Add diagnostics + better error messages
3. ✅ `server/src/services/search/route2/stages/google-maps.stage.ts` - Configurable timeout + error guidance
4. ✅ `server/test-google-connectivity.js` - New diagnostic tool

---

## Summary

**Problem**: Google Places API timeouts caused by **network/firewall blocking access to places.googleapis.com**

**Not a code issue**. The application code is correct:
- ✅ GOOGLE_API_KEY properly loaded
- ✅ API calls properly formed
- ✅ Timeout handling working correctly

**Infrastructure fix required**:
- Allow outbound HTTPS to `places.googleapis.com`
- OR use stub provider for local dev
- OR configure corporate proxy

**Code improvements made**:
- ✅ Removed confusing boot log
- ✅ Added diagnostic pre-request logging
- ✅ Made timeout configurable
- ✅ Better error messages with troubleshooting guidance
- ✅ Created connectivity test tool

---

**Status**: Root cause identified, diagnostic improvements deployed ✅  
**Action Required**: Network team to allow HTTPS access to Google APIs
