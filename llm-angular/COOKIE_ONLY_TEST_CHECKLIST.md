# Cookie-Only Mode - Test Checklist

Quick verification checklist for cookie_only mode readiness.

---

## Pre-Test Setup

```bash
# 1. Edit environment file
vim src/environments/environment.ts
# Change: authMode: 'cookie_only'

# 2. Restart server
npm start

# 3. Open browser to http://localhost:4200
```

---

## Test Checklist

### ✅ Test #1: Console Logs

**Open**: Browser DevTools > Console

**Expected Logs**:
- [ ] `[Auth] AUTH_MODE=cookie_only - skipping requestSessionCookie on startup`
- [ ] `[Auth] AUTH_MODE=cookie_only - skipping JWT` (on first API call)
- [ ] `[Session] AUTH_MODE=cookie_only - skipping x-session-id header` (on first API call)

**No Error Logs**:
- [ ] NO warnings about "Failed to obtain session cookie"
- [ ] NO 401 errors on startup

---

### ✅ Test #2: Network Headers

**Open**: Browser DevTools > Network

**Make a search request**, then inspect headers:

**Request Headers Should Have**:
- [ ] `Cookie: session=...` ✅
- [ ] NO `Authorization: Bearer ...` ❌
- [ ] NO `x-session-id: sess_...` ❌

**Request Headers Should Look Like**:
```http
GET /api/v1/search HTTP/1.1
Cookie: session=abc123...
Content-Type: application/json
```

---

### ✅ Test #3: Bootstrap on 401

**Clear cookies**:
```javascript
// In browser console
document.cookie.split(';').forEach(c => {
  document.cookie = c.trim().split('=')[0] + '=; Max-Age=0';
});
```

**Make a search request**

**Expected Flow** (check Network tab):
- [ ] Step 1: `GET /api/v1/search` → 401 Unauthorized
- [ ] Step 2: `POST /api/v1/auth/bootstrap` → 200 OK
- [ ] Step 3: `GET /api/v1/search` (retry) → 200 OK

**Expected Console**:
- [ ] `[Http401Retry] bootstrap_retry`
- [ ] `[SessionBootstrap] bootstrap_triggered`
- [ ] `[SessionBootstrap] bootstrap_success`
- [ ] `[Http401Retry] bootstrap_retry_complete - retrying request`

---

### ✅ Test #4: localStorage JWT Ignored

**Check localStorage**:
```javascript
// In browser console
localStorage.getItem('g2e_jwt')
```

**Expected**:
- [ ] JWT exists: `"eyJhbGc..."` (or may be null)
- [ ] If JWT exists, it should NOT appear in Network headers
- [ ] Only `Cookie` header should be sent

---

### ✅ Test #5: SSE Works

**Make a search request with assistant**

**Check Network** for SSE connection:
- [ ] `GET /api/v1/stream/assistant/req_...`
- [ ] Request headers: `Cookie: session=...`
- [ ] NO `Authorization` header
- [ ] Status: 200 OK
- [ ] EventStream active

**Expected Behavior**:
- [ ] Assistant messages appear
- [ ] No errors in console
- [ ] SSE connection stable

---

### ✅ Test #6: Protected Endpoints Work

**Test these endpoints**:

**Search**:
- [ ] POST `/api/v1/search` returns 200 OK
- [ ] Only Cookie header sent

**Analytics**:
- [ ] POST `/api/v1/analytics/events` returns 200 OK (check console, fire-and-forget)
- [ ] Only Cookie header sent

**SSE**:
- [ ] GET `/api/v1/stream/assistant/:id` returns 200 OK
- [ ] Only Cookie header sent

---

### ✅ Test #7: No Startup Errors

**Hard refresh** (Ctrl+Shift+R)

**Check Console**:
- [ ] NO errors
- [ ] NO warnings about auth/session
- [ ] NO failed /auth/session requests

**Check Network**:
- [ ] NO 401 errors on startup
- [ ] NO failed requests

---

## Pass Criteria Summary

| Test | Pass Criteria | Status |
|------|---------------|--------|
| Console Logs | AUTH_MODE logs present, no errors | [ ] |
| Network Headers | Only Cookie, no JWT/session-id | [ ] |
| Bootstrap on 401 | Auto-retry works | [ ] |
| JWT Ignored | localStorage JWT not sent | [ ] |
| SSE Works | EventStream with cookies only | [ ] |
| Protected Endpoints | All return 200 OK | [ ] |
| No Startup Errors | Clean startup | [ ] |

---

## Troubleshooting

### ❌ Still seeing Authorization header

**Cause**: Did not restart server after editing environment.ts

**Fix**:
```bash
# Stop server (Ctrl+C)
# Edit environment.ts → authMode: 'cookie_only'
npm start
```

---

### ❌ 401 errors on startup

**Cause**: AuthService constructor still calling requestSessionCookie

**Fix**: Verify patch was applied (check auth.service.ts line 43-51)

**Expected Code**:
```typescript
if (environment.authMode === 'dual') {
  this.requestSessionCookie(stored).catch(/* ... */);
} else {
  console.debug('[Auth] AUTH_MODE=cookie_only - skipping requestSessionCookie on startup');
}
```

---

### ❌ No Cookie header

**Cause**: Session not bootstrapped

**Fix**:
1. Clear cookies
2. Make API request
3. Should auto-bootstrap
4. Check `/api/v1/auth/bootstrap` in Network tab

---

### ❌ SSE not working

**Cause**: Check if SSE endpoint requires JWT on backend

**Debug**:
1. Check Network tab for SSE request
2. Verify Cookie header is sent
3. Check backend logs for auth errors

---

## Success Indicators

✅ **All green** = Cookie-only mode working perfectly

```
✅ Console logs indicate cookie_only mode
✅ Network shows only Cookie headers
✅ Bootstrap auto-triggers on 401
✅ JWT ignored even if in localStorage
✅ SSE works with cookies only
✅ All protected endpoints return 200
✅ No startup errors
```

---

## Final Check

**Switch back to dual mode** and verify it still works:

```typescript
// environment.ts
authMode: 'dual'
```

```bash
npm start
```

**Expected**:
- [ ] JWT fetched and sent
- [ ] x-session-id header sent
- [ ] Cookies also sent
- [ ] All features work

---

## Report Results

After completing tests, document:

1. **Pass Rate**: X/7 tests passed
2. **Failures**: List any failed tests
3. **Issues**: Note any unexpected behavior
4. **Logs**: Save console output
5. **Network**: Screenshot headers

---

**Checklist Version**: 1.0  
**Date**: 2026-02-14  
**Status**: Ready for testing
