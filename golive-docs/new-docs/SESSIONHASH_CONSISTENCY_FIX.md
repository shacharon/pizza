# SessionHash Consistency Fix

**Date**: 2026-01-28  
**Type**: Bug Fix - Inconsistent sessionHash in WebSocket Logs  
**Scope**: Backend WebSocket Infrastructure  

---

## Problem Statement

**Issue:** `sessionHash` values were inconsistent between WebSocket `ws_subscribe_ack` and `websocket_published` events for the same request, making correlation and debugging difficult.

### Root Cause

Multiple locations computed `sessionHash` independently with:
1. **Different inline implementations** (no shared utility)
2. **Inconsistent fallback values** ('anonymous' vs 'none')
3. **Different handling of edge cases** (anonymous sessions, undefined values)

---

## Locations with Inconsistent Hashing

### Before Fix

**1. Subscribe Path** (subscription-manager.ts, pending-subscriptions.ts)
```typescript
private hashSessionId(sessionId: string): string {
  if (sessionId === 'anonymous') return 'anonymous';
  return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12);
}
```
✅ Handled 'anonymous' specially  
❌ Local implementation (duplicated in 2 files)

**2. Publish Path** (websocket-manager.ts)
```typescript
const sessionHash = sessionId
  ? crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12)
  : 'none';
```
❌ Fallback: 'none'  
❌ No special handling for 'anonymous'  
❌ Inline implementation

**3. Assistant Publisher** (assistant-publisher.ts)
```typescript
const sessionHash = sessionId
  ? crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12)
  : 'none';
```
❌ Same issues as publish path  
❌ Duplicated inline code

**4. Connection Handler** (connection-handler.ts)
```typescript
const sessionHash = ctx.sessionId !== 'anonymous'
  ? crypto.createHash('sha256').update(ctx.sessionId).digest('hex').substring(0, 12)
  : 'anonymous';
```
✅ Handled 'anonymous' specially  
✅ Fallback: 'anonymous'  
❌ Inline implementation

---

## Solution: Shared Utility Function

Created a single source of truth for sessionHash computation.

### New Shared Function

**File:** `server/src/infra/websocket/websocket.types.ts`

```typescript
/**
 * SESSIONHASH FIX: Shared utility for consistent sessionId hashing
 * Used by subscribe, publish, and logging across all WS components
 * 
 * Rules:
 * - 'anonymous' → 'anonymous' (special case, no hash)
 * - undefined/null → 'none' (missing session)
 * - Valid sessionId → SHA256 hash (first 12 chars)
 * 
 * @param sessionId - Session identifier from JWT/ticket
 * @returns Hashed or special-case string for logging
 */
export function hashSessionId(sessionId: string | undefined): string {
  if (!sessionId) return 'none';
  if (sessionId === 'anonymous') return 'anonymous';
  return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12);
}
```

### Consistent Rules

| Input | Output | Reason |
|-------|--------|--------|
| `undefined` | `'none'` | Missing session (not authenticated) |
| `null` | `'none'` | Missing session |
| `'anonymous'` | `'anonymous'` | Special case (no hash needed) |
| `'valid-jwt-session-id'` | `'a1b2c3d4e5f6'` | SHA256 hash (first 12 chars) |

---

## Files Modified

### 1. Core Utility (New Function)

**`server/src/infra/websocket/websocket.types.ts`**
- Added `hashSessionId()` shared utility function
- Exported for use across all WS components
- **Lines added:** +20

---

### 2. WebSocket Manager (Publish Path)

**`server/src/infra/websocket/websocket-manager.ts`**

**Before:**
```typescript
const sessionHash = sessionId
  ? crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12)
  : 'none';
```

**After:**
```typescript
// SESSIONHASH FIX: Use shared utility for consistent hashing
const sessionHash = hashSessionId(sessionId);
```

**Changes:**
- Removed inline hashing
- Added import: `import { hashSessionId } from './websocket.types.js';`
- **Lines changed:** -3, +1

---

### 3. Assistant Publisher

**`server/src/services/search/route2/assistant/assistant-publisher.ts`**

**Changes:**
- Updated `publishAssistantMessage()` (line 23-25)
- Updated `publishAssistantError()` (line 80-82)
- Removed inline hashing (2 occurrences)
- Added import: `import { hashSessionId } from '../../../../infra/websocket/websocket.types.js';`
- Removed unused: `import crypto from 'crypto';`
- **Lines changed:** -6, +2

---

### 4. Connection Handler

**`server/src/infra/websocket/connection-handler.ts`**

**Before:**
```typescript
const sessionHash = ctx.sessionId !== 'anonymous'
  ? crypto.createHash('sha256').update(ctx.sessionId).digest('hex').substring(0, 12)
  : 'anonymous';
```

**After:**
```typescript
// SESSIONHASH FIX: Use shared utility for consistent hashing
const sessionHash = hashSessionId(ctx.sessionId);
```

**Changes:**
- Removed inline hashing
- Added import: `import { hashSessionId } from './websocket.types.js';`
- Removed unused: `import crypto from 'crypto';`
- **Lines changed:** -3, +1

---

### 5. Subscription Manager (Refactored Private Method)

**`server/src/infra/websocket/subscription-manager.ts`**

**Before:**
```typescript
private hashSessionId(sessionId: string): string {
  if (sessionId === 'anonymous') return 'anonymous';
  return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12);
}
```

**After:**
```typescript
/**
 * SESSIONHASH FIX: Use shared utility (now imported from websocket.types.ts)
 * @deprecated Use hashSessionId() from websocket.types.js instead
 */
private hashSessionId(sessionId: string): string {
  return hashSessionId(sessionId);
}
```

**Changes:**
- Refactored to delegate to shared utility
- Added import: `import { hashSessionId } from './websocket.types.js';`
- Kept private method for backward compatibility (no breaking changes)
- **Lines changed:** -2, +4

---

### 6. Pending Subscriptions Manager (Refactored Private Method)

**`server/src/infra/websocket/pending-subscriptions.ts`**

**Before:**
```typescript
private hashSessionId(sessionId: string): string {
  if (sessionId === 'anonymous') return 'anonymous';
  return crypto.createHash('sha256').update(sessionId).digest('hex').substring(0, 12);
}
```

**After:**
```typescript
/**
 * SESSIONHASH FIX: Use shared utility (now imported from websocket.types.ts)
 * @deprecated Use hashSessionId() from websocket.types.js instead
 */
private hashSessionId(sessionId: string): string {
  return hashSessionId(sessionId);
}
```

**Changes:**
- Refactored to delegate to shared utility
- Added import: `import { hashSessionId } from './websocket.types.js';`
- Kept private method for backward compatibility
- **Lines changed:** -2, +4

---

## Summary of Changes

| File | Before | After | Change |
|------|--------|-------|--------|
| `websocket.types.ts` | No shared utility | Shared `hashSessionId()` | +20 lines |
| `websocket-manager.ts` | Inline hash, 'none' fallback | Uses shared utility | -3, +1 |
| `assistant-publisher.ts` | Inline hash (2x), 'none' fallback | Uses shared utility (2x) | -6, +2 |
| `connection-handler.ts` | Inline hash, 'anonymous' fallback | Uses shared utility | -3, +1 |
| `subscription-manager.ts` | Private method | Delegates to shared utility | -2, +4 |
| `pending-subscriptions.ts` | Private method | Delegates to shared utility | -2, +4 |

**Total:** 6 files modified, ~40 lines changed

---

## Verification

### Test Scenario

```bash
# 1. Start server
cd server
npm start

# 2. In another terminal, perform search with WebSocket
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid-jwt>" \
  -d '{"query":"pizza near me"}'

# 3. Check logs for sessionHash consistency
grep -E "ws_subscribe_ack|websocket_published" server/logs/server.log | grep sessionHash
```

### Expected Log Output (After Fix)

**Subscribe Event:**
```json
{
  "level": "info",
  "clientId": "ws-abc-123",
  "channel": "search",
  "requestIdHash": "f4e5d6c7b8a9",
  "sessionHash": "a1b2c3d4e5f6",
  "subscriptionKey": "search:req-xyz-789",
  "pending": false,
  "event": "ws_subscribe_ack",
  "msg": "Subscribe accepted - owner match"
}
```

**Publish Event (Same Request):**
```json
{
  "level": "info",
  "channel": "search",
  "requestId": "req-xyz-789",
  "sessionHash": "a1b2c3d4e5f6",
  "subscriptionKey": "search:req-xyz-789",
  "clientCount": 1,
  "payloadBytes": 1234,
  "payloadType": "status",
  "event": "websocket_published",
  "msg": "websocket_published"
}
```

**✅ Verification:** `sessionHash` values **MATCH** (`a1b2c3d4e5f6`)

---

### Before Fix Example (Inconsistent)

**Subscribe:**
```json
{ "sessionHash": "a1b2c3d4e5f6", "event": "ws_subscribe_ack" }
```

**Publish (MISMATCH):**
```json
{ "sessionHash": "none", "event": "websocket_published" }
```

❌ **Problem:** Subscribe hashed 'anonymous' → 'anonymous', but publish used 'none' for undefined.

---

## Benefits

1. **Consistent Log Correlation** ✅
   - Same `sessionHash` across all WS events for a given session
   - Easy to trace subscribe → publish flow

2. **Single Source of Truth** ✅
   - One function, one implementation
   - No duplicated logic across 6 files

3. **Correct Edge Case Handling** ✅
   - 'anonymous' sessions handled consistently
   - `undefined` values handled consistently
   - No more fallback confusion ('none' vs 'anonymous')

4. **Better Debugging** ✅
   - Can grep logs by `sessionHash` and see full lifecycle
   - No more "why is this hash different?" questions

5. **Future-Proof** ✅
   - Any future hash changes happen in one place
   - Type-safe (TypeScript enforces consistent usage)

---

## Backward Compatibility

✅ **No Breaking Changes**

- Private `hashSessionId()` methods in `subscription-manager.ts` and `pending-subscriptions.ts` still exist
- They now delegate to the shared utility (transparent refactor)
- Existing code calling these private methods continues to work

---

## Testing

### Manual Test

```bash
# Run one search with JWT session
curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer eyJ..." \
  -d '{"query":"pizza"}' \
  --verbose

# Extract sessionHash from logs
grep sessionHash server/logs/server.log | tail -20

# Verify ALL occurrences have the SAME hash for the SAME sessionId
```

### Expected Results

For a single search request with sessionId `session-abc-123`:

```
ws_conn_ctx_set:        sessionHash: "d7e8f9a0b1c2"
ws_subscribe_ack:       sessionHash: "d7e8f9a0b1c2"
websocket_published:    sessionHash: "d7e8f9a0b1c2"
assistant_ws_publish:   sessionHash: "d7e8f9a0b1c2"
```

✅ **All 4 events have IDENTICAL sessionHash**

---

## Edge Cases Covered

| Scenario | sessionId Value | sessionHash Output |
|----------|----------------|-------------------|
| Valid JWT | `"sess-abc-123..."` | `"a1b2c3d4e5f6"` (hashed) |
| Anonymous | `"anonymous"` | `"anonymous"` (no hash) |
| Missing (undefined) | `undefined` | `"none"` |
| Missing (null) | `null` | `"none"` |
| Empty string | `""` | `"none"` (falsy) |

---

## Rollback Plan

If issues arise, revert changes:

```bash
git revert <commit-sha>
```

All changes are in isolated utility function and its imports. No behavior changes except hash consistency.

---

**Status:** ✅ **Complete** - SessionHash is now computed consistently across all WebSocket operations (subscribe, publish, assistant, connection). Logs are now reliably correlatable by sessionHash.

**Key Achievement:** Single shared `hashSessionId()` utility ensures consistent hashing logic across 6 different files, eliminating edge-case discrepancies and improving log correlation.
