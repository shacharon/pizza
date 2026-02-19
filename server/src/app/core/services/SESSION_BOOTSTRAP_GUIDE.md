# Session Bootstrap Implementation Guide

## Overview

This implementation adds **server-authoritative session bootstrap** in parallel to the existing JWT authentication flow.

**No breaking changes** - JWT flow remains intact.

---

## What Was Added

### 1. Session Bootstrap Service

**File**: `session-bootstrap.service.ts`

Handles session initialization with the backend:
- POST `/api/v1/auth/bootstrap`
- Receives HttpOnly session cookie
- No localStorage usage
- Prevents concurrent bootstrap calls

**Usage**:
```typescript
import { SessionBootstrapService } from '@core/services/session-bootstrap.service';

constructor(private bootstrap: SessionBootstrapService) {}

async initSession() {
  try {
    await this.bootstrap.bootstrap();
    console.log('Session ready');
  } catch (error) {
    if (error.message === 'REDIS_UNAVAILABLE') {
      console.error('Session service temporarily unavailable');
    }
  }
}
```

**Logging**:
- `bootstrap_triggered` - when bootstrap starts
- `bootstrap_success` - when session created
- `bootstrap_already_in_progress` - when concurrent call detected
- `bootstrap_failed_redis_unavailable` - when Redis is down (503)
- `bootstrap_failed` - generic error

---

### 2. HTTP 401 Retry Service

**File**: `http-401-retry.service.ts`

Wraps `HttpClient` to auto-retry on 401:
1. Make API request
2. If 401 → bootstrap() → retry once
3. If still 401 → propagate error

**Usage** (optional - for services that want explicit retry):
```typescript
import { Http401RetryService } from '@core/services/http-401-retry.service';

constructor(private httpRetry: Http401RetryService) {}

search(query: string) {
  // Automatically retries on 401 with bootstrap
  return this.httpRetry.post<SearchResponse>(
    '/api/v1/search',
    { query }
  );
}
```

**Logging**:
- `bootstrap_retry` - when 401 detected and retrying
- `bootstrap_retry_complete` - after bootstrap, before retry
- `401_after_retry` - if retry also returns 401

**Note**: This service is optional. The global interceptor already adds `withCredentials: true` to all requests.

---

### 3. Global withCredentials

**Modified File**: `shared/http/api-session.interceptor.ts`

**What Changed**:
- Added `withCredentials: true` to ALL API requests
- Ensures HttpOnly cookies are sent automatically

**Impact**:
- All `HttpClient` calls now send cookies
- No code changes needed in existing services
- JWT Authorization header still sent (parallel auth)

---

## What Was NOT Changed

✅ **JWT flow intact** - all existing auth logic preserved
✅ **auth.interceptor** - still attaches JWT Bearer tokens
✅ **AuthService** - still manages localStorage JWT
✅ **No breaking changes** - both auth methods work in parallel

---

## Testing the Implementation

### 1. Test Bootstrap Endpoint

```typescript
// In any component
constructor(private bootstrap: SessionBootstrapService) {}

ngOnInit() {
  this.testBootstrap();
}

async testBootstrap() {
  console.log('Testing bootstrap...');
  await this.bootstrap.bootstrap();
  console.log('Bootstrap complete - check browser cookies for session_id');
}
```

**Expected Console Output**:
```
[SessionBootstrap] bootstrap_triggered { timestamp: "..." }
[SessionBootstrap] bootstrap_success { sessionIdPreview: "sess_...", timestamp: "..." }
```

**Expected in DevTools > Application > Cookies**:
- Cookie name: `session_id`
- HttpOnly: ✅
- Secure: ✅ (in production)
- SameSite: `Lax` or `Strict`

---

### 2. Test 401 Retry

Scenario: JWT expired or missing

1. Clear localStorage JWT: `localStorage.removeItem('g2e_jwt')`
2. Make an API call (e.g., search)
3. Expect:
   - First request fails with 401
   - Bootstrap called automatically
   - Request retried
   - Success (if endpoint supports session auth)

**Console Output**:
```
[Http401Retry] bootstrap_retry { url: "/api/v1/search", method: "POST", attempt: 1 }
[SessionBootstrap] bootstrap_triggered { timestamp: "..." }
[SessionBootstrap] bootstrap_success { ... }
[Http401Retry] bootstrap_retry_complete - retrying request
```

---

### 3. Test Redis Unavailable (503)

Scenario: Backend Redis is down

1. Stop Redis server (if testing locally)
2. Call `bootstrap.bootstrap()`
3. Expect:
   - 503 response
   - `REDIS_UNAVAILABLE` error thrown

**Console Output**:
```
[SessionBootstrap] bootstrap_triggered { timestamp: "..." }
[SessionBootstrap] bootstrap_failed_redis_unavailable { status: 503, error: "Redis connection failed..." }
Error: REDIS_UNAVAILABLE
```

---

## Migration Path

### Current State (JWT Only)
```
Client -> JWT in localStorage -> Authorization header -> Backend
```

### New State (Parallel Auth)
```
Client -> JWT in localStorage -> Authorization header -> Backend
       -> Session cookie -> Cookie header -> Backend
```

### Future State (Session Only - when ready)
```
Client -> Session cookie -> Cookie header -> Backend
```

**Next Steps** (NOT in this implementation):
1. Gradually migrate endpoints from JWT to session-only
2. Remove JWT generation/validation
3. Remove localStorage usage
4. Remove auth.interceptor

---

## File Summary

### Added Files
- `core/services/session-bootstrap.service.ts` (117 lines)
- `core/services/session-bootstrap.service.spec.ts` (118 lines)
- `core/services/http-401-retry.service.ts` (119 lines)
- `core/services/SESSION_BOOTSTRAP_GUIDE.md` (this file)

### Modified Files
- `shared/http/api-session.interceptor.ts` (+2 lines)
  - Added `withCredentials: true`
  - Added comment about cookie auth

### Unchanged Files (JWT intact)
- ✅ `core/auth/auth.service.ts` - JWT management
- ✅ `core/interceptors/auth.interceptor.ts` - JWT attachment
- ✅ `core/services/auth-api.service.ts` - JWT endpoints
- ✅ localStorage usage preserved

---

## Logs Reference

All logs use `console.debug` or `console.error`:

| Log Message | Service | When | Level |
|------------|---------|------|-------|
| `bootstrap_triggered` | SessionBootstrap | Bootstrap starts | debug |
| `bootstrap_success` | SessionBootstrap | Session created | debug |
| `bootstrap_already_in_progress` | SessionBootstrap | Concurrent call | debug |
| `bootstrap_failed_redis_unavailable` | SessionBootstrap | Redis down (503) | error |
| `bootstrap_failed` | SessionBootstrap | Generic error | error |
| `bootstrap_retry` | Http401Retry | 401 detected | debug |
| `bootstrap_retry_complete` | Http401Retry | Before retry | debug |
| `401_after_retry` | Http401Retry | Retry also 401 | debug |

---

## Questions?

**Q: Do I need to change my existing API calls?**  
A: No. `withCredentials: true` is added globally via interceptor.

**Q: Should I use `Http401RetryService` everywhere?**  
A: Optional. It's there if you want explicit retry control. The interceptor already handles credentials.

**Q: When will JWT be removed?**  
A: Later phase. This implementation keeps both auth methods working.

**Q: What if Redis is down?**  
A: Bootstrap will fail with `REDIS_UNAVAILABLE`. JWT auth will still work as fallback.

---

## Success Criteria

✅ Bootstrap endpoint creates session  
✅ HttpOnly cookie stored in browser  
✅ All API calls send cookies (`withCredentials: true`)  
✅ 401 triggers bootstrap + retry  
✅ JWT flow unchanged  
✅ No breaking changes  
✅ Console logging for debugging  

---

**Implementation Complete** ✨
