# Auth Mode Toggle Guide

## Overview

The app supports two authentication modes that can be toggled without removing JWT code:

1. **`dual`** (default): Send both JWT + session cookies
2. **`cookie_only`**: Send only session cookies (pure server-authoritative)

This allows testing the new cookie-based session flow while keeping all JWT infrastructure intact.

---

## Authentication Modes Explained

### Mode: `dual` (Default)

**What gets sent**:
- ✅ `Authorization: Bearer <jwt>` header
- ✅ `x-session-id: sess_<uuid>` header (client-derived)
- ✅ `Cookie: session=<uuid>` (HttpOnly, server-managed)

**Use case**: Current production state. Backend can authenticate via JWT OR session cookie.

**Services active**:
- AuthService (fetches/stores JWT)
- auth.interceptor (attaches JWT header)
- api-session.interceptor (attaches x-session-id + cookies)
- 401 retry with bootstrap

---

### Mode: `cookie_only`

**What gets sent**:
- ❌ No `Authorization` header
- ❌ No `x-session-id` header
- ✅ `Cookie: session=<uuid>` (HttpOnly, server-managed)

**Use case**: Testing pure server-authoritative session flow before JWT removal.

**Services active**:
- ❌ JWT attachment disabled (but AuthService still exists)
- ✅ Cookies still sent (`withCredentials: true`)
- ✅ 401 retry with bootstrap still works
- ✅ SSE unchanged (uses cookies)

**What's NOT removed**:
- JWT storage in localStorage (ignored)
- AuthService code (inactive)
- auth.interceptor code (skipped)

---

## How to Switch Auth Mode

### Option 1: Change Environment File (Persistent)

Edit the environment file for your target environment:

**Local Development** (`src/environments/environment.ts`):
```typescript
export const environment = {
  // ... other config ...
  authMode: 'cookie_only' // Change from 'dual' to 'cookie_only'
};
```

**AWS Dev** (`src/environments/environment.development.ts`):
```typescript
export const environment = {
  // ... other config ...
  authMode: 'cookie_only'
};
```

**Production** (`src/environments/environment.production.ts`):
```typescript
export const environment = {
  // ... other config ...
  authMode: 'cookie_only'
};
```

Then restart the dev server:
```bash
npm start
# or
ng serve --configuration=development
```

---

### Option 2: Runtime Override (Quick Testing)

For quick testing without recompiling, you can override in browser console:

```typescript
// Not possible with Angular's environment system
// Must edit file and rebuild
```

**Note**: Angular's `environment` object is compile-time only, so file changes require rebuild.

---

## Testing Cookie-Only Mode

### 1. Switch to Cookie-Only Mode

Edit `src/environments/environment.ts`:
```typescript
authMode: 'cookie_only'
```

### 2. Restart Dev Server
```bash
npm start
```

### 3. Open Browser DevTools

**Console** - Look for these logs:
```
[Auth] AUTH_MODE=cookie_only - skipping JWT
[Session] AUTH_MODE=cookie_only - skipping x-session-id header
```

**Network Tab** - Inspect any API request:
- ❌ Should NOT have `Authorization: Bearer ...` header
- ❌ Should NOT have `x-session-id: sess_...` header
- ✅ SHOULD have `Cookie: session=<uuid>` header

### 4. Test Bootstrap Flow

Clear cookies and JWT:
```javascript
// In browser console
document.cookie = 'session=; Max-Age=0';
localStorage.removeItem('g2e_jwt');
```

Make a search request or any API call:
1. First request → 401 Unauthorized
2. Bootstrap automatically triggered
3. Session cookie set
4. Request retried
5. Success with cookie-only auth

### 5. Verify localStorage JWT is Ignored

Even if `g2e_jwt` exists in localStorage, it should NOT be sent:
```javascript
// Check if JWT exists (it might)
localStorage.getItem('g2e_jwt')

// But Authorization header should NOT be sent
// Verify in Network tab
```

---

## Expected Behavior by Mode

### Dual Mode Behavior

| Scenario | Expected Result |
|----------|----------------|
| No JWT, no cookie | 401 → bootstrap → retry with JWT + cookie |
| JWT exists, no cookie | Request sent with JWT → success |
| No JWT, cookie exists | 401 (no JWT) → bootstrap → retry with JWT + cookie |
| Both exist | Request sent with both → success |

### Cookie-Only Mode Behavior

| Scenario | Expected Result |
|----------|----------------|
| No cookie | 401 → bootstrap → retry with cookie only |
| Cookie exists | Request sent with cookie → success |
| JWT exists in localStorage | Ignored (not sent) |
| Bootstrap called | Sets cookie, no JWT involved |

---

## Code Changes Summary

### Files Modified (5 files)

#### 1. `src/environments/environment.ts`
Added `authMode: 'dual' | 'cookie_only'` property (default: `'dual'`)

#### 2. `src/environments/environment.development.ts`
Added `authMode: 'dual' | 'cookie_only'` property

#### 3. `src/environments/environment.production.ts`
Added `authMode: 'dual' | 'cookie_only'` property

#### 4. `src/app/core/interceptors/auth.interceptor.ts`
Added check:
```typescript
if (environment.authMode === 'cookie_only') {
  console.debug('[Auth] AUTH_MODE=cookie_only - skipping JWT');
  return next(req);
}
```

#### 5. `src/app/shared/http/api-session.interceptor.ts`
Added check:
```typescript
if (environment.authMode === 'cookie_only') {
  console.debug('[Session] AUTH_MODE=cookie_only - skipping x-session-id header');
  const cloned = req.clone({ withCredentials: true });
  return next(cloned);
}
```

---

## Files NOT Modified

✅ **JWT code preserved** (inactive in cookie_only mode):
- `src/app/core/auth/auth.service.ts` - JWT storage/fetch logic
- `src/app/core/services/auth-api.service.ts` - JWT API endpoints
- localStorage `g2e_jwt` key - Still exists, just ignored

✅ **Bootstrap flow unchanged**:
- `src/app/core/services/session-bootstrap.service.ts`
- `src/app/core/services/http-401-retry.service.ts`

✅ **SSE unchanged**:
- `src/app/core/services/assistant-sse.service.ts`
- Already uses `withCredentials: true`

---

## Debugging

### Check Current Auth Mode

In browser console:
```typescript
// This won't work - environment is compile-time
// Instead, check console logs:

// Look for these logs on any API request:
// If dual mode: (no special logs)
// If cookie_only: "[Auth] AUTH_MODE=cookie_only - skipping JWT"
```

### Verify Headers Sent

Open DevTools > Network > Select any API request > Headers tab:

**Dual Mode**:
```
Authorization: Bearer eyJhbGc...
x-session-id: sess_abc123...
Cookie: session=def456...
```

**Cookie-Only Mode**:
```
Cookie: session=def456...
(no Authorization, no x-session-id)
```

### Check Bootstrap Logs

Console should show:
```
[SessionBootstrap] bootstrap_triggered
[SessionBootstrap] bootstrap_success
[Http401Retry] bootstrap_retry_complete - retrying request
```

---

## Migration Path

### Current State: Dual Mode
```
Frontend → JWT + cookies → Backend accepts both
```

### Testing: Cookie-Only Mode
```
Frontend → cookies only → Backend accepts cookies
```

### Future: Remove JWT (separate task)
```
1. Verify cookie_only works in all environments
2. Remove JWT code from frontend
3. Remove JWT code from backend
4. Delete auth.interceptor, AuthService, etc.
```

**This implementation**: Steps 1-2 (testing cookie_only, keeping JWT code)

---

## Troubleshooting

### Issue: Still seeing Authorization header in cookie_only mode

**Cause**: Did not rebuild after changing environment file.

**Fix**:
```bash
# Stop dev server (Ctrl+C)
# Edit environment.ts → authMode: 'cookie_only'
npm start
# Check console for: "[Auth] AUTH_MODE=cookie_only - skipping JWT"
```

---

### Issue: 401 errors in cookie_only mode

**Cause**: Backend may not support session-cookie-only auth for all endpoints.

**Check**:
1. Verify bootstrap endpoint was called: `POST /api/v1/auth/bootstrap`
2. Verify session cookie was set: DevTools > Application > Cookies
3. Check backend logs for auth middleware errors

**Likely reason**: Backend endpoint requires JWT and doesn't accept cookies yet.

---

### Issue: SSE not working in cookie_only mode

**Should not happen** - SSE already uses `withCredentials: true`.

**Verify**:
1. Check Network tab for SSE connection
2. Verify `Cookie` header is sent
3. Check backend SSE middleware (`auth-session.middleware.ts`)

---

## Quick Test Checklist

- [ ] Edit `environment.ts` → `authMode: 'cookie_only'`
- [ ] Restart dev server
- [ ] Check console for `[Auth] AUTH_MODE=cookie_only - skipping JWT`
- [ ] Open Network tab
- [ ] Make search request
- [ ] Verify NO `Authorization` header
- [ ] Verify NO `x-session-id` header
- [ ] Verify `Cookie` header present
- [ ] Clear cookies
- [ ] Make request → should auto-bootstrap
- [ ] Verify success
- [ ] Switch back to `dual` mode
- [ ] Restart dev server
- [ ] Verify JWT headers return

---

## Summary

| Mode | JWT Header | x-session-id | Cookie | Use Case |
|------|-----------|--------------|--------|----------|
| `dual` | ✅ Sent | ✅ Sent | ✅ Sent | Current production |
| `cookie_only` | ❌ Skipped | ❌ Skipped | ✅ Sent | Testing server-auth |

**Key Point**: All JWT code remains in codebase. It's just disabled when `authMode = 'cookie_only'`.

---

## Next Steps

1. Test `cookie_only` mode locally
2. Verify all features work (search, SSE, etc.)
3. Deploy to dev environment with `cookie_only`
4. Monitor for errors
5. If successful, plan JWT code removal (separate task)

---

**Last Updated**: 2026-02-14
