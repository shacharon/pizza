# Cookie-Only Readiness Report

**Generated**: 2026-02-14  
**Scope**: Frontend codebase scan for AUTH_MODE="cookie_only" compatibility  
**Status**: 🟡 **MOSTLY READY** (2 breakers, 3 risky, rest safe)

---

## Executive Summary

The frontend is **mostly cookie-only ready**, but has **2 critical breakers** that will fail in cookie_only mode:

1. **AuthService constructor** tries to request session cookie on startup (requires JWT)
2. **AuthApiService methods** manually set Authorization headers (legacy methods)

**Impact**: Low (neither is actively used in cookie_only mode)  
**Fix**: Minimal guards behind AUTH_MODE flag

---

## A) BREAKERS (Will Break in Cookie_Only)

### 🔴 BREAKER #1: AuthService Constructor Tries to Request Session Cookie

**File**: `src/app/core/auth/auth.service.ts`  
**Lines**: 38-47

**Code**:
```typescript
constructor(private http: HttpClient) {
  // Load token from localStorage on startup
  const stored = this.loadTokenFromStorage();
  if (stored) {
    this.tokenCache.set(stored);
    // Request session cookie for SSE (async, non-blocking)
    this.requestSessionCookie(stored).catch((error: unknown) => {
      console.warn('[Auth] Failed to obtain session cookie on startup:', error);
    });
  }
}
```

**Why it breaks**:
- `requestSessionCookie()` calls `/auth/session` with `Authorization: Bearer <jwt>` header
- This endpoint is protected and may reject cookie-only requests
- In cookie_only mode, JWT should not be used

**When it breaks**:
- On app startup if `g2e_jwt` exists in localStorage

**Impact**: **HIGH** - blocks initial app load

**Expected error**:
- 401 Unauthorized (backend rejects JWT-required endpoint)
- OR no error but unnecessary call

---

### 🔴 BREAKER #2: AuthService.requestSessionCookie() Manually Sets Authorization

**File**: `src/app/core/auth/auth.service.ts`  
**Lines**: 143-160

**Code**:
```typescript
private requestSessionCookie(token: string): Promise<void> {
  try {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`  // ← Manual Authorization header
    });

    return firstValueFrom(
      this.http.post<{ ok: boolean; sessionId: string }>(
        `${ENDPOINTS.SESSION}`,
        {},
        { headers, withCredentials: true }
      )
    );
  } catch (error) {
    console.warn('[Auth] Failed to request session cookie', error);
    throw error;
  }
}
```

**Why it breaks**:
- Explicitly sets `Authorization` header (bypasses interceptor)
- `/auth/session` endpoint requires JWT auth
- Should not be called in cookie_only mode

**When it breaks**:
- Called from constructor on startup (if JWT exists)

**Impact**: **HIGH** - called on startup

---

## B) RISKY (Might Break)

### 🟡 RISKY #1: AuthApiService.requestSessionCookie() - Explicit JWT Header

**File**: `src/app/core/services/auth-api.service.ts`  
**Lines**: 54-64

**Code**:
```typescript
requestSessionCookie(token: string): Observable<{ ok: boolean; sessionId: string }> {
  const headers = new HttpHeaders({
    'Authorization': `Bearer ${token}`  // ← Explicit JWT
  });

  return this.http.post<{ ok: boolean; sessionId: string }>(
    `${this.baseUrl}/auth/session`,
    {},
    { headers, withCredentials: true }
  );
}
```

**Why risky**:
- Manually sets Authorization header
- Bypasses auth.interceptor (which would skip in cookie_only mode)
- Endpoint requires JWT

**When it breaks**:
- If called externally (not by AuthService)

**Likelihood**: **LOW** - only called by AuthService constructor

---

### 🟡 RISKY #2: AuthApiService.requestWSTicket() - Explicit JWT Header

**File**: `src/app/core/services/auth-api.service.ts`  
**Lines**: 82-106

**Code**:
```typescript
requestWSTicket(): Observable<WSTicketResponse> {
  return from(this.authService.getToken()).pipe(
    switchMap(token => this.requestTicketWithRetry(token, 0))
  );
}

private requestTicketWithRetry(token: string, attemptNumber: number): Observable<WSTicketResponse> {
  // ...
  const headers = new HttpHeaders({
    'Authorization': `Bearer ${token}`,  // ← Explicit JWT
    'X-Session-Id': sessionId
  });

  return this.http.post<WSTicketResponse>(
    `${this.baseUrl}/auth/ws-ticket`,
    {},
    { headers }
  );
}
```

**Why risky**:
- Explicitly fetches JWT via `authService.getToken()`
- Manually sets Authorization + X-Session-Id headers
- Bypasses interceptor logic
- `/auth/ws-ticket` endpoint requires JWT

**When it breaks**:
- If WebSocket auth is used (currently using SSE, so unused)

**Likelihood**: **VERY LOW** - WebSocket tickets not actively used

---

### 🟡 RISKY #3: AuthService localStorage Usage in Cookie_Only

**File**: `src/app/core/auth/auth.service.ts`  
**Lines**: 22-23, 104-109, 116-122

**Code**:
```typescript
const TOKEN_STORAGE_KEY = 'g2e_jwt';
const SESSION_STORAGE_KEY = 'api-session-id';

private loadTokenFromStorage(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);  // ← Reads g2e_jwt
  } catch (error) {
    return null;
  }
}

private saveTokenToStorage(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);  // ← Writes g2e_jwt
  } catch (error) {
    console.warn('[Auth] Failed to save token to localStorage', error);
  }
}
```

**Why risky**:
- Reads/writes `g2e_jwt` even in cookie_only mode
- JWT will exist in localStorage but should be ignored

**When it breaks**:
- Doesn't technically "break" (JWT is read but not sent)
- Could cause confusion during debugging

**Likelihood**: **LOW** - functional but misleading

---

## C) SAFE (Already Cookie-Only Compatible)

### ✅ SAFE #1: auth.interceptor - Conditionally Skips JWT

**File**: `src/app/core/interceptors/auth.interceptor.ts`  
**Lines**: 46-50

**Code**:
```typescript
// COOKIE_ONLY MODE: Skip JWT attachment entirely
if (environment.authMode === 'cookie_only') {
  console.debug('[Auth] AUTH_MODE=cookie_only - skipping JWT');
  return next(req);
}
```

**Why safe**: Already guards JWT logic behind AUTH_MODE check

---

### ✅ SAFE #2: api-session.interceptor - Conditionally Skips x-session-id

**File**: `src/app/shared/http/api-session.interceptor.ts`  
**Lines**: 71-77

**Code**:
```typescript
// COOKIE_ONLY MODE: Only set withCredentials, no x-session-id header
if (environment.authMode === 'cookie_only') {
  console.debug('[Session] AUTH_MODE=cookie_only - skipping x-session-id header');
  const cloned = req.clone({
    withCredentials: true // Still send cookies
  });
  return next(cloned);
}
```

**Why safe**: Already guards x-session-id logic behind AUTH_MODE check

---

### ✅ SAFE #3: SearchApiClient - Uses HttpClient (No Manual Headers)

**File**: `src/app/api/search.api.ts`  
**Lines**: 35-59

**Code**:
```typescript
searchAsync(request: SearchRequest): Observable<AsyncSearchResponse> {
  return this.http.post<AsyncSearchAccepted | SearchResponse>(
    `${ENDPOINTS.SEARCH}?mode=async`,
    request,
    { observe: 'response' }
  ).pipe(/* ... */);
}
```

**Why safe**: Uses HttpClient without manual headers, interceptors handle auth

---

### ✅ SAFE #4: AnalyticsService - Uses HttpClient (No Manual Headers)

**File**: `src/app/services/analytics.service.ts`  
**Lines**: 47-60

**Code**:
```typescript
this.http.post(ENDPOINTS.ANALYTICS_EVENTS, enriched).pipe(
  catchError((error: HttpErrorResponse) => {
    // NON-BLOCKING: Log but do not throw
    console.warn('[Analytics] Failed to send event:', event);
    return of(null);
  })
).subscribe();
```

**Why safe**: Uses HttpClient without manual headers, fire-and-forget

---

### ✅ SAFE #5: AssistantSseService - Already Uses Cookies

**File**: `src/app/core/services/assistant-sse.service.ts`  
**Lines**: 58-71

**Code**:
```typescript
connect(requestId: string): Observable<AssistantSseEvent> {
  return new Observable<AssistantSseEvent>(observer => {
    const url = `${this.apiBaseUrl}/stream/assistant/${requestId}`;
    
    // Create EventSource with credentials (sends session cookie)
    const eventSource = new EventSource(url, { withCredentials: true } as any);
    // ...
  });
}
```

**Why safe**: Already uses `withCredentials: true`, no JWT dependency

---

### ✅ SAFE #6: Http401RetryService - Calls Bootstrap on 401

**File**: `src/app/core/services/http-401-retry.service.ts`  
**Lines**: 97-109

**Code**:
```typescript
catchError((error: HttpErrorResponse) => {
  // Only retry on 401 and only once
  if (error.status === 401 && attemptCount === 1) {
    console.debug('[Http401Retry] bootstrap_retry', {/* ... */});
    
    // Bootstrap and retry
    return defer(async () => {
      await this.bootstrapService.bootstrap();
      console.debug('[Http401Retry] bootstrap_retry_complete - retrying request');
    }).pipe(switchMap(() => {/* retry */}));
  }
  return throwError(() => error);
})
```

**Why safe**: Already implements cookie-only bootstrap flow

---

### ✅ SAFE #7: SessionBootstrapService - Pure Cookie Flow

**File**: `src/app/core/services/session-bootstrap.service.ts`

**Why safe**: Designed for cookie-only mode, no JWT usage

---

## D) Minimal Patch Plan

### PATCH #1: Guard AuthService Constructor

**File**: `src/app/core/auth/auth.service.ts`  
**Lines**: 38-48

**Current Code**:
```typescript
constructor(private http: HttpClient) {
  // Load token from localStorage on startup
  const stored = this.loadTokenFromStorage();
  if (stored) {
    this.tokenCache.set(stored);
    // Request session cookie for SSE (async, non-blocking)
    this.requestSessionCookie(stored).catch((error: unknown) => {
      console.warn('[Auth] Failed to obtain session cookie on startup:', error);
    });
  }
}
```

**Fixed Code**:
```typescript
constructor(private http: HttpClient) {
  // Load token from localStorage on startup
  const stored = this.loadTokenFromStorage();
  if (stored) {
    this.tokenCache.set(stored);
    
    // DUAL MODE ONLY: Request session cookie for SSE
    // In cookie_only mode, bootstrap service handles session creation
    if (environment.authMode === 'dual') {
      this.requestSessionCookie(stored).catch((error: unknown) => {
        console.warn('[Auth] Failed to obtain session cookie on startup:', error);
      });
    }
  }
}
```

**Impact**: Prevents JWT-required call in cookie_only mode

---

### PATCH #2: Add Import for Environment

**File**: `src/app/core/auth/auth.service.ts`  
**Line**: 18

**Current Code**:
```typescript
import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ENDPOINTS } from '../../shared/api/api.config';
import { firstValueFrom } from 'rxjs';
```

**Fixed Code**:
```typescript
import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ENDPOINTS } from '../../shared/api/api.config';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';  // ← ADD THIS
```

**Impact**: Enables AUTH_MODE check in constructor

---

### PATCH #3: Optional - Guard requestWSTicket (Low Priority)

**File**: `src/app/core/services/auth-api.service.ts`  
**Lines**: 82-86

**Current Code**:
```typescript
requestWSTicket(): Observable<WSTicketResponse> {
  return from(this.authService.getToken()).pipe(
    switchMap(token => this.requestTicketWithRetry(token, 0))
  );
}
```

**Fixed Code** (optional, low priority):
```typescript
requestWSTicket(): Observable<WSTicketResponse> {
  // Cookie-only mode: WebSocket tickets not supported yet
  if (environment.authMode === 'cookie_only') {
    return throwError(() => new Error('WebSocket tickets not supported in cookie_only mode'));
  }
  
  return from(this.authService.getToken()).pipe(
    switchMap(token => this.requestTicketWithRetry(token, 0))
  );
}
```

**Impact**: Prevents unused WebSocket code from running (very low priority)

---

## E) Test Script

### Pre-Test Setup

```bash
# 1. Edit environment.ts
vim src/environments/environment.ts
# Change: authMode: 'cookie_only'

# 2. Restart dev server
npm start
```

---

### Test #1: Verify No JWT Headers Sent

**Steps**:
1. Open browser DevTools
2. Go to Network tab
3. Clear network log
4. Navigate to app (`http://localhost:4200`)
5. Make a search request

**Expected Network Headers**:
```http
GET /api/v1/search HTTP/1.1
Cookie: session=xyz...
(NO Authorization header)
(NO x-session-id header)
```

**Expected Console Logs**:
```
[Auth] AUTH_MODE=cookie_only - skipping JWT
[Session] AUTH_MODE=cookie_only - skipping x-session-id header
```

**Pass Criteria**:
- ✅ No `Authorization: Bearer` header
- ✅ No `x-session-id` header
- ✅ `Cookie` header present
- ✅ Console logs indicate cookie_only mode

---

### Test #2: Verify Bootstrap on 401

**Steps**:
1. Open browser console
2. Clear all cookies:
   ```javascript
   document.cookie.split(';').forEach(c => {
     document.cookie = c.trim().split('=')[0] + '=; Max-Age=0';
   });
   ```
3. Make a search request
4. Watch Network tab and Console

**Expected Flow**:
```
1. GET /api/v1/search
   → Response: 401 Unauthorized

2. POST /api/v1/auth/bootstrap
   → Response: 200 OK
   → Set-Cookie: session=xyz...

3. GET /api/v1/search (retry)
   → Request: Cookie: session=xyz...
   → Response: 200 OK
```

**Expected Console Logs**:
```
[Http401Retry] bootstrap_retry { url: "/api/v1/search", method: "POST", attempt: 1 }
[SessionBootstrap] bootstrap_triggered { timestamp: "..." }
[SessionBootstrap] bootstrap_success { sessionIdPreview: "sess_...", timestamp: "..." }
[Http401Retry] bootstrap_retry_complete - retrying request
```

**Pass Criteria**:
- ✅ First request returns 401
- ✅ Bootstrap called automatically
- ✅ Session cookie set
- ✅ Retry succeeds with cookie
- ✅ No JWT involved

---

### Test #3: Verify localStorage JWT Ignored

**Steps**:
1. Check localStorage has JWT:
   ```javascript
   localStorage.getItem('g2e_jwt')
   // Should return: "eyJhbGc..."
   ```
2. Make a search request
3. Check Network tab headers

**Expected**:
- localStorage contains `g2e_jwt`: ✅ (exists but ignored)
- Network request Authorization header: ❌ (not sent)
- Network request Cookie header: ✅ (sent)

**Pass Criteria**:
- ✅ JWT exists in localStorage
- ✅ JWT NOT sent in Authorization header
- ✅ Only cookies sent

---

### Test #4: Verify SSE Works

**Steps**:
1. Make a search request
2. Wait for SSE connection
3. Check Network tab for SSE request
4. Verify assistant messages appear

**Expected SSE Request Headers**:
```http
GET /api/v1/stream/assistant/req_abc123 HTTP/1.1
Cookie: session=xyz...
(NO Authorization header)
```

**Expected Behavior**:
- ✅ SSE connection established
- ✅ Only Cookie header sent
- ✅ Assistant messages stream correctly

---

### Test #5: Verify No Errors on Startup

**Steps**:
1. Hard refresh page (Ctrl+Shift+R)
2. Watch Console for errors
3. Check Network tab for failed requests

**Expected Console**:
```
[Auth] AUTH_MODE=cookie_only - skipping JWT
(NO warnings about requestSessionCookie)
(NO 401 errors on startup)
```

**Expected Network**:
- No failed /auth/session requests
- No 401 errors on initial load

**Pass Criteria**:
- ✅ No console errors
- ✅ No failed auth requests
- ✅ App loads successfully

---

## F) Backend Endpoints Status

### Protected Endpoints (Require Auth)

| Endpoint | JWT Support | Cookie Support | Cookie-Only Ready |
|----------|-------------|----------------|-------------------|
| `/api/v1/search` | ✅ | ✅ | ✅ |
| `/api/v1/analytics/events` | ✅ | ✅ | ✅ |
| `/api/v1/stream/assistant/:id` | ✅ | ✅ | ✅ |
| `/api/v1/auth/session` | ✅ Only | ❌ | ❌ (JWT required) |
| `/api/v1/auth/ws-ticket` | ✅ Only | ❌ | ❌ (JWT required) |

### Public Endpoints (No Auth)

| Endpoint | Cookie-Only Ready |
|----------|-------------------|
| `/api/v1/auth/token` | N/A (public) |
| `/api/v1/auth/bootstrap` | ✅ (cookie-only) |
| `/api/v1/photos/*` | ✅ (public) |

---

## G) Summary

### Breakers

| Issue | File | Impact | Fix Required |
|-------|------|--------|--------------|
| AuthService constructor calls requestSessionCookie | `auth.service.ts:38-48` | HIGH | Guard behind AUTH_MODE check |
| AuthService.requestSessionCookie() uses JWT | `auth.service.ts:143-160` | HIGH | Same (called by constructor) |

### Risky (Low Likelihood)

| Issue | File | Likelihood | Fix Priority |
|-------|------|-----------|--------------|
| AuthApiService.requestSessionCookie() | `auth-api.service.ts:54-64` | LOW | Optional |
| AuthApiService.requestWSTicket() | `auth-api.service.ts:82-106` | VERY LOW | Optional |
| localStorage JWT exists but ignored | `auth.service.ts:104-122` | LOW | No fix needed |

### Safe (No Changes Needed)

- ✅ auth.interceptor - Already guards JWT
- ✅ api-session.interceptor - Already guards x-session-id
- ✅ SearchApiClient - Uses HttpClient
- ✅ AnalyticsService - Uses HttpClient
- ✅ AssistantSseService - Already uses cookies
- ✅ Http401RetryService - Bootstrap flow ready
- ✅ SessionBootstrapService - Pure cookie flow

---

## H) Recommendation

**Status**: 🟡 **MOSTLY READY**

**Required Changes**: **2 minimal patches** (both in auth.service.ts)

**Testing**: Complete test script provided above

**Risk**: **LOW** - Patches are small and well-scoped

**Next Steps**:
1. Apply PATCH #1 and #2 (auth.service.ts constructor guard)
2. Run test script to verify
3. Monitor for any edge cases

---

**Confidence Level**: **HIGH** ✅

The frontend is very close to cookie-only ready. Only 2 small guards needed in AuthService constructor.

---

**Generated**: 2026-02-14  
**Total Files Scanned**: 19 services + 2 interceptors + 3 env files  
**Breakers Found**: 2  
**Risky Found**: 3  
**Safe Found**: 7+  
