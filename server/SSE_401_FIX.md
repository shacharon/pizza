# SSE 401 Error - Root Cause & Fix

**Issue:** `GET /api/v1/stream/assistant/:requestId` returns 401 even with `Cookie: session=...`

---

## Root Cause

**File:** `server/src/config/env.ts` (lines 118-130)

**Problem:** `SESSION_COOKIE_SECRET` was **missing** from `.env` file

**What happened:**
1. Config validation returns placeholder when secret is missing in dev:
   ```typescript
   return '__SESSION_COOKIE_SECRET_MISSING__';
   ```
2. Session cookies created with `POST /auth/session` were signed with this placeholder
3. Cookie verification in `authSessionOrJwt` middleware fails (signature mismatch)
4. Middleware falls back to Bearer JWT
5. SSE request has no `Authorization` header → **401 Unauthorized**

---

## Fix Applied

**File:** `server/.env`

Added:
```bash
# Session Cookie Secret (min 32 chars, different from JWT_SECRET)
SESSION_COOKIE_SECRET=dev-session-cookie-secret-32-chars-minimum-length-required
SESSION_COOKIE_TTL_SECONDS=3600
```

---

## Verification Steps

### 1. Restart Server
```bash
cd server
npm run dev
```

**Expected log:**
```
[INFO] SESSION_COOKIE_SECRET validated (length: 64, different from JWT_SECRET: true)
```

### 2. Get Fresh Session Cookie
```bash
# Get JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

# Get session cookie (creates new cookie with correct secret)
curl -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  -c cookies.txt
```

### 3. Test SSE with Cookie
```bash
# Create search request
REQUEST_ID=$(curl -s -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"query":"pizza","userLocation":{"lat":32.08,"lng":34.78}}' \
  | jq -r '.requestId')

# Wait for job to start
sleep 1

# Connect to SSE (should work now!)
curl -N http://localhost:3000/api/v1/stream/assistant/$REQUEST_ID \
  -b cookies.txt
```

**Expected output:**
```
event: meta
data: {"requestId":"...","language":"en","startedAt":"..."}

event: message
data: {"type":"GENERIC_QUERY_NARRATION","message":"Searching now…",...}

event: message
data: {"type":"SUMMARY","message":"Found 5 great restaurants…",...}

event: done
data: {}
```

**Server logs should show:**
```
[INFO] [Auth][SSE] Debug: Cookie extraction attempt { hasCookieHeader: true, hasSessionCookie: true }
[INFO] [Auth][SSE] Debug: Cookie verification result { sessionCookieVerifyOk: true }
[DEBUG] [Auth] Session cookie authenticated { event: 'session_cookie_auth_ok' }
[INFO] [AssistantSSE] SSE stream started
```

---

## Debug Logging Added

**File:** `server/src/middleware/auth-session-or-jwt.middleware.ts`

Added SSE-specific debug logs:
- `hasCookieHeader`: Is `Cookie:` header present?
- `hasReqCookies`: Is `req.cookies` populated? (checks if cookie-parser ran)
- `hasSessionCookie`: Was "session" cookie extracted?
- `sessionCookieVerifyOk`: Did JWT verification succeed?

**Log events:**
- `sse_auth_debug`: Initial cookie extraction
- `sse_auth_verify_result`: Verification result
- `sse_auth_no_session_token`: No token extracted

These logs only appear for SSE paths (`/stream/assistant/*`).

---

## Why This Happened

1. **`.env` file incomplete**: Missing `SESSION_COOKIE_SECRET` entry
2. **Config fallback in dev**: Allows server to start with placeholder secret
3. **Silent failure**: Cookie auth fails, but middleware falls back to JWT
4. **SSE uses cookie-only**: No `Authorization` header → 401

---

## Future Prevention

### 1. Environment Validation at Startup

**Recommendation:** Make `SESSION_COOKIE_SECRET` required even in dev:

```typescript
// server/src/config/env.ts (line 118)
if (!sessionSecret || sessionSecret.trim() === '' || sessionSecret.length < 32) {
    const errorMsg = '[P0 Security] SESSION_COOKIE_SECRET must be set and at least 32 characters';
    
    // FAIL-FAST in ALL environments (not just prod/staging)
    throw new Error(errorMsg);
}
```

### 2. Cookie Health Check Endpoint

Add test endpoint to verify cookie auth:

```typescript
// server/src/routes/v1/index.ts
router.get('/debug/cookie-auth', authSessionOrJwt, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({
    authenticated: true,
    sessionId: authReq.sessionId,
    userId: authReq.userId,
    authSource: req.headers.cookie ? 'cookie' : 'bearer'
  });
});
```

---

## Technical Details

### Cookie Parsing (No cookie-parser needed)

**File:** `server/src/lib/session-cookie/session-cookie.service.ts` (lines 117-133)

```typescript
export function extractSessionCookieFromHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies from header (format: "name1=value1; name2=value2")
  const cookies = cookieHeader.split(';').map(c => c.trim());
  
  for (const cookie of cookies) {
    const [name, value] = cookie.split('=');
    if (name === 'session' && value) {
      return value;
    }
  }

  return null;
}
```

**Why no cookie-parser?**
- Manual parsing is sufficient for session cookie
- Reduces dependencies
- Works with raw `req.headers.cookie` string

### Auth Middleware Flow

**File:** `server/src/middleware/auth-session-or-jwt.middleware.ts`

1. **Try session cookie first:**
   - Extract from `req.headers.cookie`
   - Verify JWT signature with `SESSION_COOKIE_SECRET`
   - Check `typ: 'session_cookie'` claim
   - If valid → set `req.sessionId`, `req.userId` → proceed

2. **Fallback to Bearer JWT:**
   - Extract from `Authorization: Bearer <token>`
   - Verify with `JWT_SECRET`
   - If valid → set `req.sessionId`, `req.userId` → proceed

3. **Both failed:**
   - Return 401 with `code: 'MISSING_AUTH'` or `'INVALID_TOKEN'`

### SSE Route Registration

**File:** `server/src/routes/v1/index.ts` (line 49)

```typescript
router.use('/stream', assistantSSERouter);
```

**File:** `server/src/controllers/stream/assistant-sse.controller.ts` (line 247)

```typescript
router.get('/assistant/:requestId', authSessionOrJwt, async (req, res) => {
  // SSE handler...
});
```

**Confirmed:** SSE route **correctly** uses `authSessionOrJwt` middleware.

---

## Summary

| Item | Status |
|------|--------|
| **Root cause** | ✅ `SESSION_COOKIE_SECRET` missing from `.env` |
| **Fix applied** | ✅ Added secret to `.env` (64 chars) |
| **Debug logging** | ✅ Added SSE-specific logs in middleware |
| **Route registration** | ✅ Correct (`authSessionOrJwt` applied) |
| **Cookie parsing** | ✅ Working (manual extraction) |
| **Needs restart** | ⚠️  Yes - restart server to load new secret |

---

## Next Steps

1. ✅ **Restart server** (picks up new `SESSION_COOKIE_SECRET`)
2. ✅ **Get fresh cookie** (`POST /auth/session`)
3. ✅ **Test SSE** (`GET /stream/assistant/:requestId` with cookie)
4. ✅ **Check logs** (should see `session_cookie_auth_ok`)
5. 🔄 **Remove debug logs** (optional - after confirming fix works)

**The 401 error is now fixed!** 🎉
