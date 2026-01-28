# WebSocket 401 JWT Hardening Fix

## Summary

Fixed WebSocket authentication issues after JWT hardening by ensuring ticket requests include Authorization Bearer headers and implementing proper token refresh on 401 errors.

## Changes Made

### 1. Updated `auth-api.service.ts` (Angular)

**File**: `llm-angular/src/app/core/services/auth-api.service.ts`

#### Key Improvements:

- **Explicit JWT Fetch**: `requestWSTicket()` now explicitly awaits `authService.getToken()` before making the request
- **Explicit Headers**: Manually adds both `Authorization: Bearer <token>` and `X-Session-Id` headers
- **401 Handling**: On 401 response:
  1. Clears the stale token using `authService.clearToken()`
  2. Fetches a fresh token
  3. Retries the ticket request ONCE
  4. If retry fails, propagates the error
- **Dev Logging**: Logs ticket request attempts and 401 retry logic (dev only, no token values logged)
- **Security**: No insecure fallbacks or auth bypasses

#### Code Structure:

```typescript
requestWSTicket(): Observable<WSTicketResponse> {
  return from(this.authService.getToken()).pipe(
    switchMap(token => {
      const sessionId = this.getSessionId();
      
      // Dev logging (no token value)
      if (!environment.production) {
        console.log('[WS-Ticket] Requesting ticket', {
          hasAuthorization: !!token,
          hasSessionId: !!sessionId
        });
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`,
        'X-Session-Id': sessionId
      });

      return this.http.post<WSTicketResponse>(
        `${this.baseUrl}/auth/ws-ticket`,
        {},
        { headers }
      );
    }),
    catchError((error: unknown) => {
      // Handle 401: clear stale token and retry ONCE
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.authService.clearToken();
        
        // Retry once with fresh token
        return from(this.authService.getToken()).pipe(
          switchMap(newToken => {
            // ... make request with fresh token
          }),
          catchError(retryError => throwError(() => retryError))
        );
      }
      return throwError(() => error);
    })
  );
}
```

### 2. Created Comprehensive Unit Tests

**File**: `llm-angular/src/app/core/services/auth-api.service.spec.ts`

#### Test Coverage:

✅ **Authorization Header Verification**
- Ensures `Authorization: Bearer <token>` header is present in ticket request
- Verifies token is fetched before making the request

✅ **Session ID Header Verification**
- Ensures `X-Session-Id` header is present
- Handles missing session ID gracefully (sends empty string)

✅ **401 Retry Logic**
- Verifies token is cleared on 401 response
- Confirms request is retried with fresh token
- Validates only ONE retry attempt is made

✅ **401 Retry Failure**
- Confirms error is propagated if retry also returns 401
- Verifies `clearToken()` is called exactly once
- Checks `getToken()` is called twice (initial + retry)

✅ **Non-401 Errors**
- Verifies no retry occurs for other error codes (e.g., 503)
- Confirms token is not cleared for non-auth errors

✅ **Async Token Resolution**
- Tests that ticket request waits for async token fetch

✅ **Missing Session ID**
- Handles localStorage failures gracefully

#### Test Results:

```
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
Time:        6.164 s
```

### 3. Existing Architecture Preserved

**File**: `llm-angular/src/app/core/services/ws/ws-connection.ts`

- Already calls `await this.ticketProvider.ensureAuth()` before requesting ticket (line 62)
- No changes needed - properly structured to use the updated `requestWSTicket()` method

**File**: `llm-angular/src/app/core/services/ws-client.service.ts`

- Ticket provider adapter properly bridges Angular DI to plain TS modules
- `ensureAuth` callback uses `authService.getToken()` (line 62)
- No changes needed

## Security Guarantees

1. ✅ JWT token MUST be present before ticket request
2. ✅ `Authorization: Bearer <JWT>` header is explicitly included
3. ✅ `X-Session-Id` header is explicitly included
4. ✅ Stale/invalid JWT triggers token clear + single retry
5. ✅ No insecure fallbacks or auth bypass mechanisms
6. ✅ Dev logs do NOT expose token values
7. ✅ Backward compatibility maintained for API/WS contracts

## Dev Logging

Logging is enabled only in development (`!environment.production`):

```
[WS-Ticket] Requesting ticket { hasAuthorization: true, hasSessionId: true }
[WS-Ticket] 401 received, clearing token and retrying once { errorCode: 'INVALID_TOKEN' }
[WS-Ticket] Retrying with fresh token { hasAuthorization: true, hasSessionId: true }
```

**Note**: Token values are NEVER logged, only boolean presence indicators.

## Backward Compatibility

- ✅ Public API unchanged (`requestWSTicket()` signature preserved)
- ✅ WS client service interface unchanged
- ✅ Ticket provider interface unchanged
- ✅ Server-side API contract unchanged (`/api/v1/auth/ws-ticket`)

## Testing Instructions

### Unit Tests:

```bash
cd llm-angular
npm test -- src/app/core/services/auth-api.service.spec.ts
```

### Manual Testing:

1. **Valid JWT Flow**:
   - Open app
   - Verify WS connects successfully
   - Check dev console for: `[WS-Ticket] Requesting ticket { hasAuthorization: true, hasSessionId: true }`

2. **Stale JWT Flow**:
   - Clear browser localStorage (keep session but remove JWT)
   - Trigger WS connection
   - Verify 401 triggers token refresh
   - Check dev console for: `[WS-Ticket] 401 received, clearing token and retrying once`
   - Verify WS connects successfully on retry

3. **Invalid JWT Signature Flow**:
   - Manually corrupt JWT in localStorage
   - Trigger WS connection
   - Verify 401 triggers token clear + retry
   - Verify new valid JWT is fetched and used

## Files Changed

1. `llm-angular/src/app/core/services/auth-api.service.ts` - Updated ticket request logic
2. `llm-angular/src/app/core/services/auth-api.service.spec.ts` - Created comprehensive tests

## Files Verified (No Changes Needed)

1. `llm-angular/src/app/core/services/ws/ws-connection.ts` - Already calls ensureAuth
2. `llm-angular/src/app/core/services/ws-client.service.ts` - Adapter properly configured
3. `llm-angular/src/app/core/auth/auth.service.ts` - Token management working correctly

## Next Steps

1. ✅ Implementation complete
2. ✅ Unit tests passing (7/7)
3. ✅ Linter checks passing
4. 🔲 Manual testing in dev environment
5. 🔲 QA validation in staging
6. 🔲 Production deployment

---

**Completed**: 2026-01-28
**By**: AI Assistant
**Status**: ✅ Ready for review
