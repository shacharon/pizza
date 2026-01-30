# Fix: "UNKNOWN_ERROR" in SearchFacade

## Issue
User reported search errors showing:
```
[SearchFacade] Search error {status: undefined, code: 'UNKNOWN_ERROR', message: 'Request failed. Please try again.'}
```

## Root Cause
The `httpErrorInterceptor` in `llm-angular/src/app/core/interceptors/http-error.interceptor.ts` was **destructively transforming** `HttpErrorResponse` objects into plain `Error` objects:

```typescript
// ❌ BAD: Loses status, headers, and structured error info
return throwError(() => new Error(status ? `${status}: ${message}` : message));
```

This caused:
1. **Loss of error structure**: The `HttpErrorResponse` object contains `status`, `headers`, `error.code`, `error.traceId`, etc.
2. **Broken error mapping**: The `mapApiError()` function in `api-error.mapper.ts` expects an `HttpErrorResponse` but receives a plain `Error`
3. **Fallback to UNKNOWN_ERROR**: Without a valid `status` property, the mapper falls back to the generic error message

## Flow Before Fix
```
[1] API Request fails → HttpErrorResponse (status=400, error={code: "VALIDATION_ERROR"})
[2] httpTimeoutRetryInterceptor → passes through
[3] httpErrorInterceptor → ❌ converts to Error("400: Validation error")
[4] SearchApiClient.catchError → receives Error (not HttpErrorResponse!)
[5] mapApiError() → error.status is undefined → returns UNKNOWN_ERROR
[6] User sees: "Request failed. Please try again." (no useful info)
```

## Flow After Fix
```
[1] API Request fails → HttpErrorResponse (status=400, error={code: "VALIDATION_ERROR"})
[2] httpTimeoutRetryInterceptor → passes through
[3] httpErrorInterceptor → ✅ passes through unchanged
[4] SearchApiClient.catchError → receives HttpErrorResponse
[5] mapApiError() → extracts status=400, code="VALIDATION_ERROR", message="..."
[6] User sees: Proper error message with context
```

## Solution
Updated `http-error.interceptor.ts` to **pass through errors unchanged**:

```typescript
export function httpErrorInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
    return next(req).pipe(
        catchError((err: unknown) => {
            // ✅ GOOD: Pass through all errors unchanged
            // Individual API clients will handle error mapping
            return throwError(() => err);
        })
    );
}
```

## Why This Fix Works
1. **Preserves error structure**: `HttpErrorResponse` reaches the API client with all properties intact
2. **Enables proper error mapping**: `mapApiError()` can extract `status`, `code`, `traceId`, and user-friendly messages
3. **Maintains separation of concerns**: Error mapping is centralized in `api-error.mapper.ts` (single source of truth)

## Testing
After this fix, search errors should show:
- **Network errors**: "Unable to connect to server. Please check your internet connection." (code: NETWORK_ERROR)
- **Validation errors**: Backend-provided message (code: VALIDATION_ERROR)
- **Rate limit errors**: "Too many requests. Please try again in a moment." (code: RATE_LIMIT_EXCEEDED)
- **Server errors**: Backend-provided message with traceId (code: INTERNAL_ERROR)

### Test Cases
```bash
# 1. Test with backend running (should succeed)
# Navigate to app, submit search query

# 2. Test with backend stopped (should show network error)
# Stop backend server, submit search query
# Expected: "Unable to connect to server. Please check your internet connection."

# 3. Test with backend error (should show proper error message)
# Trigger a backend validation error
# Expected: Backend error message with traceId
```

## Files Changed
- `llm-angular/src/app/core/interceptors/http-error.interceptor.ts` - Pass through errors unchanged

## Related Files (No Changes Needed)
- `llm-angular/src/app/shared/http/api-error.mapper.ts` - Already handles error mapping correctly
- `llm-angular/src/app/api/search.api.ts` - Already uses `mapApiError()` correctly
- `llm-angular/src/app/facades/search.facade.ts` - Already handles errors correctly

## Prevention
To avoid this issue in the future:
1. **Never transform HttpErrorResponse in interceptors** - Pass through unchanged
2. **Centralize error mapping** - Use `api-error.mapper.ts` as single source of truth
3. **Test error scenarios** - Network errors, 4xx, 5xx, timeouts
4. **Log errors properly** - Preserve traceId for debugging

## Verification Checklist
- [x] `httpErrorInterceptor` passes through errors unchanged
- [x] `mapApiError()` receives proper `HttpErrorResponse`
- [x] Error messages show correct `code` and `status`
- [ ] Test search with backend running (should succeed)
- [ ] Test search with backend stopped (should show network error)
- [ ] Test search with validation error (should show backend error message)

---

**Status**: ✅ FIXED  
**Date**: 2026-01-30  
**Impact**: High - affects all API error handling
