# Auth Mode Side-by-Side Comparison

Quick visual reference for AUTH_MODE differences.

---

## Configuration

### Enable Dual Mode (Default)

```typescript
// src/environments/environment.ts
export const environment = {
  authMode: 'dual' as 'dual' | 'cookie_only',
  // ...
};
```

### Enable Cookie-Only Mode

```typescript
// src/environments/environment.ts
export const environment = {
  authMode: 'cookie_only' as 'dual' | 'cookie_only',
  // ...
};
```

---

## Network Tab Comparison

### Dual Mode - Request Headers

```http
GET /api/v1/search HTTP/1.1
Host: localhost:4200
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
x-session-id: sess_abc123-def456-789...
Cookie: session=xyz789-uvw456-rst123...
Content-Type: application/json
```

### Cookie-Only Mode - Request Headers

```http
GET /api/v1/search HTTP/1.1
Host: localhost:4200
Cookie: session=xyz789-uvw456-rst123...
Content-Type: application/json
```

**Notice**: No `Authorization` or `x-session-id` headers in cookie-only mode.

---

## Console Logs

### Dual Mode

```
(no special auth mode logs)
[SearchAPI] Async 202 accepted
```

### Cookie-Only Mode

```
[Auth] AUTH_MODE=cookie_only - skipping JWT
[Session] AUTH_MODE=cookie_only - skipping x-session-id header
[SearchAPI] Async 202 accepted
```

---

## localStorage Contents

### Dual Mode

```javascript
// localStorage
{
  "g2e_jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // ✅ Used
  "api-session-id": "sess_abc123-def456..."              // ✅ Used
}
```

### Cookie-Only Mode

```javascript
// localStorage
{
  "g2e_jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", // ❌ Ignored
  "api-session-id": "sess_abc123-def456..."              // ❌ Ignored
}
```

**Key Point**: JWT still exists in localStorage but is NOT sent in cookie-only mode.

---

## Cookie Storage (DevTools > Application > Cookies)

### Both Modes (Identical)

```
Name: session
Value: xyz789-uvw456-rst123...
Domain: localhost
Path: /
Expires: (7 days from now)
HttpOnly: ✓
Secure: ✓ (production only)
SameSite: Lax
```

**Key Point**: Session cookie is ALWAYS sent in both modes.

---

## Bootstrap Flow

### Dual Mode - Bootstrap Response

```http
POST /api/v1/auth/bootstrap HTTP/1.1

HTTP/1.1 200 OK
Set-Cookie: session=xyz789...; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax

{
  "ok": true,
  "sessionId": "xyz789...",
  "traceId": "req_..."
}
```

**Next request includes**:
- ✅ Authorization: Bearer <jwt>
- ✅ x-session-id: sess_...
- ✅ Cookie: session=xyz789...

### Cookie-Only Mode - Bootstrap Response

```http
POST /api/v1/auth/bootstrap HTTP/1.1

HTTP/1.1 200 OK
Set-Cookie: session=xyz789...; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax

{
  "ok": true,
  "sessionId": "xyz789...",
  "traceId": "req_..."
}
```

**Next request includes**:
- ❌ No Authorization header
- ❌ No x-session-id header
- ✅ Cookie: session=xyz789...

---

## 401 Retry Flow

### Scenario: No Session Cookie

#### Dual Mode

```
1. GET /api/v1/search
   → Headers: Authorization, x-session-id, (no cookie)
   → Response: 401 Unauthorized

2. POST /api/v1/auth/bootstrap
   → Response: 200 OK, Set-Cookie

3. GET /api/v1/search (retry)
   → Headers: Authorization, x-session-id, Cookie
   → Response: 200 OK
```

#### Cookie-Only Mode

```
1. GET /api/v1/search
   → Headers: (no Authorization, no x-session-id, no cookie)
   → Response: 401 Unauthorized

2. POST /api/v1/auth/bootstrap
   → Response: 200 OK, Set-Cookie

3. GET /api/v1/search (retry)
   → Headers: Cookie only
   → Response: 200 OK
```

---

## Code Execution Path

### Dual Mode

```typescript
// auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) return next(req);
  if (req.headers.has('Authorization')) return next(req);
  if (req.url.includes('/auth/token')) return next(req);
  
  // environment.authMode === 'dual' (default)
  // → Continue to get token
  
  const authService = inject(AuthService);
  return from(authService.getToken()).pipe(
    switchMap(token => {
      const cloned = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
      return next(cloned);
    })
  );
};
```

```typescript
// api-session.interceptor.ts
export const apiSessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) return next(req);
  if (req.headers.has('x-session-id')) {
    const withCreds = req.clone({ withCredentials: true });
    return next(withCreds);
  }
  
  // environment.authMode === 'dual' (default)
  // → Attach x-session-id
  
  const sessionId = getSessionId();
  const cloned = req.clone({
    setHeaders: { 'x-session-id': sessionId },
    withCredentials: true
  });
  return next(cloned);
};
```

### Cookie-Only Mode

```typescript
// auth.interceptor.ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) return next(req);
  if (req.headers.has('Authorization')) return next(req);
  if (req.url.includes('/auth/token')) return next(req);
  
  // environment.authMode === 'cookie_only'
  if (environment.authMode === 'cookie_only') {
    console.debug('[Auth] AUTH_MODE=cookie_only - skipping JWT');
    return next(req); // ← Early return, no JWT
  }
  
  // Not reached in cookie_only mode
  const authService = inject(AuthService);
  // ...
};
```

```typescript
// api-session.interceptor.ts
export const apiSessionInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) return next(req);
  if (req.headers.has('x-session-id')) {
    const withCreds = req.clone({ withCredentials: true });
    return next(withCreds);
  }
  
  // environment.authMode === 'cookie_only'
  if (environment.authMode === 'cookie_only') {
    console.debug('[Session] AUTH_MODE=cookie_only - skipping x-session-id header');
    const cloned = req.clone({ withCredentials: true }); // Only cookies
    return next(cloned); // ← Early return, no x-session-id
  }
  
  // Not reached in cookie_only mode
  const sessionId = getSessionId();
  // ...
};
```

---

## Feature Comparison Table

| Feature | Dual Mode | Cookie-Only Mode |
|---------|-----------|------------------|
| **Authentication Headers** |
| Authorization (JWT) | ✅ Sent | ❌ Not sent |
| x-session-id | ✅ Sent | ❌ Not sent |
| Cookie (session) | ✅ Sent | ✅ Sent |
| **localStorage** |
| g2e_jwt stored | ✅ Yes | ✅ Yes (ignored) |
| api-session-id stored | ✅ Yes | ✅ Yes (ignored) |
| **Services** |
| AuthService active | ✅ Yes | ⚠️ Exists but inactive |
| SessionBootstrap active | ✅ Yes | ✅ Yes |
| Http401Retry active | ✅ Yes | ✅ Yes |
| **Interceptors** |
| auth.interceptor runs | ✅ Attaches JWT | ⏭️ Early return |
| api-session.interceptor runs | ✅ Attaches x-session-id | ⏭️ Early return (cookies only) |
| **API Behavior** |
| Backend sees JWT | ✅ Yes | ❌ No |
| Backend sees cookies | ✅ Yes | ✅ Yes |
| Backend auth via | JWT OR cookies | Cookies only |
| **Bootstrap Flow** |
| Triggered on 401 | ✅ Yes | ✅ Yes |
| Sets session cookie | ✅ Yes | ✅ Yes |
| Fetches JWT | ✅ Yes | ⚠️ Maybe (ignored) |
| **SSE** |
| Uses withCredentials | ✅ Yes | ✅ Yes |
| Sends cookies | ✅ Yes | ✅ Yes |
| Works correctly | ✅ Yes | ✅ Yes |

---

## Quick Switch Guide

### From Dual → Cookie-Only

```bash
# 1. Edit environment.ts
# Change: authMode: 'dual' → authMode: 'cookie_only'

# 2. Restart server
npm start

# 3. Clear browser cookies (optional, for clean test)
# DevTools > Application > Cookies > Delete all

# 4. Make any API request

# 5. Verify in Network tab:
# - NO Authorization header
# - NO x-session-id header
# - YES Cookie header
```

### From Cookie-Only → Dual

```bash
# 1. Edit environment.ts
# Change: authMode: 'cookie_only' → authMode: 'dual'

# 2. Restart server
npm start

# 3. Make any API request

# 4. Verify in Network tab:
# - YES Authorization header
# - YES x-session-id header
# - YES Cookie header
```

---

## Visual Decision Tree

```
┌──────────────────────────────────┐
│  HTTP Request (API call)         │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│  authMode = ?                    │
└────┬─────────────────┬───────────┘
     │                 │
  'dual'         'cookie_only'
     │                 │
     ▼                 ▼
┌─────────┐       ┌────────────┐
│ Attach  │       │ Skip JWT   │
│ JWT     │       │ (early     │
│         │       │  return)   │
└────┬────┘       └─────┬──────┘
     │                  │
     ▼                  ▼
┌─────────┐       ┌────────────┐
│ Attach  │       │ Skip       │
│ x-sess  │       │ x-session  │
│         │       │ (cookies   │
│         │       │  only)     │
└────┬────┘       └─────┬──────┘
     │                  │
     └─────────┬────────┘
               │
               ▼
      ┌────────────────┐
      │ withCredentials│
      │ = true         │
      │ (always)       │
      └───────┬────────┘
              │
              ▼
      ┌────────────────┐
      │ Send to backend│
      └────────────────┘
```

---

## Summary

| Aspect | Dual | Cookie-Only |
|--------|------|-------------|
| **What gets sent** | JWT + x-session-id + Cookie | Cookie only |
| **JWT code** | Active | Inactive (preserved) |
| **localStorage** | Used | Ignored |
| **Bootstrap** | Works | Works |
| **SSE** | Works | Works |
| **Switch method** | Edit env file + restart | Edit env file + restart |
| **Reversible** | Yes | Yes |
| **Breaking change** | No | No |

---

**Quick Test**:
1. Set `authMode: 'cookie_only'`
2. Restart server
3. Check Network tab
4. Should see ONLY Cookie header (no JWT, no x-session-id)

**Last Updated**: 2026-02-14
