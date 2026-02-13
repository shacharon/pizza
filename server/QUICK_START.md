# Session Cookie Auth - Quick Start Guide

## ⚡ 3-Minute Setup

### Step 1: Update `.env`

Add these lines to `server/.env`:

```bash
SESSION_COOKIE_SECRET=my-session-secret-must-be-32-chars-or-more-different-from-jwt
SESSION_COOKIE_TTL_SECONDS=3600
```

### Step 2: Start Server

```bash
cd server
npm run dev
```

### Step 3: Test (Choose One)

**Option A - Automated (Recommended):**
```bash
# Bash/Mac/Linux
./test-session-cookie.sh

# Windows PowerShell
.\test-session-cookie.ps1
```

**Option B - Manual cURL:**
```bash
# 1. Get JWT
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

# 2. Get session cookie
curl -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" \
  -c cookies.txt -v

# 3. Use cookie (no Bearer token!)
curl -X POST http://localhost:3000/api/v1/search?mode=sync \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"query":"pizza","userLocation":{"lat":32.08,"lng":34.78}}'
```

---

## ✅ Success Indicators

### Console Logs:
```
[Config] Loaded {
  sessionCookieTtlSeconds: 3600,
  cookieDomain: '(host-only)',
  cookieSameSite: 'Lax'
}
```

### Cookie Response:
```
< HTTP/1.1 200 OK
< Set-Cookie: session=eyJhbG...; HttpOnly; Path=/; Max-Age=3600; SameSite=Lax
```

### Auth Log:
```
[Auth] Session cookie authenticated { sessionId: 'sess_...', event: 'session_cookie_auth_ok' }
```

---

## 🐛 Troubleshooting

### "SESSION_COOKIE_SECRET must be set"
- Add `SESSION_COOKIE_SECRET` to `.env`
- Must be >= 32 characters

### "SESSION_COOKIE_SECRET must be different from JWT_SECRET"
- Use different values for the two secrets

### "Session cookie invalid"
- Cookie may have expired (default: 1 hour)
- Get a fresh cookie: `POST /api/v1/auth/session`

### Tests fail
- Ensure server is running on port 3000
- Check `.env` has both JWT_SECRET and SESSION_COOKIE_SECRET
- Verify `jq` is installed (for parsing JSON)

---

## 📚 Documentation

- **Full implementation:** `SESSION_COOKIE_IMPLEMENTATION.md`
- **Manual tests:** `CURL_SESSION_COOKIE_TESTS.md`
- **Deliverable:** `PROMPT1_DELIVERABLE.md`

---

## 🎯 What Works Now

✅ Create session cookie with Bearer JWT  
✅ Authenticate with cookie (no Bearer token needed)  
✅ Both auth methods work independently  
✅ Bearer JWT still valid after cookie created  
✅ HttpOnly, Secure (prod), SameSite protection  

---

## 🚀 Ready for Prompt 2

Session cookies are production-ready and can now be used for:
- SSE endpoint authentication (`GET /stream/assistant/:requestId`)
- Eliminating WS ticket dependency for assistant
- Simpler frontend auth flow (automatic cookie handling)
