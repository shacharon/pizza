# P0 Security Fixes - Implementation Summary

## Overview

This document details the implementation of two critical P0 security fixes:

1. **IDOR (Insecure Direct Object Reference) Prevention**: Binds async search results to session ownership
2. **Google API Key Leakage Prevention**: Removes API keys from photo URLs

---

## 1. IDOR Protection on GET /api/v1/search/:requestId/result

### Problem
Previously, any client could access async search results by guessing `requestId` values, allowing unauthorized access to search results created by other users.

### Solution
- **Session Binding**: Require `X-Session-Id` header on async job creation
- **Ownership Validation**: Store `ownerSessionId` in JobStore (Redis + InMemory)
- **Authorization Enforcement**: Validate session on result endpoint with proper HTTP status codes:
  - `401 Unauthorized`: Missing `X-Session-Id` header
  - `404 Not Found`: Session mismatch (to avoid leaking requestId existence)
- **Safe Logging**: Hash session IDs before logging (SHA-256, 12 chars)

### Implementation Details

#### Files Modified

1. **`server/src/controllers/search/search.controller.ts`**
   - Added `X-Session-Id` requirement for async job creation (returns 400 if missing)
   - Added session ownership validation on GET /result endpoint
   - Added safe logging with hashed session IDs
   - Integrated photo URL sanitization

2. **`server/src/utils/security.utils.ts`** (NEW)
   - `hashSessionId()`: SHA-256 hash for safe logging
   - `sanitizePhotoUrl()`: Remove API key from single URL
   - `sanitizePhotoUrls()`: Sanitize entire results array

3. **`server/src/services/search/job-store/job-store.interface.ts`**
   - Already had `ownerSessionId` field (from Phase 1)

4. **`server/src/services/search/job-store/redis-search-job.store.ts`**
   - Already stores `ownerSessionId` (from Phase 1)

5. **`server/src/services/search/job-store/inmemory-search-job.store.ts`**
   - Already stores `ownerSessionId` (from Phase 1)

#### Authorization Flow

```typescript
// 1. Async job creation (POST /search?mode=async)
POST /api/v1/search?mode=async
Headers:
  X-Session-Id: sess_abc123

→ Extract ownerSessionId from req.ctx.sessionId
→ Store in JobStore: { requestId, ownerSessionId, ... }
→ Return 202 with requestId

// 2. Result polling (GET /search/:requestId/result)
GET /api/v1/search/req-123/result
Headers:
  X-Session-Id: sess_abc123

→ Fetch job from JobStore
→ Validate currentSessionId === job.ownerSessionId
→ If match: return result (200/202)
→ If missing session: return 401
→ If mismatch: return 404 (avoid disclosure)
```

#### Safe Logging

All session IDs are hashed before logging:

```typescript
logger.info({
  requestId: 'req-123',
  sessionHash: hashSessionId('sess_abc123'),  // → 'a1b2c3d4e5f6' (12 chars)
  decision: 'AUTHORIZED'
});
```

---

## 2. Google API Key Leakage Prevention

### Problem
Photo URLs were returned with embedded `key=AIzaSy...` parameters, exposing the Google API key to clients and enabling unauthorized usage.

### Solution
- **Photo References**: Return photo resource names only (e.g., `places/ChIJ.../photos/ABC`)
- **Backend Proxy**: Add `/api/v1/photos/*` endpoint to fetch photos server-side
- **Sanitization**: Strip `key=` parameters from any legacy photo URLs

### Implementation Details

#### Files Modified

1. **`server/src/services/search/route2/stages/google-maps.stage.ts`**
   - Renamed `buildPhotoUrl()` → `buildPhotoReference()`
   - Returns resource name only (no API key)
   - Updated result mapping to use `photoReference` and `photoReferences[]`

2. **`server/src/services/search/types/search.types.ts`**
   - Added `photoReference?: string` field
   - Added `photoReferences?: string[]` field
   - Deprecated `photoUrl` and `photos` (kept for backward compatibility)

3. **`server/src/controllers/photos/photos.controller.ts`** (NEW)
   - Proxy endpoint: `GET /api/v1/photos/*`
   - Fetches photos from Google Places API server-side
   - Adds proper cache headers (24h, immutable)
   - Supports `maxWidthPx` and `maxHeightPx` query params

4. **`server/src/routes/v1/index.ts`**
   - Registered `/photos` route

5. **`server/src/utils/security.utils.ts`**
   - Added `sanitizePhotoUrl()` and `sanitizePhotoUrls()`

#### Photo Flow

**Before (INSECURE)**:
```json
{
  "photoUrl": "https://places.googleapis.com/v1/.../media?key=AIzaSyXXXX"
}
```

**After (SECURE)**:
```json
{
  "photoReference": "places/ChIJ.../photos/ABC"
}
```

**Client Usage**:
```typescript
// Fetch via backend proxy
const photoUrl = `/api/v1/photos/${result.photoReference}?maxWidthPx=800`;
<img src={photoUrl} />
```

---

## Files Touched

### New Files
- `server/src/utils/security.utils.ts` - Security utilities (hashing, sanitization)
- `server/src/utils/security.utils.test.ts` - Tests for security utilities
- `server/src/controllers/photos/photos.controller.ts` - Photo proxy endpoint
- `server/src/controllers/search/search.controller.security.test.ts` - IDOR protection tests

### Modified Files
- `server/src/controllers/search/search.controller.ts` - Added IDOR protection + sanitization
- `server/src/services/search/route2/stages/google-maps.stage.ts` - Use photo references
- `server/src/services/search/types/search.types.ts` - Added photoReference fields
- `server/src/routes/v1/index.ts` - Registered photos route

### Unchanged (Already Prepared)
- `server/src/services/search/job-store/job-store.interface.ts` - Already had ownerSessionId
- `server/src/services/search/job-store/redis-search-job.store.ts` - Already stores ownerSessionId
- `server/src/services/search/job-store/inmemory-search-job.store.ts` - Already stores ownerSessionId
- `server/src/middleware/requestContext.middleware.ts` - Already extracts X-Session-Id

---

## Testing

### Run Unit Tests

```bash
# Run all P0 security tests
npm test -- security

# Run IDOR protection tests only
npm test -- search.controller.security.test.ts

# Run photo sanitization tests only
npm test -- security.utils.test.ts
```

### Manual Testing with curl

#### Test 1: IDOR Protection - Missing Session

```bash
# Create async job WITHOUT X-Session-Id (should fail)
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pizza in tel aviv",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'

# Expected: 400 Bad Request
# Response: { "error": "X-Session-Id header required for async requests", "code": "MISSING_SESSION_ID" }
```

#### Test 2: IDOR Protection - Valid Session

```bash
# Step 1: Create async job WITH X-Session-Id
REQUEST_ID=$(curl -s -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_alice_12345" \
  -d '{
    "query": "pizza in tel aviv",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }' | jq -r '.requestId')

echo "Request ID: $REQUEST_ID"

# Step 2: Poll with CORRECT session (should succeed)
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID/result \
  -H "X-Session-Id: sess_alice_12345" | jq .

# Expected: 202 (pending) → 200 (ready) with results
```

#### Test 3: IDOR Protection - Session Mismatch

```bash
# Use REQUEST_ID from Test 2, but DIFFERENT session
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID/result \
  -H "X-Session-Id: sess_attacker_99999" | jq .

# Expected: 404 Not Found
# Response: { "code": "NOT_FOUND", "requestId": "..." }
```

#### Test 4: IDOR Protection - Missing Session Header

```bash
# Use REQUEST_ID from Test 2, but NO session header
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID/result | jq .

# Expected: 401 Unauthorized
# Response: { "code": "UNAUTHORIZED", "message": "X-Session-Id header required" }
```

#### Test 5: Photo Proxy Endpoint

```bash
# Fetch a photo via backend proxy (replace with actual photo reference)
curl -s http://localhost:3000/api/v1/photos/places/ChIJ.../photos/ABC?maxWidthPx=800 \
  --output test-photo.jpg

# Verify photo was downloaded
file test-photo.jpg
# Expected: test-photo.jpg: JPEG image data

# Verify no API key in response
curl -s -I http://localhost:3000/api/v1/photos/places/ChIJ.../photos/ABC?maxWidthPx=800

# Expected headers:
# Content-Type: image/jpeg
# Cache-Control: public, max-age=86400, immutable
# (NO key= parameter anywhere)
```

#### Test 6: Photo URL Sanitization in Results

```bash
# Create search and verify NO API keys in response
curl -s -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pizza in tel aviv",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }' | jq . | grep -i "key="

# Expected: No matches (empty output)
# Verify photoReference field exists instead:
curl -s -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pizza in tel aviv",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }' | jq '.results[0].photoReference'

# Expected: "places/ChIJ.../photos/ABC" (no key parameter)
```

---

## PowerShell Verification Commands (Windows)

```powershell
# Test 1: IDOR Protection - Missing Session
Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/v1/search?mode=async" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"query":"pizza in tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}' `
  -ErrorAction SilentlyContinue

# Expected: Error 400 Bad Request

# Test 2: IDOR Protection - Valid Session
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/v1/search?mode=async" `
  -Headers @{
    "Content-Type"="application/json"
    "X-Session-Id"="sess_alice_12345"
  } `
  -Body '{"query":"pizza in tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}'

$requestId = $response.requestId
Write-Host "Request ID: $requestId"

# Poll with correct session
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search/$requestId/result" `
  -Headers @{"X-Session-Id"="sess_alice_12345"} | ConvertTo-Json

# Test 3: IDOR Protection - Session Mismatch
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search/$requestId/result" `
  -Headers @{"X-Session-Id"="sess_attacker_99999"} `
  -ErrorAction SilentlyContinue

# Expected: 404 Not Found

# Test 4: Check for API keys in response
$response = Invoke-RestMethod -Method POST -Uri "http://localhost:3000/api/v1/search" `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"query":"pizza in tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}'

$responseJson = $response | ConvertTo-Json -Depth 10
if ($responseJson -match "key=") {
  Write-Host "SECURITY ISSUE: API key found in response!" -ForegroundColor Red
} else {
  Write-Host "✓ No API keys in response" -ForegroundColor Green
}

# Verify photoReference exists
$response.results[0].photoReference
```

---

## Log Verification

After running tests, check server logs for security audit trails:

```bash
# Check IDOR protection logs
grep "P0 Security" server/logs/server.log | tail -20

# Expected log entries:
# [P0 Security] Job created with session binding (decision: ACCEPTED)
# [P0 Security] Access granted (decision: AUTHORIZED, sessionHash: a1b2c3...)
# [P0 Security] Access denied: session mismatch (decision: FORBIDDEN)
# [P0 Security] Access denied: missing X-Session-Id (decision: UNAUTHORIZED)

# Check photo sanitization logs
grep "photoUrlsSanitized" server/logs/server.log | tail -10

# Expected:
# [P0 Security] Photo URLs sanitized (photoUrlsSanitized: true, resultCount: 20)
```

---

## Security Guarantees

### IDOR Protection
✅ Async jobs require `X-Session-Id` header (400 if missing)  
✅ Results are bound to owner session (stored in JobStore)  
✅ Unauthorized access returns 404 (to avoid disclosure)  
✅ Missing session returns 401  
✅ Session IDs are hashed in logs (SHA-256, 12 chars)  
✅ Works with both Redis and InMemory JobStore  

### API Key Protection
✅ Photo URLs contain NO `key=` parameters  
✅ Photo references only (format: `places/{placeId}/photos/{photoId}`)  
✅ Backend proxy endpoint hides API key server-side  
✅ Legacy `photoUrl` fields are sanitized if present  
✅ Search results are sanitized before sending to client  

---

## Rollback Plan

If issues arise, the changes can be rolled back individually:

### Rollback IDOR Protection Only
```bash
git checkout HEAD~1 -- server/src/controllers/search/search.controller.ts
```

### Rollback Photo URL Changes Only
```bash
git checkout HEAD~1 -- server/src/services/search/route2/stages/google-maps.stage.ts
git checkout HEAD~1 -- server/src/controllers/photos/
git checkout HEAD~1 -- server/src/routes/v1/index.ts
```

### Full Rollback
```bash
git revert HEAD
```

---

## Next Steps (Optional Enhancements)

1. **Rate Limiting**: Add rate limits to `/photos/*` endpoint
2. **Photo Caching**: Cache proxied photos in Redis/CDN
3. **Session Rotation**: Rotate session IDs on auth events
4. **Audit Logging**: Store security events in dedicated audit log
5. **Frontend Migration**: Update Angular app to use `photoReference` field
6. **Monitoring**: Add Prometheus metrics for:
   - `idor_rejections_total` (401/404 on result endpoint)
   - `photo_proxy_requests_total`
   - `api_key_leaks_prevented_total`

---

## References

- [OWASP IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- [Google Places API Documentation](https://developers.google.com/maps/documentation/places/web-service)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Implementation Date**: 2026-01-24  
**Security Priority**: P0 (Critical)  
**Testing Status**: ✅ Unit tests passing  
**Production Ready**: ✅ Yes
