# Frontend API v1 — Quick Reference Guide

**Quick lookup for developers working with the new API structure.**

---

## TL;DR

```typescript
// ✅ DO: Use centralized endpoints
import { ENDPOINTS } from '../shared/api/api.config';
this.http.post(ENDPOINTS.SEARCH, request);

// ❌ DON'T: Hardcode URLs
this.http.post('/api/search', request);
```

```typescript
// ✅ DO: Use standardized error handling
import { mapApiError, logApiError, type ApiErrorView } from '../shared/http/api-error.mapper';

catchError((error: HttpErrorResponse) => {
  const apiError: ApiErrorView = mapApiError(error);
  logApiError('MyService.method', apiError);
  return throwError(() => apiError);
})
```

```typescript
// ✅ DO: Let interceptor handle session
// Headers automatically include: x-session-id: sess_<uuid>
this.http.post(ENDPOINTS.CHAT, request);

// ❌ DON'T: Manually add session header
const headers = new HttpHeaders({ 'x-session-id': sessionId });
```

---

## Available Endpoints

```typescript
import { ENDPOINTS } from '@app/shared/api/api.config';

// Search
ENDPOINTS.SEARCH                    // POST /api/v1/search
ENDPOINTS.SEARCH_STATS              // GET  /api/v1/search/stats

// Analytics
ENDPOINTS.ANALYTICS_EVENTS          // POST /api/v1/analytics/events
ENDPOINTS.ANALYTICS_STATS           // GET  /api/v1/analytics/stats

// Dialogue
ENDPOINTS.DIALOGUE                  // POST   /api/v1/dialogue
ENDPOINTS.DIALOGUE_SESSION(id)      // DELETE /api/v1/dialogue/session/:id
ENDPOINTS.DIALOGUE_STATS            // GET    /api/v1/dialogue/stats

// Chat & Places
ENDPOINTS.CHAT                      // POST /api/v1/chat
ENDPOINTS.PLACES_SEARCH             // POST /api/v1/places/search

// Future/Placeholder
ENDPOINTS.SESSION                   // POST /api/v1/session
ENDPOINTS.SESSION_BY_ID(id)         // GET  /api/v1/session/:id
ENDPOINTS.FLAGS                     // GET  /api/v1/flags
ENDPOINTS.ACTIONS                   // GET  /api/v1/actions
ENDPOINTS.ACTIONS_BY_ID(id)         // GET  /api/v1/actions/:id
```

---

## Error Handling Pattern

```typescript
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ENDPOINTS } from '@app/shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '@app/shared/http/api-error.mapper';

@Injectable({ providedIn: 'root' })
export class MyService {
  constructor(private http: HttpClient) {}

  myMethod(request: any): Observable<any> {
    return this.http.post(ENDPOINTS.SEARCH, request).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('MyService.myMethod', apiError);
        return throwError(() => apiError);
      })
    );
  }
}
```

---

## ApiErrorView Interface

```typescript
interface ApiErrorView {
  message: string;      // User-safe message
  code?: string;        // Error code (NETWORK_ERROR, VALIDATION_ERROR, etc.)
  traceId?: string;     // Backend correlation ID for debugging
  status?: number;      // HTTP status code
}
```

**Example Error:**
```javascript
{
  message: "Service temporarily unavailable",
  code: "UPSTREAM_ERROR",
  traceId: "req-a1b2c3d4-e5f6-7890",
  status: 503
}
```

---

## Error Code Reference

| Code | Retryable | Meaning |
|------|-----------|---------|
| `NETWORK_ERROR` | ✅ Yes | Connection failed, user offline |
| `VALIDATION_ERROR` | ❌ No | Invalid request data |
| `UPSTREAM_ERROR` | ✅ Yes | External API failure |
| `INTERNAL_ERROR` | ✅ Yes | Backend server error |
| `TIMEOUT` | ✅ Yes | Request timed out |
| `UNKNOWN_ERROR` | ❌ No | Unclassified error |

**Check Retryability:**
```typescript
import { isRetryableError } from '@app/shared/http/api-error.mapper';

if (isRetryableError(apiError)) {
  // Show "Retry" button
} else {
  // Show "Contact Support" button
}
```

---

## Non-Blocking Analytics Pattern

```typescript
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

track(event: string, data: any): void {
  this.http.post(ENDPOINTS.ANALYTICS_EVENTS, { event, data }).pipe(
    catchError((error: HttpErrorResponse) => {
      const apiError = mapApiError(error);
      console.warn('[Analytics] Failed:', event, 'traceId:', apiError.traceId);
      return of(null); // ✅ Swallow error, don't block
    })
  ).subscribe(); // Fire-and-forget
}
```

---

## Session Header (Automatic)

**No action required.** Every API request automatically includes:

```http
x-session-id: sess_a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Storage:** `localStorage['api-session-id']`  
**Lifetime:** Browser session (persists across page reloads)  
**Format:** `sess_<uuid>` (41 characters)

**Manual Override (Rare):**
```typescript
// Only if you need a specific session ID
const headers = new HttpHeaders({ 'x-session-id': customSessionId });
this.http.post(ENDPOINTS.CHAT, request, { headers });
```

---

## Runtime API Base Override

**Local Development (Default):**
- No configuration needed
- Uses `/api/v1` and proxies to backend

**Staging/Production:**

Edit `index.html`:
```html
<script>
  window.__API_BASE_URL__ = 'https://api.piza.com/api/v1';
</script>
```

**Verify in Console:**
```
[API Config] ✅ Initialized: {
  base: "https://api.piza.com/api/v1",
  runtimeOverride: "https://api.piza.com/api/v1",
  endpointCount: 10
}
```

---

## Debugging

### Check API Base
```javascript
// Browser console
console.log(window.__API_BASE_URL__); // Override (if set)
```

### Check Session ID
```javascript
// Browser console
localStorage.getItem('api-session-id'); // sess_<uuid>
```

### Find TraceId in Error
```javascript
// Console output (automatic)
[ServiceName.method] API Error {
  message: "...",
  code: "...",
  traceId: "req-xxx",  // ← Copy this for backend correlation
  status: 503
}
```

### Correlate with Backend
```bash
# CloudWatch Logs Insights
fields @timestamp, @message
| filter traceId = "req-xxx"
| sort @timestamp asc
```

---

## Common Mistakes

### ❌ Hardcoded URL
```typescript
// BAD
this.http.post('/api/search', request);
```
```typescript
// GOOD
this.http.post(ENDPOINTS.SEARCH, request);
```

### ❌ Manual Session Header
```typescript
// BAD
const headers = new HttpHeaders({ 'x-session-id': sessionId });
this.http.post(ENDPOINTS.CHAT, request, { headers });
```
```typescript
// GOOD
this.http.post(ENDPOINTS.CHAT, request); // Interceptor adds header
```

### ❌ Throwing Generic Error
```typescript
// BAD
catchError((error: HttpErrorResponse) => {
  return throwError(() => new Error(error.message));
})
```
```typescript
// GOOD
catchError((error: HttpErrorResponse) => {
  const apiError: ApiErrorView = mapApiError(error);
  logApiError('Service.method', apiError);
  return throwError(() => apiError);
})
```

### ❌ Blocking Analytics
```typescript
// BAD
this.http.post(ENDPOINTS.ANALYTICS_EVENTS, data).pipe(
  catchError(error => throwError(() => error)) // Blocks caller!
).subscribe();
```
```typescript
// GOOD
this.http.post(ENDPOINTS.ANALYTICS_EVENTS, data).pipe(
  catchError(error => {
    console.warn('[Analytics] Failed');
    return of(null); // Non-blocking
  })
).subscribe();
```

### ❌ No Error Logging
```typescript
// BAD
catchError((error: HttpErrorResponse) => {
  const apiError = mapApiError(error);
  return throwError(() => apiError); // Missing traceId in logs!
})
```
```typescript
// GOOD
catchError((error: HttpErrorResponse) => {
  const apiError = mapApiError(error);
  logApiError('Service.method', apiError); // ← Log with traceId
  return throwError(() => apiError);
})
```

---

## Testing

### Unit Test with HttpTestingController

```typescript
import { HttpTestingController } from '@angular/common/http/testing';
import { ENDPOINTS } from '@app/shared/api/api.config';

it('should call search endpoint', () => {
  const request = { query: 'pizza' };
  
  service.search(request).subscribe();
  
  // Use ENDPOINTS constant (not hardcoded URL)
  const req = httpMock.expectOne(ENDPOINTS.SEARCH);
  expect(req.request.method).toBe('POST');
  expect(req.request.body).toEqual(request);
  
  req.flush({ results: [] });
});
```

### Check Session Header in Tests

```typescript
it('should include session header', () => {
  service.search(request).subscribe();
  
  const req = httpMock.expectOne(ENDPOINTS.SEARCH);
  expect(req.request.headers.has('x-session-id')).toBe(true);
  expect(req.request.headers.get('x-session-id')).toMatch(/^sess_/);
});
```

---

## Migration Checklist (New Service)

When creating a new API service:

- ✅ Import `ENDPOINTS` from `@app/shared/api/api.config`
- ✅ Import `mapApiError`, `logApiError`, `ApiErrorView` from error mapper
- ✅ Use `ENDPOINTS.*` constants (not hardcoded URLs)
- ✅ Add `catchError` with `mapApiError()` and `logApiError()`
- ✅ Throw `ApiErrorView` (not generic `Error`)
- ✅ Do NOT manually add `x-session-id` header
- ✅ For analytics: use non-blocking error handling (`of(null)`)
- ✅ Write tests using `ENDPOINTS` constants

---

## Full Example: New Service

```typescript
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ENDPOINTS } from '../shared/api/api.config';
import { mapApiError, logApiError, type ApiErrorView } from '../shared/http/api-error.mapper';

export interface MyRequest {
  query: string;
}

export interface MyResponse {
  results: any[];
}

@Injectable({ providedIn: 'root' })
export class MyApiService {
  constructor(private http: HttpClient) {}

  /**
   * Search for items
   * Note: x-session-id is automatically added by apiSessionInterceptor
   * 
   * @throws ApiErrorView on failure
   */
  search(request: MyRequest): Observable<MyResponse> {
    return this.http.post<MyResponse>(ENDPOINTS.SEARCH, request).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('MyApiService.search', apiError);
        return throwError(() => apiError);
      })
    );
  }

  /**
   * Get statistics
   * @throws ApiErrorView on failure
   */
  getStats(): Observable<any> {
    return this.http.get(ENDPOINTS.SEARCH_STATS).pipe(
      catchError((error: HttpErrorResponse) => {
        const apiError: ApiErrorView = mapApiError(error);
        logApiError('MyApiService.getStats', apiError);
        return throwError(() => apiError);
      })
    );
  }
}
```

---

## Need More Details?

See full documentation: `llm-angular/docs/API_V1_MIGRATION.md`

---

**Last Updated:** January 2, 2025
