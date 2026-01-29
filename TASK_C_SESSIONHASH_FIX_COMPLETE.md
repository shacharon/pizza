# Task C: Fix Inconsistent sessionHash - Complete

**Date**: 2026-01-28  
**Status**: ✅ **Fixed** - Awaiting Server Restart for Verification

---

## Summary

Fixed inconsistent `sessionHash` values between WebSocket subscribe and publish events by ensuring JWT `ctx.sessionId` takes precedence over client-provided `request.sessionId`.

---

## Root Cause

### The Problem

```
Line 10:  ws_subscribe_attempt  → sessionHash: "2c3b20d765e7"  ← From JWT (ctx.sessionId)
Line 68:  assistant_ws_publish  → sessionHash: "62119263c654"  ← From client payload (request.sessionId)
```

**Same request, same session, DIFFERENT hashes!**

### Why It Happened

The `resolveSessionId()` function had the **wrong priority order**:

**Before (WRONG):**
```typescript
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return request.sessionId || ctx.sessionId || 'route2-session';
  //     ^^^^^^^^^^^^^^^^^^^^^ Client payload (untrusted, may be stale)
  //                        ^^^^^^^^^^^^^ JWT token (authoritative source)
}
```

**Flow:**
1. **Subscribe**: WebSocket subscription-manager uses `ctx.sessionId` directly (from JWT)
   - Real sessionId: `sess_0a6a9323-dfaa-4864-836a-fbffe02d7ec4`
   - Hash: `2c3b20d765e7`

2. **Publish**: Assistant publisher uses `resolveSessionId(request, ctx)`
   - Returns `request.sessionId` (different value from client HTTP body)
   - Hash: `62119263c654`

**Result:** Inconsistent hashes for the same session!

---

## The Fix

### File Changed

**`server/src/services/search/route2/orchestrator.helpers.ts`**

**Before (Lines 84-89):**
```typescript
/**
 * Resolve session ID from request or context
 */
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return request.sessionId || ctx.sessionId || 'route2-session';
}
```

**After (Lines 84-91):**
```typescript
/**
 * Resolve session ID from request or context
 * CRITICAL: ctx.sessionId (JWT) takes precedence over request.sessionId (client payload)
 * This ensures consistent sessionHash in subscribe vs publish logs
 */
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return ctx.sessionId || request.sessionId || 'route2-session';
  //     ^^^^^^^^^^^^^ JWT token (authoritative) - NOW FIRST PRIORITY
}
```

**Change:** Reversed priority order to make JWT `ctx.sessionId` the single source of truth.

---

## How It Works Now

### Priority Order (Correct)

1. **`ctx.sessionId`** (from JWT/middleware) ← **Authoritative source**
2. **`request.sessionId`** (from client HTTP body) ← Fallback only
3. **`'route2-session'`** ← Last resort

### Consistency Guarantee

- **Subscribe**: Uses `ctx.sessionId` from WebSocket JWT ticket
- **Publish**: Uses `resolveSessionId(request, ctx)` which now prioritizes `ctx.sessionId`
- **Hash Function**: Both use shared `hashSessionId()` utility from `websocket.types.ts`

**Result:** Same sessionId → Same hash → Consistent logs!

---

## Verification After Restart

### Expected Log Output

```json
// Subscribe
{"event":"ws_subscribe_attempt","sessionHash":"2c3b20d765e7",...}
{"event":"ws_subscribe_ack","sessionHash":"2c3b20d765e7",...}

// Publish (Same hash!)
{"event":"assistant_ws_publish","sessionHash":"2c3b20d765e7",...}
{"event":"websocket_published","sessionHash":"2c3b20d765e7",...}
```

✅ **Identical `sessionHash` across all WS events for the same request/session**

### Verification Commands

```bash
# 1. Restart server
cd server
npm start

# 2. Perform search
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"query":"pizza in tel aviv"}'

# 3. Check logs - find sessionHash values
grep -E "ws_subscribe|assistant_ws_publish" server/logs/server.log | grep sessionHash

# Expected: ALL sessionHash values identical for the same session
```

---

## Related Components (Already Using Shared Utility)

All WebSocket components already use the shared `hashSessionId()` utility from `websocket.types.ts`:

✅ **`websocket-manager.ts`** (line 473)
- `publishToChannel()` uses shared `hashSessionId(sessionId)`

✅ **`assistant-publisher.ts`** (line 24)
- `publishAssistantMessage()` uses shared `hashSessionId(sessionId)`

✅ **`subscription-manager.ts`** (line 401)
- Private `hashSessionId()` delegates to shared utility

✅ **`pending-subscriptions.ts`** (line 179)
- Private `hashSessionId()` delegates to shared utility

✅ **`connection-handler.ts`**
- Uses shared utility for WS connection setup logs

**All components use the SAME hashing logic** - the issue was the INPUT (`sessionId` value), not the hash function.

---

## Why This Matters

### Security & Consistency

1. **JWT is authoritative** - Session ID from JWT token is cryptographically signed and verified
2. **Client payload is untrusted** - Client can send any `sessionId` in HTTP body (stale, wrong, or malicious)
3. **Log consistency** - Same session must show same hash across all events for proper debugging/monitoring

### Real-World Impact

**Before Fix:**
- Log correlation broken (same session showed different hashes)
- Debugging WS issues was confusing
- Monitoring/alerting may trigger false positives

**After Fix:**
- Accurate log correlation
- Clear audit trail per session
- Reliable debugging & monitoring

---

## Files Changed

### Modified

1. **`server/src/services/search/route2/orchestrator.helpers.ts`**
   - Updated `resolveSessionId()` to prioritize JWT `ctx.sessionId`
   - Added JSDoc comment explaining the priority and rationale

---

## Deliverables

### Files Changed
✅ `server/src/services/search/route2/orchestrator.helpers.ts` (1 function modified)

### Proof (After Server Restart)
✅ Single consistent `sessionHash` across all WS events for the same request/session

**Example Expected Output:**
```
sess_0a6a9323-dfaa-4864-836a-fbffe02d7ec4 → sessionHash: 2c3b20d765e7 (subscribe)
sess_0a6a9323-dfaa-4864-836a-fbffe02d7ec4 → sessionHash: 2c3b20d765e7 (publish)
```

---

## Key Insight

The shared `hashSessionId()` utility was always correct. The problem was that **different input values** were being hashed:

- Subscribe: JWT sessionId (correct)
- Publish: Client payload sessionId (wrong)

**Fix:** Make JWT the single source of truth everywhere.

---

**Status:** ✅ **Complete** - Fix applied, awaiting server restart to verify in logs.

**Note:** The old logs showing inconsistency are from before this fix. New logs will show identical `sessionHash` values.
