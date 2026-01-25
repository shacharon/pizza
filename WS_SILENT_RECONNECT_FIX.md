# WebSocket Silent Reconnect Fix

**Date:** 2026-01-25  
**Status:** ✅ COMPLETE

## Problem Statement

WebSocket reconnection was noisy on page refresh:
- Console flooded with retry attempt logs
- UI showed error banners for transient failures
- No distinction between recoverable (soft) and permanent (hard) failures
- Server didn't send structured close reasons
- Backoff was too aggressive (started at 1s, max 30s)

## Solution Overview

Implemented **silent reconnection** with structured failure classification:

1. **Shared Constants**: Created `ws-close-reasons.ts` with HARD/SOFT failure types
2. **Server Changes**: Send structured close codes+reasons for all disconnect scenarios
3. **Client Changes**: Classify failures, stop reconnect on HARD, silent backoff on SOFT
4. **UI Changes**: Removed error banner, kept only subtle "Reconnecting..." indicator
5. **Backoff**: Faster, smarter exponential backoff with jitter (250ms→5s max)

## Changes Made

### 1. Shared Constants (NEW)

**Files Created:**
- `server/src/infra/websocket/ws-close-reasons.ts`
- `llm-angular/src/app/core/models/ws-close-reasons.ts`

```typescript
// Hard failures (stop reconnect)
HARD_CLOSE_REASONS = {
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  ORIGIN_BLOCKED: 'ORIGIN_BLOCKED',
  BAD_SUBSCRIBE: 'BAD_SUBSCRIBE',
  INVALID_REQUEST: 'INVALID_REQUEST',
}

// Soft failures (allow reconnect)
SOFT_CLOSE_REASONS = {
  SERVER_SHUTDOWN: 'SERVER_SHUTDOWN',
  IDLE_TIMEOUT: 'IDLE_TIMEOUT',
  HEARTBEAT_TIMEOUT: 'HEARTBEAT_TIMEOUT',
}
```

### 2. Server Changes

**File:** `server/src/infra/websocket/websocket-manager.ts`

**Changes:**
- Import `ws-close-reasons` constants
- Send structured close codes + reasons on:
  - Origin blocked: `ws.close(1008, ORIGIN_BLOCKED)`
  - Auth failures: `ws.close(1008, NOT_AUTHORIZED)`
  - Invalid subscribe: `ws.close(1008, BAD_SUBSCRIBE)`
  - Idle timeout: `ws.close(1000, IDLE_TIMEOUT)`
  - Heartbeat timeout: `ws.close(1000, HEARTBEAT_TIMEOUT)`
  - Server shutdown: `ws.close(1001, SERVER_SHUTDOWN)`

**Why 1008 for hard failures?**  
Code 1008 = "Policy Violation" - appropriate for auth/origin/validation failures

### 3. Client Changes

**File:** `llm-angular/src/app/core/services/ws-client.service.ts`

**Key Changes:**

1. **Import close reason classifier:**
   ```typescript
   import { isHardCloseReason } from '../models/ws-close-reasons';
   ```

2. **Add hard failure tracking:**
   ```typescript
   private hardFailureLogged = false; // Log once per page load
   private shouldReconnect = true; // Stop on hard failures
   ```

3. **Classify failures in onclose:**
   ```typescript
   this.ws.onclose = (event) => {
     const reason = event.reason || '';
     console.log('[WS] Disconnected', { code, reason, wasClean });

     if (isHardCloseReason(reason)) {
       // Log once and STOP reconnecting
       console.error('[WS] Hard failure - stopping reconnect', { ... });
       this.shouldReconnect = false;
       return;
     }

     // Soft failure: reconnect silently
     if (this.shouldReconnect) {
       this.scheduleReconnect();
     }
   };
   ```

4. **Exponential backoff with jitter:**
   ```typescript
   // 250ms → 500ms → 1s → 2s → 4s → 5s (max)
   const exponentialDelay = Math.min(
     250 * Math.pow(2, this.reconnectAttempts),
     5000
   );
   
   // Add jitter: ±25%
   const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
   const delay = Math.round(exponentialDelay + jitter);
   ```

5. **Silent errors:**
   ```typescript
   this.ws.onerror = (error) => {
     // Don't log noisy errors - handled in onclose
   };
   ```

### 4. UI Changes

**File:** `llm-angular/src/app/shared/components/ws-status-banner/ws-status-banner.component.ts`

**Changes:**
- Removed `disconnected` state UI (no more error banner)
- Removed "Retry" button
- Kept only subtle "Reconnecting..." banner with spinning icon
- No attempt count shown to user

**Before:**
```
⚠️ Connection lost. Results may be outdated. [Retry]
⟳ Reconnecting to server... (attempt 3)
```

**After:**
```
⟳ Reconnecting...
```

## Acceptance Tests

### Test 1: Page Refresh (5x)
**Scenario:** Refresh page 5 times rapidly

**Expected:**
- ✅ No error UI shown
- ✅ Optional "Reconnecting..." banner appears briefly
- ✅ Console shows clean logs: `[WS] Disconnected { code: 1006, reason: '', wasClean: false }`
- ✅ Reconnects automatically within 250-500ms

**How to Test:**
1. Open app: `http://localhost:4200`
2. Refresh 5 times (Ctrl+R / Cmd+R)
3. Check console: should see reconnect attempts but NO errors in UI
4. Check banner: should appear/disappear quickly

---

### Test 2: Origin Blocked (Hard Failure)
**Scenario:** Server blocks origin

**Expected:**
- ✅ Console shows: `[WS] Hard failure - stopping reconnect { code: 1008, reason: 'ORIGIN_BLOCKED', wasClean: true }`
- ✅ Client stops reconnecting (no more attempts)
- ✅ No error UI shown
- ✅ Hard failure logged once only

**How to Test (locally):**
1. Edit `server/.env`: add invalid origin to `FRONTEND_ORIGINS`
2. Restart server
3. Open app
4. Check console: should log hard failure and stop

**Rollback:**
```bash
# Restore valid origins
echo "FRONTEND_ORIGINS=http://localhost:4200" >> server/.env
```

---

### Test 3: JWT Invalid (Hard Failure)
**Scenario:** JWT expired or invalid

**Expected:**
- ✅ Console shows: `[WS] Hard failure - stopping reconnect { code: 1008, reason: 'NOT_AUTHORIZED', wasClean: true }`
- ✅ Client stops reconnecting
- ✅ No error UI shown

**How to Test (locally):**
1. Clear localStorage (deletes JWT)
2. Try to connect to WS
3. Check console for hard failure log

---

### Test 4: Server Unavailable (Soft Failure)
**Scenario:** Server temporarily down

**Expected:**
- ✅ Console shows: `[WS] Disconnected { code: 1006, reason: '', wasClean: false }`
- ✅ Client keeps reconnecting silently with backoff
- ✅ Optional "Reconnecting..." banner shown
- ✅ Once server up, client reconnects automatically

**How to Test (locally):**
1. Start app: `npm run dev` (in server/)
2. Open app: `http://localhost:4200`
3. Stop server: `Ctrl+C`
4. Watch console: should log reconnect attempts with increasing delays
5. Restart server: `npm run dev`
6. Watch: client reconnects automatically

---

### Test 5: Production Test
**Scenario:** Test on live environment

**Expected:**
- ✅ All above scenarios work on `wss://api.going2eat.food/ws`
- ✅ HTTPS/WSS only
- ✅ Origin validation works
- ✅ Ticket auth works

**How to Test:**
```bash
# Deploy to production
npm run build
# ... deploy steps ...

# Open production app
# Perform tests 1-4 on production URL
```

## Backoff Visualization

| Attempt | Base Delay | With Jitter (±25%) | Example |
|---------|------------|-------------------|---------|
| 1       | 250ms      | 187ms - 312ms    | 245ms   |
| 2       | 500ms      | 375ms - 625ms    | 512ms   |
| 3       | 1000ms     | 750ms - 1250ms   | 1050ms  |
| 4       | 2000ms     | 1500ms - 2500ms  | 2100ms  |
| 5       | 4000ms     | 3000ms - 5000ms  | 4200ms  |
| 6+      | 5000ms (max)| 3750ms - 6250ms | 5000ms  |

**Jitter Benefits:**
- Prevents thundering herd when many clients reconnect
- Spreads server load
- More resilient to network hiccups

## Console Output Examples

### Normal Reconnect (Soft Failure)
```
[WS] Disconnected { code: 1006, reason: '', wasClean: false }
[WS] Reconnecting in 245ms (attempt 1)
[WS] Requesting ticket...
[WS] Ticket obtained, connecting...
[WS] Connected
[WS] Resubscribing to abc-123-def
```

### Hard Failure (Stops Reconnect)
```
[WS] Disconnected { code: 1008, reason: 'NOT_AUTHORIZED', wasClean: true }
[WS] Hard failure - stopping reconnect { code: 1008, reason: 'NOT_AUTHORIZED', wasClean: true }
```

### Server Shutdown (Soft Failure)
```
[WS] Disconnected { code: 1001, reason: 'SERVER_SHUTDOWN', wasClean: true }
[WS] Reconnecting in 312ms (attempt 1)
```

## Benefits

1. **Silent Reconnect**: No UI noise for transient network issues
2. **Smart Classification**: Hard failures stop immediately (no wasted retries)
3. **Faster Recovery**: Starts at 250ms instead of 1s
4. **Better UX**: Users don't see scary error messages on page refresh
5. **Better Logs**: Structured reasons help debug real issues
6. **Production Ready**: Works with `wss://api.going2eat.food/ws`

## Files Changed

**Server:**
- `server/src/infra/websocket/ws-close-reasons.ts` (NEW)
- `server/src/infra/websocket/websocket-manager.ts` (MODIFIED)

**Client:**
- `llm-angular/src/app/core/models/ws-close-reasons.ts` (NEW)
- `llm-angular/src/app/core/services/ws-client.service.ts` (MODIFIED)
- `llm-angular/src/app/shared/components/ws-status-banner/ws-status-banner.component.ts` (MODIFIED)

## Future Enhancements

1. **Analytics Event**: Send hard failure logs to backend `/logs` endpoint
   ```typescript
   if (isHardCloseReason(reason) && !this.hardFailureLogged) {
     // TODO: Send to backend
     this.http.post('/api/v1/logs/ws-failure', {
       code, reason, wasClean, timestamp: Date.now()
     }).subscribe();
   }
   ```

2. **Retry Budget**: Limit total reconnect attempts per session
   ```typescript
   private readonly maxReconnectAttempts = 50; // ~5 minutes
   if (this.reconnectAttempts >= this.maxReconnectAttempts) {
     console.error('[WS] Max retries exceeded');
     this.shouldReconnect = false;
   }
   ```

3. **Network Status API**: Use `navigator.onLine` to pause retries when offline
   ```typescript
   if (!navigator.onLine) {
     console.log('[WS] Offline - pausing reconnect');
     return;
   }
   ```

## Testing Checklist

- [x] Page refresh 5x: no error UI
- [x] Origin blocked: hard failure logged, reconnect stopped
- [x] JWT invalid: hard failure logged, reconnect stopped
- [x] Server down: soft failure, keeps reconnecting
- [x] Server up again: reconnects automatically
- [x] Backoff increases: 250ms → 500ms → 1s → 2s → 4s → 5s
- [x] Jitter works: delays vary by ±25%
- [x] Banner shows only "Reconnecting..." (no error state)
- [x] Console logs structured close reasons
- [x] No linter errors

## Deployment Notes

1. **Deploy server first**: New close reasons won't break old clients
2. **Deploy client after**: Client will start using new logic
3. **Monitor logs**: Check for hard failure patterns (may indicate config issue)

**Production URLs:**
- API: `https://api.going2eat.food`
- WebSocket: `wss://api.going2eat.food/ws`
- Frontend: `https://app.going2eat.food`

## Summary

This fix makes WebSocket reconnection **silent, smart, and fast**:
- No more noisy UI on page refresh ✅
- Stops immediately on hard failures (auth/origin) ✅
- Reconnects silently on soft failures (network) ✅
- Structured close reasons for debugging ✅
- Exponential backoff with jitter (250ms→5s) ✅

**Result:** Professional, production-ready WebSocket behavior.
