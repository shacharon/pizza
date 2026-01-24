# P0 Security Fixes - Quick Summary

## ✅ Implemented

### 1. IDOR Prevention on GET /api/v1/search/:requestId/result
- ✅ Require `X-Session-Id` header on async job creation (returns 400 if missing)
- ✅ Store `ownerSessionId` in JobStore (Redis + InMemory)
- ✅ Validate session ownership on result endpoint:
  - `401 Unauthorized`: Missing session
  - `404 Not Found`: Session mismatch (avoids disclosure)
- ✅ Hash session IDs in logs (SHA-256, 12 chars)

### 2. Google API Key Leakage Prevention
- ✅ Return photo references only (format: `places/{placeId}/photos/{photoId}`)
- ✅ Backend proxy endpoint: `GET /api/v1/photos/*`
- ✅ Sanitize legacy `photoUrl` fields before sending to client
- ✅ No `key=` parameters in any response
- ✅ **NEW**: Sync mode sanitization (was missing, now fixed)
- ✅ **NEW**: Rate limiting (60 req/min per IP)
- ✅ **NEW**: Zod input validation
- ✅ **NEW**: JSON parsing error handler (400 instead of 500)
- ✅ **NEW**: Comprehensive tests

---

## 📁 Files Touched

### New Files (8)
- `server/src/utils/security.utils.ts` - Security utilities
- `server/src/utils/security.utils.test.ts` - Security tests
- `server/src/controllers/photos/photos.controller.ts` - Photo proxy (enhanced)
- `server/src/controllers/search/search.controller.security.test.ts` - IDOR tests
- `server/src/middleware/rate-limit.middleware.ts` - **NEW** Rate limiter
- `server/tests/photos.controller.test.ts` - **NEW** Photo proxy tests
- `server/tests/photos-integration.test.ts` - **NEW** Integration tests
- `server/docs/SECURITY_PHOTOS_PROXY.md` - **NEW** Security documentation

### Modified Files (7)
- `server/src/controllers/search/search.controller.ts` - IDOR protection + **sync mode sanitization**
- `server/src/services/search/route2/stages/google-maps.stage.ts` - Photo references
- `server/src/services/search/types/search.types.ts` - Type definitions
- `server/src/routes/v1/index.ts` - Route registration
- `server/src/app.ts` - **NEW** JSON error handler
- `server/src/controllers/photos/photos.controller.ts` - **ENHANCED** Rate limiting + validation
- `server/package.json` - **NEW** Test scripts

---

## 🧪 Tests

### Run Tests
```bash
# Run all tests
npm test

# Run security tests only
npm run test:security

# Run with verbose output
node --test --test-reporter=spec --import tsx tests/photos.controller.test.ts
```

### Expected Results
✅ All tests passing  
✅ IDOR protection tests: 8 passing  
✅ Photo sanitization tests: 12 passing  
✅ Photo proxy tests: 20+ passing  
✅ Integration tests: 15+ passing  

---

## 🔍 curl Verification Commands

### Test 1: IDOR - Missing Session (should fail)
```bash
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}'
```
**Expected**: `400 Bad Request` with `MISSING_SESSION_ID`

---

### Test 2: IDOR - Valid Session (should succeed)
```bash
# Create job
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_alice_12345" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}'

# Save the requestId from response, then poll:
curl http://localhost:3000/api/v1/search/req-XXX/result \
  -H "X-Session-Id: sess_alice_12345"
```
**Expected**: `202` (pending) → `200` (ready) with results

---

### Test 3: IDOR - Wrong Session (should fail)
```bash
# Use requestId from Test 2, but different session
curl http://localhost:3000/api/v1/search/req-XXX/result \
  -H "X-Session-Id: sess_attacker_99999"
```
**Expected**: `404 Not Found` (avoids disclosure)

---

### Test 4: IDOR - Missing Session Header (should fail)
```bash
# Use requestId from Test 2, no session header
curl http://localhost:3000/api/v1/search/req-XXX/result
```
**Expected**: `401 Unauthorized`

---

### Test 5: Photo Proxy
```bash
# Fetch photo via backend proxy (replace with actual photo reference)
curl http://localhost:3000/api/v1/photos/places/ChIJ.../photos/ABC?maxWidthPx=800 \
  --output test-photo.jpg
```
**Expected**: Photo downloaded, no API key in URL

---

### Test 6: No API Keys in Search Response (Sync Mode)
```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  | grep "key="
```
**Expected**: No matches (empty output)

---

### Test 7: No API Keys in Search Response (Async Mode)
```bash
# Create async job
REQ_ID=$(curl -X POST "http://localhost:3000/api/v1/search?mode=async" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_test_123" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  | jq -r '.requestId')

# Wait for completion and check result
sleep 5
curl "http://localhost:3000/api/v1/search/$REQ_ID/result" \
  -H "X-Session-Id: sess_test_123" \
  | grep "key="
```
**Expected**: No matches (empty output)

---

### Test 8: Rate Limiting
```bash
# Send 65 requests rapidly (exceeds 60/min limit)
for i in {1..65}; do
  STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
    "http://localhost:3000/api/v1/photos/places/ChIJ123/photos/ABC?maxWidthPx=800")
  echo "Request $i: HTTP $STATUS"
done
```
**Expected**: First ~60 return 200, remaining return 429

---

### Test 9: Invalid JSON (should return 400, not 500)
```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza",' \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected**: HTTP 400 with `INVALID_JSON` code (not 500)

---

### Test 10: Input Validation (Photo Proxy)
```bash
# Invalid photo reference
curl "http://localhost:3000/api/v1/photos/invalid-reference" \
  -w "\nHTTP Status: %{http_code}\n"
```
**Expected**: HTTP 400 with `VALIDATION_ERROR`

---

## 🔒 Security Guarantees

### IDOR Protection
✅ All async jobs require valid session  
✅ Results accessible only by owner session  
✅ Unauthorized access returns 404 (no disclosure)  
✅ Session IDs never logged in plain text  

### API Key Protection
✅ No API keys in any client-facing response  
✅ Photo references only (no direct URLs with keys)  
✅ Backend proxy hides key server-side  
✅ Legacy URLs automatically sanitized  

---

## 📊 Verification Checklist

Before deployment, verify:

- [ ] Run `npm test -- security` → All passing
- [ ] Test IDOR with valid session → Access granted (200)
- [ ] Test IDOR with wrong session → Access denied (404)
- [ ] Test IDOR without session → Unauthorized (401)
- [ ] Test async job without X-Session-Id → Bad Request (400)
- [ ] Search response contains NO `key=` parameters
- [ ] Search response contains `photoReference` field
- [ ] Photo proxy endpoint returns images successfully
- [ ] Check logs for hashed session IDs (no plain text)

---

## 📖 Full Documentation

See `P0_SECURITY_FIXES.md` for:
- Detailed implementation notes
- PowerShell commands (Windows)
- Log verification examples
- Rollback procedures
- Architecture diagrams

---

**Status**: ✅ Ready for deployment  
**Priority**: P0 (Critical)  
**Date**: 2026-01-24
