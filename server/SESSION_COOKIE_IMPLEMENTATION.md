# Session Cookie Authentication - Implementation Summary

## Overview

Added HttpOnly session cookie authentication as an **additional auth method** alongside existing Bearer JWT. Both methods work independently and simultaneously.

---

## Implementation Details

### 1. Session Cookie Service
**File:** `src/lib/session-cookie/session-cookie.service.ts`

**Functions:**
- `signSessionCookie()` - Creates JWT with `typ="session_cookie"` claim
- `verifySessionCookie()` - Validates cookie token with strict type checking
- `extractSessionCookieFromHeader()` - Parses cookie from HTTP header

**Security Features:**
- Separate `SESSION_COOKIE_SECRET` (not JWT_SECRET)
- JWT with `typ="session_cookie"` to distinguish from access tokens
- Validates required claims: `sessionId`, `exp`, `iat`, `typ`
- 5-second clock skew tolerance

### 2. Session Cookie Controller
**File:** `src/controllers/auth/auth.controller.ts`

**New Endpoint:**
```
POST /api/v1/auth/session
Authorization: Bearer <JWT> (required)
```

**Response:**
```json
{
  "ok": true,
  "sessionId": "sess_abc-123",
  "expiresAt": "2026-02-13T12:00:00.000Z"
}
```

**Cookie Attributes:**
- `HttpOnly` - Prevents JavaScript access (XSS protection)
- `Secure` - HTTPS only in production/staging
- `SameSite=Lax` - CSRF protection (configurable: Strict/Lax/None)
- `Path=/` - Applies to all routes
- `Max-Age` - TTL from SESSION_COOKIE_TTL_SECONDS
- `Domain` - Optional (host-only by default)

### 3. Universal Auth Middleware
**File:** `src/middleware/auth-session-or-jwt.middleware.ts`

**Function:** `authSessionOrJwt()`

**Authentication Flow:**
1. Try session cookie first (from `Cookie` header)
   - Extract cookie named "session"
   - Verify with SESSION_COOKIE_SECRET
   - If valid → set `req.userId`, `req.sessionId` → continue
2. Fallback to Bearer JWT (from `Authorization` header)
   - Verify with JWT_SECRET
   - If valid → set `req.userId`, `req.sessionId` → continue
3. If both fail → HTTP 401 Unauthorized

**Logs:**
- `session_cookie_auth_ok` - Cookie authenticated
- `jwt_auth_ok` - JWT fallback authenticated
- `session_cookie_auth_failed` - Cookie invalid, trying JWT
- `auth_failed_no_credentials` - Both methods failed

### 4. Configuration
**File:** `src/config/env.ts`

**New Environment Variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_COOKIE_SECRET` | Yes (prod/staging) | - | Must be ≥32 chars, different from JWT_SECRET |
| `SESSION_COOKIE_TTL_SECONDS` | No | 3600 (1h) | Cookie expiration time |
| `COOKIE_DOMAIN` | No | empty (host-only) | Cookie domain (e.g., `.yourdomain.com`) |
| `COOKIE_SAMESITE` | No | Lax | SameSite attribute: Strict/Lax/None |

**Validation:**
- Fail-fast in production if SESSION_COOKIE_SECRET missing/invalid
- Fail-fast if SESSION_COOKIE_SECRET == JWT_SECRET
- Warn if SameSite=None without Secure in production

### 5. Existing Endpoints
**No changes required!** All existing JWT-protected endpoints automatically support session cookies via `authSessionOrJwt` middleware (when migrated).

**Current Status:**
- JWT-only endpoints: `/api/v1/search`, `/api/v1/analytics`, `/api/v1/auth/ws-ticket`
- To migrate: Replace `authenticateJWT` with `authSessionOrJwt` in routes

---

## Security Considerations

### ✅ XSS Protection
- HttpOnly cookies cannot be accessed by JavaScript
- Even if XSS vulnerability exists, cookie cannot be stolen

### ✅ CSRF Protection
- SameSite=Lax prevents most CSRF attacks
- Consider adding CSRF tokens for state-changing operations if SameSite=None

### ✅ Secret Separation
- SESSION_COOKIE_SECRET ≠ JWT_SECRET
- Compromising one doesn't compromise the other

### ✅ Token Type Validation
- Cookie JWT has `typ="session_cookie"` claim
- Prevents using access JWT as session cookie (and vice versa)

### ⚠️ Limitations (Stateless Design)
- Cannot revoke cookies before expiry (no server-side session store)
- Consider adding Redis session store for revocation if needed

---

## Migration Path

### Phase 1: Add Session Cookie Support (CURRENT)
- ✅ Session cookie service implemented
- ✅ POST /auth/session endpoint added
- ✅ authSessionOrJwt middleware created
- ⏳ Existing endpoints still use JWT-only

### Phase 2: Migrate Endpoints (Optional)
Update route registration to use new middleware:

**Before:**
```typescript
router.use('/search', authenticateJWT, searchRateLimiter, searchRouter);
```

**After:**
```typescript
import { authSessionOrJwt } from '../middleware/auth-session-or-jwt.middleware.js';
router.use('/search', authSessionOrJwt, searchRateLimiter, searchRouter);
```

### Phase 3: SSE Migration (Future)
- Use session cookie for SSE authentication
- No WS tickets needed for assistant endpoint
- Keep Bearer JWT for mobile apps

---

## Testing

### Automated Tests
```bash
# Bash (Linux/Mac)
./test-session-cookie.sh

# PowerShell (Windows)
.\test-session-cookie.ps1
```

### Manual cURL Tests
See `CURL_SESSION_COOKIE_TESTS.md` for detailed cURL examples.

**Quick Test:**
```bash
# 1. Get JWT
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

# 2. Get session cookie
curl -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  -c cookies.txt -v

# 3. Use cookie (no Bearer token)
curl -X POST http://localhost:3000/api/v1/search?mode=sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"query":"pizza","userLocation":{"lat":32.08,"lng":34.78}}'
```

---

## Files Modified/Created

### Created:
- `src/lib/session-cookie/session-cookie.service.ts` - Core cookie logic
- `src/middleware/auth-session-or-jwt.middleware.ts` - Universal auth middleware
- `.env.example` - Environment variable documentation
- `test-session-cookie.sh` - Bash test script
- `test-session-cookie.ps1` - PowerShell test script
- `CURL_SESSION_COOKIE_TESTS.md` - Manual test documentation
- `SESSION_COOKIE_IMPLEMENTATION.md` - This file

### Modified:
- `src/config/env.ts` - Added session cookie config + validation
- `src/controllers/auth/auth.controller.ts` - Added POST /session endpoint
- `src/routes/v1/index.ts` - Updated route documentation

### Not Modified:
- `src/middleware/auth.middleware.ts` - Existing JWT auth unchanged
- `src/infra/websocket/*` - WebSocket ticket flow unchanged
- `src/services/search/*` - Search pipeline unchanged

---

## Environment Setup

### Development:
```bash
# .env
SESSION_COOKIE_SECRET=dev-session-secret-at-least-32-chars-long-different-from-jwt
SESSION_COOKIE_TTL_SECONDS=3600
COOKIE_DOMAIN=
COOKIE_SAMESITE=Lax
```

### Production:
```bash
# .env
SESSION_COOKIE_SECRET=<strong-random-secret-32+chars>
SESSION_COOKIE_TTL_SECONDS=86400
COOKIE_DOMAIN=.yourdomain.com
COOKIE_SAMESITE=Lax
```

### Cross-Site Cookies (if needed):
```bash
COOKIE_SAMESITE=None
# Requires Secure flag (automatically added in production)
```

---

## Logs to Monitor

### Success:
```
[SessionCookie] Session cookie issued { sessionId, userId, expiresAt, event: 'session_cookie_issued' }
[Auth] Session cookie authenticated { sessionId, event: 'session_cookie_auth_ok' }
```

### Fallback:
```
[Auth] Session cookie invalid, trying JWT fallback
[Auth] Bearer JWT authenticated { sessionId, event: 'jwt_auth_ok' }
```

### Failure:
```
[SessionCookie] Token has invalid typ claim { typ: 'JWT' }
[Auth] No valid session cookie or Bearer token { event: 'auth_failed_no_credentials' }
```

---

## Next Steps

1. **Test in dev environment:**
   ```bash
   npm run dev
   ./test-session-cookie.sh
   ```

2. **Verify logs:**
   - Check `session_cookie_issued` events
   - Check `session_cookie_auth_ok` events
   - Confirm fallback to JWT works

3. **Production deployment:**
   - Set strong SESSION_COOKIE_SECRET (≠ JWT_SECRET)
   - Configure COOKIE_DOMAIN if needed
   - Verify Secure flag is set (auto in prod)

4. **Optional: Migrate endpoints:**
   - Replace `authenticateJWT` with `authSessionOrJwt` in routes
   - Test each endpoint with both auth methods

5. **Future: SSE migration (Prompt 2):**
   - Use session cookie for SSE authentication
   - Implement `GET /api/v1/stream/assistant/:requestId`
   - Remove WS ticket dependency for assistant
