# Session Cookie - Smoke Tests Quick Reference

## ⚡ Run Tests (1 Command)

```bash
# Bash/Linux/Mac
./test-session-cookie-smoke.sh

# PowerShell/Windows
.\test-session-cookie-smoke.ps1
```

**Expected:** All tests pass ✅

---

## 🔍 Manual Quick Test (3 Commands)

```bash
# 1. Get JWT + create cookie
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" -d '{}' | jq -r '.token')

curl -X POST http://localhost:3000/api/v1/auth/session \
  -H "Authorization: Bearer $TOKEN" -c cookies.txt

# 2. Test cookie auth (no Bearer token!)
curl -X GET http://localhost:3000/api/v1/auth/whoami -b cookies.txt

# 3. Verify authSource="cookie"
curl -s -X GET http://localhost:3000/api/v1/auth/whoami \
  -b cookies.txt | jq '.authSource'
```

**Expected output:** `"cookie"`

---

## 📋 Test Scenarios

| Test | Command | Expected |
|------|---------|----------|
| **Issue Cookie** | `curl -X POST /auth/session -H "Authorization: Bearer $TOKEN"` | HTTP 200, Set-Cookie header |
| **Use Cookie** | `curl -X GET /auth/whoami -b cookies.txt` | `authSource: "cookie"` |
| **Cookie Precedence** | `curl -X GET /whoami -H "Authorization: Bearer $TOKEN" -b cookies.txt` | `authSource: "cookie"` (not bearer) |
| **JWT Fallback** | `curl -X GET /whoami -H "Authorization: Bearer $TOKEN" -b bad-cookie.txt` | `authSource: "bearer"` |
| **Expiry** | Wait >TTL seconds, then use cookie | HTTP 401 |

---

## 📚 Full Documentation

- **Complete tests:** `docs/auth-session-cookie.md`
- **Implementation:** `SESSION_COOKIE_IMPLEMENTATION.md`
- **Deliverable:** `PROMPT1.5_DELIVERABLE.md`

---

## 🐛 Troubleshooting

**Tests fail?**
1. Server running? `npm run dev`
2. `.env` has `SESSION_COOKIE_SECRET`?
3. Check logs for error details

**Cookie not working?**
1. Check `Set-Cookie` header: `curl -v`
2. Verify log: `session_cookie_issued`
3. See `docs/auth-session-cookie.md` troubleshooting section

---

## ✅ Success Indicators

**Console logs:**
```
[SessionCookie] Session cookie issued { event: 'session_cookie_issued' }
[Auth] Session cookie authenticated { event: 'session_cookie_auth_ok' }
```

**Test output:**
```
✅ All Smoke Tests Passed!
```

**Whoami response:**
```json
{ "authSource": "cookie", "authenticated": true }
```
