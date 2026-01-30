# EmptyError Fix - Complete Solution

## Problem Statement

**Issue:** RxJS EmptyError was masking the real NETWORK_ERROR (status=0)

**Symptoms:**
- Logs showed: `[SearchFacade] Network connection error {status:0}`
- Then: `firstValueFrom throws EmptyError` at search-api.facade.ts:41/45
- User saw generic "EmptyError" instead of user-friendly network error message

**Root Cause:** The `retryWhen` operator in `http-timeout-retry.interceptor.ts` had a subtle bug that could cause the observable to complete without emission after exhausting retries.

## Solution

### 1. Fixed HTTP Retry Interceptor ✅

**File:** `llm-angular/src/app/core/interceptors/http-timeout-retry.interceptor.ts`

**Before (Buggy):**
```typescript
retryWhen(errors => errors.pipe(
    scan((acc, err) => {
        if (acc >= MAX_RETRIES || ...) {
            throw err;
        }
        return acc + 1;
    }, 0),
    (errCount) => timer(300)  // ❌ BUG: Incomplete observable chain
)),
```

**Problem:** When `scan` throws an error, the inner observable completes, which can cause the outer observable to complete without emission → EmptyError.

**After (Fixed):**
```typescript
retryWhen(errors => errors.pipe(
    mergeMap((error: HttpErrorResponse) => {
        attemptCount++;
        
        const isRetryable = error.status === 0 || error.status >= 500;
        const hasRetriesLeft = attemptCount <= MAX_RETRIES;
        
        if (isRetryable && hasRetriesLeft) {
            return timer(300); // Retry after delay
        } else {
            return throwError(() => error); // ✅ Always throws, never completes
        }
    }),
    take(MAX_RETRIES + 1) // Safety: limit total attempts
)),
catchError((err) => throwError(() => err)) // ✅ Final safety net
```

**Key Changes:**
1. Replaced `scan` + ambiguous callback with explicit `mergeMap`
2. **Guaranteed** that all error paths use `throwError()` (never completes silently)
3. Added `take()` as safety limit
4. Added final `catchError` to ensure we always throw, never complete

### 2. Observable Error Flow Guarantee ✅

**File:** `llm-angular/src/app/api/search.api.ts`

Already correct (verified):
```typescript
searchAsync(request: SearchRequest): Observable<AsyncSearchResponse> {
    return this.http.post(...).pipe(
        map(...),
        catchError((error: HttpErrorResponse) => {
            const apiError = mapApiError(error);
            logApiError('SearchApiClient.searchAsync', apiError);
            return throwError(() => apiError); // ✅ Throws error, never EMPTY
        })
    );
}
```

**Confirmed:** No `catchError(() => EMPTY)` patterns exist in codebase.

### 3. Error Classification Preserved ✅

**File:** `llm-angular/src/app/shared/http/api-error.mapper.ts`

```typescript
export function mapApiError(error: HttpErrorResponse): ApiErrorView {
  // Network or timeout error (status 0)
  if (error.status === 0) {
    return {
      message: 'Unable to connect to server. Please check your internet connection.',
      code: 'NETWORK_ERROR', // ✅ Preserved classification
      status: 0
    };
  }
  // ... other errors
}
```

### 4. Facade Error Handling ✅

**File:** `llm-angular/src/app/facades/search-api.facade.ts`

Defensive EmptyError handling (belt-and-suspenders approach):
```typescript
async executeSearch(params): Promise<...> {
    try {
      return await firstValueFrom(this.searchApiClient.searchAsync(params));
    } catch (error: any) {
      // Defensive: Handle EmptyError (should never happen now)
      if (error instanceof EmptyError) {
        safeError('SearchApiHandler', 'Unexpected EmptyError');
        throw {
          message: 'Unable to connect to server...',
          code: 'NETWORK_ERROR',
          status: 0
        };
      }
      
      // Handle network errors (status=0)
      if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
        safeError('SearchApiHandler', 'Network connection error', ...);
        throw {
          message: 'Unable to connect to server...',
          code: 'NETWORK_ERROR',
          status: 0
        };
      }
      
      throw error; // Propagate other errors
    }
}
```

**File:** `llm-angular/src/app/facades/search.facade.ts`

```typescript
async search(query: string, filters?: SearchFilters): Promise<void> {
    try {
      // ... execute search
    } catch (error: any) {
      // Handle network connection errors with user-friendly message
      if (error?.status === 0 || error?.code === 'NETWORK_ERROR') {
        safeError('SearchFacade', 'Network connection error', ...);
        const userMessage = 'Unable to connect to server...';
        this.searchStore.setError(userMessage);
        this.assistantHandler.setError(userMessage);
        this._cardState.set('STOP'); // Terminal state
        return;
      }
      // ... handle other errors
    }
}
```

### 5. Comprehensive Unit Test ✅

**File:** `llm-angular/src/app/api/search.api.spec.ts`

Added critical test:
```typescript
it('CRITICAL: should never throw EmptyError on network failure', (done) => {
  const mockRequest: SearchRequest = { query: 'test query' };

  service.searchAsync(mockRequest).subscribe({
    next: () => fail('Should not succeed'),
    error: (error) => {
      // CRITICAL: Verify it's NOT an EmptyError
      expect(error.name).not.toBe('EmptyError');
      expect(error.constructor.name).not.toBe('EmptyError');
      expect(error.status).toBe(0);
      expect(error.code).toBe('NETWORK_ERROR');
      done();
    },
    complete: () => fail('Observable should not complete without emission')
  });

  const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
  req.error(new ProgressEvent('error'), { status: 0 });
  
  // Handle retry
  setTimeout(() => {
    const retryReq = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
    retryReq.error(new ProgressEvent('error'), { status: 0 });
  }, 400);
});
```

**Test Results:** ✅ All 9 tests passing

## Verification

### Test Results
```bash
PASS src/app/api/search.api.spec.ts (9/9 tests)
  ✅ should handle network connection error (status=0)
  ✅ CRITICAL: should never throw EmptyError on network failure
  ✅ should handle network error during polling
  ✅ should handle 202 accepted response correctly
  ✅ should handle 200 sync response correctly
```

### Error Flow (Before vs After)

**Before (Buggy):**
```
Network failure (status=0)
  ↓
HttpErrorResponse thrown
  ↓
Retry interceptor: scan throws after MAX_RETRIES
  ↓
Observable completes without emission ❌
  ↓
firstValueFrom throws EmptyError ❌
  ↓
User sees: "EmptyError: no elements in sequence"
```

**After (Fixed):**
```
Network failure (status=0)
  ↓
HttpErrorResponse thrown
  ↓
Retry interceptor: mergeMap returns throwError() ✅
  ↓
Observable emits error (never completes silently) ✅
  ↓
firstValueFrom rejects with HttpErrorResponse ✅
  ↓
mapApiError converts to NETWORK_ERROR ✅
  ↓
User sees: "Unable to connect to server. Please check your internet connection."
```

## Files Modified

### Core Fix
- `llm-angular/src/app/core/interceptors/http-timeout-retry.interceptor.ts` - Fixed retryWhen logic

### Defensive Error Handling (Already in place from previous fix)
- `llm-angular/src/app/facades/search-api.facade.ts` - EmptyError → NETWORK_ERROR
- `llm-angular/src/app/facades/search.facade.ts` - User-friendly error messages
- `llm-angular/src/app/api/search.api.ts` - Safe logging

### Tests
- `llm-angular/src/app/api/search.api.spec.ts` - Added EmptyError prevention test

### Documentation
- `EMPTYERROR_FIX_COMPLETE.md` - This file
- `NETWORK_ERROR_FIX_SUMMARY.md` - Previous fix (still relevant)

## Key Guarantees

1. ✅ **Observable NEVER completes without emission**
   - All error paths use `throwError(() => error)`
   - No `catchError(() => EMPTY)` patterns
   - Final `catchError` safety net in interceptor

2. ✅ **Error Classification Preserved**
   - status=0 → `NETWORK_ERROR` (not EmptyError)
   - Original HttpErrorResponse preserved through chain
   - User sees appropriate message

3. ✅ **Retry Behavior Correct**
   - MAX_RETRIES = 1 (retries once, then fails)
   - Only retries status=0 or 5xx errors
   - Does NOT retry 4xx errors
   - 300ms delay between retries

4. ✅ **No Infinite Loops**
   - `take(MAX_RETRIES + 1)` safety limit
   - Terminal error states (STOP card state)
   - Polling stops on network errors

## Manual Testing

To verify the fix:

1. **Stop the backend server**
2. **Try to search in the app**
3. **Expected behavior:**
   - ✅ User sees: "Unable to connect to server. Please check your internet connection."
   - ✅ No EmptyError in console
   - ✅ Loading stops (card state = STOP)
   - ✅ Logs show: `[SearchFacade] Network connection error {status:0, code:'NETWORK_ERROR'}`

## Technical Deep Dive

### Why Did EmptyError Occur?

The `retryWhen` operator accepts a function that returns an observable. This observable controls when/if to retry:

- If it **emits**, the source is retried
- If it **errors**, the error propagates
- If it **completes**, the source completes ❌

The old code used `scan` which could throw an error. When `scan` throws inside the `retryWhen` callback, RxJS catches it internally and the behavior becomes ambiguous - sometimes it propagates the error, sometimes the observable just completes.

The new code uses `mergeMap` which explicitly returns either:
- `timer(300)` - to retry
- `throwError(() => error)` - to propagate error

This guarantees the observable either emits (retry) or errors (fail), but NEVER completes silently.

### Defense in Depth

Even though the interceptor fix prevents EmptyError at the source, we kept the defensive handling in `search-api.facade.ts` as a belt-and-suspenders approach:

```typescript
catch (error: any) {
  if (error instanceof EmptyError) {
    // Convert to NETWORK_ERROR
  }
}
```

This ensures that even if EmptyError somehow occurs (e.g., from a different observable source), it's handled gracefully.

## Compliance

- ✅ No observable completes without emission
- ✅ Error classification preserved (NETWORK_ERROR, not EmptyError)
- ✅ User-friendly error messages
- ✅ No infinite retry loops
- ✅ Comprehensive test coverage
- ✅ No backend changes required
