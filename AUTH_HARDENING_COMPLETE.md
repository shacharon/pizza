# Auth Hardening Complete - JWT + Local Restart Fix

## Overview

Fixed WebSocket authentication to work properly with JWT hardening and local server restarts, eliminating 401 loops without weakening security.

## Changes Summary

### 🎯 Part 1: WS 401 JWT Hardening Fix

#### Frontend: Explicit JWT + 401 Retry

**File**: `llm-angular/src/app/core/services/auth-api.service.ts`

- ✅ Explicitly awaits JWT token before WS ticket request
- ✅ Adds `Authorization: Bearer <token>` header (bypasses interceptor)
- ✅ Adds `X-Session-Id` header
- ✅ On 401 error:
  1. Clears stale JWT using `authService.clearToken()`
  2. Fetches fresh JWT from `/api/v1/auth/token`
  3. Retries WS ticket request **ONCE**
  4. If retry fails, propagates error
- ✅ Dev-only logging (no token values)

#### Tests

**File**: `llm-angular/src/app/core/services/auth-api.service.spec.ts`

✅ **7/7 tests passing**:
- Authorization header present
- X-Session-Id header present
- 401 triggers token clear + retry
- Retry failure handled correctly
- Non-401 errors don't trigger retry
- Async token resolution works
- Missing session ID handled gracefully

### 🎯 Part 2: Local Restart Auth Fix

#### Backend: .env.local + JWT_SECRET Logging

**File**: `server/src/config/env.ts`

- ✅ Explicit `.env.local` loading (dev overrides)
- ✅ Boot logging (dev only):
  - JWT_SECRET length
  - JWT_SECRET source (`.env` vs `.env.local`)
  - Validity status
  - **NEVER logs the actual secret value**
- ✅ Fail-fast in production/staging if JWT_SECRET invalid
- ✅ Fixed dotenv import syntax (`import * as dotenv`)

#### Pre-existing Bug Fixed

**File**: `server/src/infra/websocket/auth-verifier.ts`

- Fixed undefined `isProduction` variable (line 78)

## Security Guarantees

1. ✅ JWT token MUST exist before WS ticket request
2. ✅ `Authorization: Bearer <JWT>` header explicitly included
3. ✅ `X-Session-Id` header explicitly included
4. ✅ 401 triggers single retry with fresh JWT
5. ✅ No infinite retry loops
6. ✅ No insecure fallbacks or auth bypasses
7. ✅ JWT_SECRET must be >= 32 chars
8. ✅ Fail-fast in production if JWT_SECRET invalid
9. ✅ JWT_SECRET value NEVER logged (only length + source)
10. ✅ .env.local overrides .env for local dev

## Local Restart Behavior

### Before Fix:

```
1. Server restarts with new JWT_SECRET
2. Frontend has cached JWT (signed with old secret)
3. WS ticket request → 401 (signature mismatch)
4. Frontend retries with same stale JWT → 401
5. Repeat step 4 forever (401 loop)
6. User must manually clear localStorage
```

### After Fix:

```
1. Server restarts with new JWT_SECRET (from .env.local)
2. Frontend has cached JWT (signed with old secret)
3. WS ticket request → 401 (signature mismatch)
4. Frontend clears stale JWT automatically
5. Frontend fetches fresh JWT from /api/v1/auth/token
6. Frontend retries WS ticket with fresh JWT → Success ✅
7. WebSocket connects normally
```

## Boot Logging (Dev Only)

```
[Config] Loaded .env.local
[Config] JWT_SECRET status: { 
  length: 50, 
  source: '.env.local (if set) or .env', 
  valid: true 
}
[Config] Loaded { env: 'development', port: 3000, ... }
[BOOT] API key status { googleApiKey: { exists: true, len: 39, last4: 'pMo' } }
Server listening on http://localhost:3000
```

## Dev Logging (Frontend)

```
[WS-Ticket] Requesting ticket { hasAuthorization: true, hasSessionId: true }
[WS-Ticket] 401 received, clearing token and retrying once { errorCode: 'INVALID_TOKEN' }
[WS-Ticket] Retrying with fresh token { hasAuthorization: true, hasSessionId: true }
[WS] Ticket OK, connecting...
[WS] Connected
```

## Files Changed

### Backend:
1. `server/src/config/env.ts` - .env.local loading + JWT_SECRET boot logging
2. `server/src/infra/websocket/auth-verifier.ts` - Fixed `isProduction` bug

### Frontend:
3. `llm-angular/src/app/core/services/auth-api.service.ts` - 401 retry with token refresh
4. `llm-angular/src/app/core/services/auth-api.service.spec.ts` - Comprehensive tests

### Documentation:
5. `WS_401_JWT_HARDENING_FIX.md` - Part 1 documentation
6. `LOCAL_RESTART_AUTH_FIX.md` - Part 2 documentation
7. `AUTH_HARDENING_COMPLETE.md` - This file (complete summary)

## Testing

### Backend Verification:

```bash
cd server
npm start
```

Expected boot logs:
```
[Config] Loaded .env.local
[Config] JWT_SECRET status: { length: 50, source: '...', valid: true }
Server listening on http://localhost:3000
```

### Frontend Unit Tests:

```bash
cd llm-angular
npm test -- src/app/core/services/auth-api.service.spec.ts
```

Expected: **7/7 tests passing** ✅

### Integration Test (Local Restart):

1. Start server with `JWT_SECRET="first_secret_32_chars_minimum!!"`
2. Start frontend, establish WS connection
3. Stop server
4. Change `.env.local`: `JWT_SECRET="second_secret_32_chars_minimum!!"`
5. Restart server
6. Observe frontend dev console:
   - `[WS-Ticket] 401 received, clearing token and retrying once`
   - `[WS-Ticket] Retrying with fresh token`
   - `[WS] Ticket OK, connecting...`
   - `[WS] Connected` ✅

## Usage

### Development Setup:

Create `server/.env.local` for local overrides:

```bash
# server/.env.local (not committed to git)
JWT_SECRET=my_local_dev_secret_at_least_32_chars_long!!
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
```

The `.env.local` file is already in `.gitignore`.

### Local Restart Recovery:

**No manual intervention needed**:
- ✅ No localStorage clearing required
- ✅ No browser refresh needed
- ✅ No waiting for token expiry
- ✅ Automatic recovery from JWT signature mismatches

## Architecture

### WS Ticket Request Flow:

```
1. Frontend: authService.getToken() → JWT
2. Frontend: POST /api/v1/auth/ws-ticket
   Headers: { Authorization: Bearer <JWT>, X-Session-Id: <sessionId> }
3. Backend: Verify JWT signature + sessionId
4a. Success → Return one-time ticket
4b. 401 (invalid JWT) → Frontend retry:
    - Clear stale JWT
    - Fetch fresh JWT from /api/v1/auth/token
    - Retry POST /api/v1/auth/ws-ticket with fresh JWT
5. Frontend: Connect WS with ticket: ws://localhost:3000/ws?ticket=<ticket>
```

### Security Flow:

```
1. JWT_SECRET loaded from .env.local (dev) or .env
2. Backend validates JWT_SECRET at boot (fail-fast if invalid)
3. Frontend requests JWT from /api/v1/auth/token (public endpoint)
4. Backend signs JWT with JWT_SECRET
5. Frontend stores JWT in localStorage
6. Frontend requests WS ticket with Authorization: Bearer <JWT>
7. Backend verifies JWT signature
8a. Valid → Generate one-time ticket
8b. Invalid → 401 → Frontend clears stale JWT + retries
```

## Backward Compatibility

- ✅ Public API unchanged
- ✅ WS protocol unchanged
- ✅ Server endpoints unchanged
- ✅ Client service interfaces unchanged

## Known Issues

### Pre-existing TypeScript Errors (Not Related):

The server has unrelated TypeScript errors in:
- `server/src/services/search/route2/assistant/assistant-publisher.ts`
  - Type mismatches for WebSocket message types

These existed before this fix and should be addressed separately.

## Next Steps

1. ✅ Backend: .env.local + JWT_SECRET logging - **Done**
2. ✅ Frontend: 401 retry with token refresh - **Done**
3. ✅ Tests: Comprehensive validation - **Done (7/7)**
4. ✅ Linter checks - **Passing**
5. ✅ TypeScript compilation - **Passing (env.ts)**
6. 🔲 Manual testing: Local restart flow
7. 🔲 QA validation: Staging environment
8. 🔲 Fix pre-existing TypeScript errors (separate task)
9. 🔲 Production deployment

---

**Completed**: 2026-01-28
**By**: AI Assistant
**Status**: ✅ Ready for manual testing
**Security**: ✅ No bypasses, no secrets logged, fail-fast in production
**Tests**: ✅ 7/7 passing
**Linter**: ✅ Passing
