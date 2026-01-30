# P0 Fix: WebSocket Crash - "require is not defined"

## Problem
WebSocket subscribe requests were crashing with a fatal unhandled promise rejection:

```
ReferenceError: require is not defined
    at SubscriptionManager.subscribe (subscription-manager.ts:71:27)
```

The error occurred because ESM (ES Modules) doesn't support `require()`, but the code was using dynamic `require('crypto')` calls in lines 71-72 of `subscription-manager.ts`.

## Root Cause
In `server/src/infra/websocket/subscription-manager.ts`, lines 71-72 used:
```typescript
const requestIdHash = require('crypto').createHash('sha256')...
const sessionHash = require('crypto').createHash('sha256')...
```

This caused crashes in ESM/ts-node runtime where `require` is not defined.

## Solution

### 1. Fixed ESM Import Issue
**File:** `server/src/infra/websocket/subscription-manager.ts`

**Changed:**
- Lines 71-72: Replaced `require('crypto')` with the already-imported `crypto` module
- The `crypto` module was already imported at the top (line 9) but not being used

**Before:**
```typescript
const requestIdHash = require('crypto').createHash('sha256').update(requestId).digest('hex').substring(0, 12);
const sessionHash = require('crypto').createHash('sha256').update(sessionId || 'anonymous').digest('hex').substring(0, 12);
```

**After:**
```typescript
const requestIdHash = crypto.createHash('sha256').update(requestId).digest('hex').substring(0, 12);
const sessionHash = crypto.createHash('sha256').update(sessionId || 'anonymous').digest('hex').substring(0, 12);
```

### 2. Added Error Handling (Defense in Depth)
**Files Modified:**
1. `server/src/infra/websocket/subscribe-handler.service.ts`
2. `server/src/infra/websocket/message-router.ts`

**Changes:**
- Wrapped subscription handler calls in try/catch blocks
- Added error logging with structured context
- Send proper error acknowledgment to WS clients (`sub_nack` with `internal_error`)
- Prevents unhandled promise rejections from crashing the server

**Key additions:**
- Subscribe handler now catches all errors and sends error acks to clients
- Message router catches errors from subscribe callback
- Errors are logged with full context (clientId, channel, requestId, stack trace)

### 3. Added Test Coverage
**File:** `server/src/infra/websocket/__tests__/subscription-manager.test.ts`

**Tests Added:**
1. `should not throw "require is not defined" error in ESM runtime` ✅
2. `should handle crypto hashing in subscribe without require()` ✅

Both tests pass successfully, confirming the fix works in ESM runtime.

## Verification

### Test Results
```bash
npm run test:ws:unit
```

**ESM Compatibility Tests:**
- ✅ ok 1 - should not throw "require is not defined" error in ESM runtime
- ✅ ok 2 - should handle crypto hashing in subscribe without require()
- ✅ ok 5 - ESM compatibility (P0 fix)

### Expected Behavior After Fix
1. ✅ No more `ReferenceError: require is not defined` 
2. ✅ No more `[FATAL] Unhandled Promise Rejection` in logs
3. ✅ WebSocket subscribe requests complete successfully
4. ✅ Clients receive proper `sub_ack` or `sub_nack` messages
5. ✅ Errors are logged with full context but don't crash the server

## Files Changed
1. `server/src/infra/websocket/subscription-manager.ts` - Fixed crypto require()
2. `server/src/infra/websocket/subscribe-handler.service.ts` - Added error handling
3. `server/src/infra/websocket/message-router.ts` - Added error handling
4. `server/src/infra/websocket/__tests__/subscription-manager.test.ts` - Added tests

## Protocol Compliance
- ✅ Error responses use same protocol shape (WSServerMessage)
- ✅ Clients receive `sub_nack` with appropriate error code
- ✅ No changes to message types or protocol structure
- ✅ Backward compatible with existing clients

## Impact
- **Priority:** P0 (Critical - Server Crash)
- **Severity:** High (Affects all WebSocket subscriptions)
- **User Impact:** Fixed - Users can now successfully subscribe to channels
- **Server Stability:** Fixed - No more fatal unhandled rejections

## Next Steps
1. Deploy fix to staging
2. Monitor logs for any `ws_subscribe_error` events
3. Verify no more `[FATAL] Unhandled Promise Rejection` in production logs
4. Confirm WebSocket subscriptions working end-to-end
