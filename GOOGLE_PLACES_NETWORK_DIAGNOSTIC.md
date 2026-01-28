# Google Places API Timeout Diagnostic & Fix

**Date**: 2026-01-28  
**Issue**: `google_places timeout after 8000ms - Check network/DNS access to places.googleapis.com`  
**Root Cause**: Network/firewall blocking outbound HTTPS to Google Places API

---

## Problem Summary

Google Places API calls consistently time out after 8000ms, causing search failures. Boot logs showed confusing `googleMapsApiKey exists=false`, but this was a red herring—only `GOOGLE_API_KEY` is used.

### Evidence

1. **API Key**: ✅ Correctly set in `.env` as `GOOGLE_API_KEY`
2. **Configuration**: ✅ `env.ts` correctly reads `GOOGLE_API_KEY` (not `GOOGLE_MAPS_API_KEY`)
3. **Boot Log**: ✅ Already cleaned up to show only `googleApiKey`
4. **Timeouts**: ❌ Consistent 8000ms timeouts indicate network/firewall blocking

---

## Root Cause

**Network/firewall blocking outbound HTTPS to `places.googleapis.com`.**

This is **not** a code bug or configuration error. The application code is correct. The issue is external: corporate firewall, ISP blocking, or DNS issues.

---

## Diagnostic Improvements Added

### 1. Pre-Request Logging (`google-maps.stage.ts`)

**Added before each API call**:
```typescript
logger.debug({
  requestId,
  provider: 'google_places_new',
  endpoint: 'searchText',
  hostname: 'places.googleapis.com',
  path: '/v1/places:searchText',
  timeoutMs,
  apiKeyPresent: !!apiKey,
  apiKeyLength: apiKey?.length || 0,
  method: 'POST'
}, '[GOOGLE] Pre-request diagnostics');
```

**Shows**:
- Hostname being accessed
- Timeout duration
- API key presence (boolean + length, no secrets)
- Exact URL path

### 2. Enhanced Error Messages

**Added guidance to error logs**:
```json
{
  "status": 403,
  "guidance": "Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access to places.googleapis.com"
}
```

**Cleaner HTTP error messages**:
```
Google Places API (New) searchText failed: HTTP 403 - Check API key permissions and billing
```

### 3. Boot-Time Configuration Warning

**Added to `server.ts`**:
```typescript
// Warn if API key missing but provider expects Google
if (!googleKeyStatus.exists && process.env.SEARCH_PROVIDER !== 'stub') {
    logger.warn({
        issue: 'GOOGLE_API_KEY missing but SEARCH_PROVIDER requires it',
        currentProvider: process.env.SEARCH_PROVIDER || 'google (default)',
        remediation: 'Set GOOGLE_API_KEY or use SEARCH_PROVIDER=stub for local dev'
    }, '[BOOT] Configuration warning');
}
```

### 4. Network Diagnostic Script

**New file**: `server/test-google-network.js`

**Run**:
```bash
cd server
node test-google-network.js
```

**Tests**:
1. ✅ DNS resolution for `places.googleapis.com` (IPv4 + IPv6)
2. ✅ HTTPS connectivity test (simple GET with 5s timeout)
3. ✅ Google Places API endpoint test (POST with real API key if set)

**Output example**:
```
🔍 Google Places API Network Diagnostics

━━━ DNS Resolution Test ━━━
Testing IPv4 (A records)...
✅ IPv4 resolved: 142.250.185.106

━━━ HTTPS Connectivity Test ━━━
Testing GET https://places.googleapis.com/
❌ Request timed out after 5012ms
   This suggests network/firewall blocking

⚠️  Skipping API test due to connectivity failure

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Diagnostic Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If DNS resolved but HTTPS failed:
  → Check corporate firewall/proxy settings
  → Check outbound HTTPS (port 443) access
  → Try: curl -v https://places.googleapis.com/

Workaround for local dev:
  Set SEARCH_PROVIDER=stub in .env file
```

---

## Remediation Options

### Option 1: Fix Network/Firewall (Production)

**For Corporate Network**:
1. Whitelist `places.googleapis.com` in firewall/proxy
2. Allow outbound HTTPS (port 443) to `*.googleapis.com`
3. Configure proxy settings if required:
   ```bash
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

**For Cloud Deployment (ECS)**:
1. Check Security Group outbound rules (allow HTTPS)
2. Check Network ACLs (allow port 443)
3. Verify NAT Gateway or Internet Gateway is attached

**Verify**:
```bash
curl -v https://places.googleapis.com/
```

### Option 2: Use Stub Provider (Local Development)

**Fastest solution for local dev**:

**1. Update `.env`**:
```bash
SEARCH_PROVIDER=stub   # Use stub instead of google
```

**2. Restart server**:
```bash
npm run dev
```

**Result**: Returns fake pizza results, no network calls.

### Option 3: Increase Timeout (Slow Network)

**If network is slow but not blocked**:

**Update `.env`**:
```bash
GOOGLE_PLACES_TIMEOUT_MS=30000   # 30 seconds
```

**Not recommended**: Timeouts > 15s hurt UX.

---

## Files Changed

### Modified (3 files)

1. ✅ `server/src/server.ts` - Enhanced boot logging + configuration warnings
2. ✅ `server/src/services/search/route2/stages/google-maps.stage.ts` - Pre-request diagnostics
3. ✅ `server/src/utils/fetch-with-timeout.ts` - Already had hostname logging (no changes needed)

### New Files (2 files)

4. ✅ `server/test-google-network.js` - Network diagnostic tool
5. ✅ `GOOGLE_PLACES_NETWORK_DIAGNOSTIC.md` - This documentation

**Total**: 3 modified, 2 new = **5 files**

---

## Minimal Diff

### 1. `server.ts` - Boot Warnings

```diff
+const googleKeyStatus = maskKey(process.env.GOOGLE_API_KEY);
 logger.info({
-    googleApiKey: maskKey(process.env.GOOGLE_API_KEY),
+    googleApiKey: googleKeyStatus,
+    searchProvider: process.env.SEARCH_PROVIDER || 'google'
 }, '[BOOT] API key status');

+// Warn if API key missing but provider expects Google
+if (!googleKeyStatus.exists && process.env.SEARCH_PROVIDER !== 'stub') {
+    logger.warn({
+        issue: 'GOOGLE_API_KEY missing but SEARCH_PROVIDER requires it',
+        remediation: 'Set GOOGLE_API_KEY or use SEARCH_PROVIDER=stub for local dev'
+    }, '[BOOT] Configuration warning');
+}
```

### 2. `google-maps.stage.ts` - Pre-Request Diagnostics

```diff
 async function callGooglePlacesSearchText(...): Promise<any> {
   const url = 'https://places.googleapis.com/v1/places:searchText';
   const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);
   
+  // Pre-request diagnostics (safe logging - no secrets)
+  logger.debug({
+    requestId,
+    hostname: 'places.googleapis.com',
+    path: '/v1/places:searchText',
+    timeoutMs,
+    apiKeyPresent: !!apiKey,
+    apiKeyLength: apiKey?.length || 0
+  }, '[GOOGLE] Pre-request diagnostics');

   const response = await fetchWithTimeout(url, ...);
```

```diff
   logger.error({
     requestId,
     status: response.status,
     errorBody: errorText,
+    guidance: 'Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access'
   }, '[GOOGLE] Text Search API error');
   
-  throw new Error(`Google Places API (New) searchText failed: HTTP ${response.status} - ${errorText}`);
+  throw new Error(`Google Places API (New) searchText failed: HTTP ${response.status} - Check API key permissions and billing`);
```

---

## Verification

### Expected Boot Logs (After Fix)

```json
{
  "level": "info",
  "googleApiKey": {"exists": true, "len": 39, "last4": "fpMo"},
  "searchProvider": "google",
  "msg": "[BOOT] API key status"
}
```

**If key missing**:
```json
{
  "level": "warn",
  "issue": "GOOGLE_API_KEY missing but SEARCH_PROVIDER requires it",
  "currentProvider": "google (default)",
  "remediation": "Set GOOGLE_API_KEY or use SEARCH_PROVIDER=stub for local dev",
  "msg": "[BOOT] Configuration warning"
}
```

### Expected Pre-Request Logs

```json
{
  "level": "debug",
  "requestId": "req-123",
  "provider": "google_places_new",
  "endpoint": "searchText",
  "hostname": "places.googleapis.com",
  "path": "/v1/places:searchText",
  "timeoutMs": 8000,
  "apiKeyPresent": true,
  "apiKeyLength": 39,
  "method": "POST",
  "msg": "[GOOGLE] Pre-request diagnostics"
}
```

### Run Network Diagnostic

```bash
cd server
node test-google-network.js
```

**Expected Output**:
- ✅ DNS resolves
- ❌ HTTPS times out (if firewall blocking)
- Shows clear remediation steps

---

## Quick Start Solutions

### For Local Dev (No Network)

```bash
# .env
SEARCH_PROVIDER=stub
```

Restart server → Works offline ✅

### For Production (Network Issue)

1. Run diagnostic: `node test-google-network.js`
2. If timeout: Contact IT to whitelist `places.googleapis.com`
3. If 403 API error: Enable "Places API (New)" in Google Cloud Console
4. If billing error: Verify billing account is active

---

## Summary

| Issue | Status |
|-------|--------|
| Configuration | ✅ Correct (`GOOGLE_API_KEY` set) |
| Boot logging | ✅ Clear and actionable |
| Pre-request diagnostics | ✅ Added (hostname, timeout, key presence) |
| Error messages | ✅ Enhanced with guidance |
| Network diagnostic tool | ✅ Created (`test-google-network.js`) |
| Stub provider fallback | ✅ Documented (use `SEARCH_PROVIDER=stub`) |

**Root Cause**: Network/firewall blocking, not code bug  
**Local Fix**: Use `SEARCH_PROVIDER=stub` in `.env`  
**Production Fix**: Whitelist `places.googleapis.com` in firewall

**Status**: Diagnosed and documented ✅
