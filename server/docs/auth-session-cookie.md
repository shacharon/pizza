# Session Cookie Authentication - Smoke Tests

Complete test suite for verifying session cookie authentication end-to-end.

---

## Prerequisites

1. **Start the server:**

   ```bash
   cd server
   npm run dev
   ```

2. **Ensure `.env` has:**

   ```bash
   JWT_SECRET=your-jwt-secret-here-must-be-at-least-32-chars-long
   SESSION_COOKIE_SECRET=your-session-cookie-secret-here-must-be-at-least-32-chars
   SESSION_COOKIE_TTL_SECONDS=3600  # 1 hour (adjust for expiry test)
   ```

3. **Required tools:**
   - `curl` (command-line HTTP client)
   - `jq` (JSON processor) - optional but recommended

---

## Test A: Issue Cookie Using Bearer JWT

### Step 1: Get Bearer JWT token

```bash
curl -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected Response (200 OK):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzZXNzXzEyMy4uLiIsImlhdCI6MTczOTQ1NjcwMCwiZXhwIjoxNzQyMDQ4NzAwfQ...",
  "sessionId": "sess_abc-123-def-456",
  "traceId": "..."
}
```

**Save the token:**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

echo "Token: $TOKEN"
```

### Step 2: Issue session cookie using Bearer JWT

```bash
curl -v -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -c cookies.txt
```

**Expected Response (200 OK):**

```json
{
  "ok": true,
  "sessionId": "sess_abc-123-def-456",
  "expiresAt": "2026-02-13T13:00:00.000Z",
  "traceId": "..."
}
```

**Expected Set-Cookie Header:**

```
< Set-Cookie: session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax
```

**Verify cookie attributes:**

- ✅ `HttpOnly` - JavaScript cannot access
- ✅ `Path=/` - Applies to all routes
- ✅ `Max-Age=3600` - Matches SESSION_COOKIE_TTL_SECONDS
- ✅ `SameSite=Lax` - CSRF protection
- ✅ `Secure` - Only in production (HTTPS)

**Server Log (Expected):**

```
[SessionCookie] Session cookie issued {
  sessionId: 'sess_abc-123-def-456',
  userId: 'none',
  expiresAt: '2026-02-13T13:00:00.000Z',
  ttlSeconds: 3600,
  event: 'session_cookie_issued'
}
```

**Verify cookie file created:**

```bash
cat cookies.txt
```

Expected format:

```
# Netscape HTTP Cookie File
localhost	FALSE	/	FALSE	<timestamp>	session	<token>
```

---

## Test B: Use Cookie-Only on Protected Endpoint

### Call whoami endpoint with cookie only (NO Authorization header)

```bash
curl -X GET http://localhost:3000/api/v1/auth/whoami \
  -b cookies.txt
```

**Expected Response (200 OK):**

```json
{
  "authenticated": true,
  "userId": null,
  "sessionId": "sess_abc-123-def-456",
  "authSource": "cookie",
  "hasCookieHeader": true,
  "hasBearerHeader": false,
  "timestamp": "2026-02-13T12:00:00.000Z",
  "traceId": "..."
}
```

**Key Assertions:**

- ✅ HTTP 200 OK (authenticated)
- ✅ `authSource: "cookie"` - Cookie was used
- ✅ `hasCookieHeader: true` - Cookie present
- ✅ `hasBearerHeader: false` - No Bearer token
- ✅ `sessionId` matches original token

**Server Log (Expected):**

```
[Auth] Session cookie authenticated {
  sessionId: 'sess_abc-123-def-456',
  userId: 'none',
  path: '/api/v1/auth/whoami',
  event: 'session_cookie_auth_ok'
}
```

### Alternative: Test with actual protected endpoint (search)

```bash
curl -X POST http://localhost:3000/api/v1/search?mode=sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "query": "pizza in Tel Aviv",
    "userLocation": {
      "lat": 32.0853,
      "lng": 34.7818
    }
  }'
```

**Expected Response (200 OK):**

```json
{
  "requestId": "req-...",
  "sessionId": "sess_abc-123-def-456",
  "query": { "original": "pizza in Tel Aviv", ... },
  "results": [ ... ],
  "meta": { ... }
}
```

**Success Criteria:**

- ✅ HTTP 200 OK
- ✅ No `Authorization` header required
- ✅ Cookie automatically authenticated
- ✅ Search results returned

---

## Test C: Expiry Test

### Step 1: Set short TTL (dev only)

**Update `.env`:**

```bash
SESSION_COOKIE_TTL_SECONDS=60  # 1 minute
```

**Restart server:**

```bash
npm run dev
```

### Step 2: Issue fresh cookie

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

curl -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  -c cookies-short.txt
```

**Verify expiresAt is ~1 minute from now:**

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" | jq '.expiresAt'
```

### Step 3: Use cookie immediately (should work)

```bash
curl -X GET http://localhost:3000/api/v1/auth/whoami \
  -b cookies-short.txt
```

**Expected Response (200 OK):**

```json
{
  "authenticated": true,
  "authSource": "cookie",
  ...
}
```

### Step 4: Wait > 60 seconds, then test again

```bash
echo "Waiting 65 seconds for cookie to expire..."
sleep 65

curl -X GET http://localhost:3000/api/v1/auth/whoami \
  -b cookies-short.txt
```

**Expected Response (401 Unauthorized):**

```json
{
  "error": "Unauthorized",
  "code": "MISSING_AUTH",
  "traceId": "..."
}
```

**Server Log (Expected):**

```
[SessionCookie] Token expired { reason: 'expired' }
[Auth] Session cookie invalid, trying JWT fallback
[Auth] No valid session cookie or Bearer token {
  event: 'auth_failed_no_credentials',
  hadCookie: true
}
```

**Success Criteria:**

- ✅ Cookie works before expiry (< 60s)
- ✅ Cookie rejected after expiry (> 60s)
- ✅ HTTP 401 returned
- ✅ Log shows `session_cookie_auth_failed { reason: 'expired' }`

**Cleanup:**

```bash
# Restore original TTL
# Update .env: SESSION_COOKIE_TTL_SECONDS=3600
# Restart server
```

---

## Test D: Precedence Test (Cookie First, Then JWT)

### Step 1: Prepare both auth methods

```bash
# Get JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

# Get session cookie
curl -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  -c cookies.txt
```

### Step 2: Call whoami with BOTH cookie and Authorization header

```bash
curl -X GET http://localhost:3000/api/v1/auth/whoami \
  -H "Authorization: Bearer $TOKEN" \
  -b cookies.txt
```

**Expected Response (200 OK):**

```json
{
  "authenticated": true,
  "userId": null,
  "sessionId": "sess_abc-123-def-456",
  "authSource": "cookie",
  "hasCookieHeader": true,
  "hasBearerHeader": true,
  "timestamp": "2026-02-13T12:00:00.000Z",
  "traceId": "..."
}
```

**Key Assertion:**

- ✅ `authSource: "cookie"` - Cookie used (not Bearer JWT)
- ✅ `hasCookieHeader: true` - Cookie present
- ✅ `hasBearerHeader: true` - Bearer present
- ✅ **Cookie takes precedence** (middleware checks cookie first)

**Server Log (Expected):**

```
[Auth] Session cookie authenticated {
  sessionId: 'sess_abc-123-def-456',
  event: 'session_cookie_auth_ok'
}
```

**NO JWT log** - JWT not checked because cookie succeeded.

### Step 3: Test with invalid cookie + valid Bearer (fallback)

```bash
# Corrupt the cookie
echo "localhost	FALSE	/	FALSE	9999999999	session	INVALID_TOKEN" > cookies-bad.txt

# Call with bad cookie + valid Bearer
curl -X GET http://localhost:3000/api/v1/auth/whoami \
  -H "Authorization: Bearer $TOKEN" \
  -b cookies-bad.txt
```

**Expected Response (200 OK):**

```json
{
  "authenticated": true,
  "authSource": "bearer",
  "hasCookieHeader": true,
  "hasBearerHeader": true,
  ...
}
```

**Key Assertion:**

- ✅ `authSource: "bearer"` - Fell back to JWT
- ✅ HTTP 200 OK (authenticated via fallback)

**Server Log (Expected):**

```
[SessionCookie] Token verification failed { reason: 'invalid_signature' }
[Auth] Session cookie invalid, trying JWT fallback
[Auth] Bearer JWT authenticated {
  sessionId: 'sess_abc-123-def-456',
  event: 'jwt_auth_ok'
}
```

---

## Test E: Cross-Origin Setup (Documentation Only)

### Required for Different Origins (e.g., Angular dev server)

If frontend runs on `http://localhost:4200` and backend on `http://localhost:3000`, configure:

#### Backend (Server)

**1. CORS Configuration (`.env`):**

```bash
FRONTEND_ORIGINS=http://localhost:4200
CORS_ALLOW_NO_ORIGIN=false
```

**2. Server must respond with:**

```http
Access-Control-Allow-Origin: http://localhost:4200
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Authorization
```

**Note:** CORS with credentials does NOT support wildcard (`*`)

#### Frontend (Angular)

**1. HTTP requests must include `withCredentials: true`:**

```typescript
// Angular HttpClient
this.http.post('http://localhost:3000/api/v1/search', payload, {
  withCredentials: true  // Send cookies automatically
}).subscribe(...)
```

**2. Session cookie request:**

```typescript
// Create session cookie (requires Bearer JWT first)
this.http.post('http://localhost:3000/api/v1/auth/session', {}, {
  headers: { Authorization: `Bearer ${token}` },
  withCredentials: true  // Receive Set-Cookie
}).subscribe(response => {
  console.log('Session cookie set:', response);

  // Future requests automatically send cookie
  this.http.get('http://localhost:3000/api/v1/auth/whoami', {
    withCredentials: true  // Cookie sent automatically
  }).subscribe(...)
});
```

**3. Cookie will be sent automatically on subsequent requests** (browser handles it)

### Verification

```bash
# Backend allows CORS with credentials
curl -v http://localhost:3000/api/v1/auth/whoami \
  -H "Origin: http://localhost:4200" \
  -b cookies.txt

# Expected headers:
< Access-Control-Allow-Origin: http://localhost:4200
< Access-Control-Allow-Credentials: true
```

---

## Logging Expectations

### Success Flow:

**1. Cookie Issuance:**

```
[SessionCookie] Session cookie issued {
  sessionId: 'sess_...',
  userId: 'none',
  expiresAt: '2026-02-13T13:00:00.000Z',
  ttlSeconds: 3600,
  event: 'session_cookie_issued'
}
```

**2. Cookie Authentication:**

```
[Auth] Session cookie authenticated {
  sessionId: 'sess_...',
  userId: 'none',
  path: '/api/v1/auth/whoami',
  event: 'session_cookie_auth_ok'
}
```

### Failure Flow (with Fallback):

**1. Invalid Cookie (Fallback to JWT):**

```
[SessionCookie] Token verification failed {
  reason: 'invalid_signature',
  message: 'invalid signature'
}
[Auth] Session cookie invalid, trying JWT fallback
[Auth] Bearer JWT authenticated {
  sessionId: 'sess_...',
  event: 'jwt_auth_ok'
}
```

**2. Expired Cookie (Fallback to JWT):**

```
[SessionCookie] Token expired { reason: 'expired' }
[Auth] Session cookie invalid, trying JWT fallback
[Auth] Bearer JWT authenticated { event: 'jwt_auth_ok' }
```

**3. Both Invalid (Unauthorized):**

```
[SessionCookie] Token expired { reason: 'expired' }
[Auth] Session cookie invalid, trying JWT fallback
[Auth] JWT verification failed { error: 'jwt expired' }
[Auth] Both session cookie and JWT verification failed { event: 'auth_failed_invalid_jwt' }
```

**4. Missing All Auth (Unauthorized):**

```
[Auth] No valid session cookie or Bearer token {
  event: 'auth_failed_no_credentials',
  hadCookie: false
}
```

### Logging Reasons (session_cookie_auth_failed):

| Reason              | Description               | Cause                                         |
| ------------------- | ------------------------- | --------------------------------------------- |
| `expired`           | Token TTL exceeded        | Wait > SESSION_COOKIE_TTL_SECONDS             |
| `invalid_signature` | Wrong secret or corrupted | SESSION_COOKIE_SECRET mismatch                |
| `missing_sessionId` | Required claim missing    | Malformed token                               |
| `missing_exp`       | Expiration claim missing  | Malformed token                               |
| `missing_iat`       | Issued-at claim missing   | Malformed token                               |
| `invalid_typ`       | Token type mismatch       | Not a session cookie (typ ≠ "session_cookie") |
| `unknown_error`     | Unexpected error          | Check error logs                              |

---

## Cleanup

```bash
rm cookies.txt cookies-short.txt cookies-bad.txt
```

---

## Automated Test Script

Run all tests automatically:

```bash
./test-session-cookie.sh  # Bash
.\test-session-cookie.ps1  # PowerShell
```

---

## Troubleshooting

### "Unauthorized" even with valid cookie

**Check:**

1. Cookie not expired: `jq '.expiresAt'` from `/auth/session` response
2. SESSION_COOKIE_SECRET matches between issuance and validation
3. Cookie being sent: `curl -v` shows `Cookie: session=...`
4. Server logs show `session_cookie_auth_ok` or reason for failure

### "Set-Cookie not received"

**Check:**

1. Response includes `Set-Cookie` header: `curl -v`
2. For cross-origin: CORS configured with `Access-Control-Allow-Credentials: true`
3. Frontend uses `withCredentials: true`

### Cookie not sent automatically (Angular)

**Check:**

1. All HTTP requests include `withCredentials: true`
2. CORS configured correctly on backend
3. Cookie domain matches (use host-only in dev, set COOKIE_DOMAIN in prod)
4. Check browser DevTools → Application → Cookies

---

## Summary

✅ **Test A**: Issue cookie using Bearer JWT  
✅ **Test B**: Use cookie-only on protected endpoint  
✅ **Test C**: Verify cookie expiry (401 after TTL)  
✅ **Test D**: Cookie precedence over Bearer JWT  
✅ **Test E**: Cross-origin documentation (CORS + withCredentials)

All tests verify proper logging with `session_cookie_issued`, `session_cookie_auth_ok`, and `session_cookie_auth_failed` events.
