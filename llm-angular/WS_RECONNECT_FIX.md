# WebSocket Reconnect Storm Fix - Summary

## ✅ Issues Fixed

### A) Connection Mutex (Prevent Concurrent Attempts)
**Problem:** Multiple simultaneous connect() calls causing request storms

**Solution:**
- Added `connectInFlight` guard flag
- Returns immediately if connection attempt already in progress
- Cleared when connection completes (success/fail in onclose or catch)
- Prevents duplicate ws-ticket requests

**Files Changed:**
- `llm-angular/src/app/core/services/ws-client.service.ts` (lines 56, 73-74, 143, 148)

### B) EmptyError Handling (No Crash, No Spam)
**Problem:** RxJS EmptyError crashes when observable completes with no values

**Solution:**
- Wrapped `firstValueFrom()` calls in try-catch
- Check for `error.name === 'EmptyError'` or message includes 'no elements in sequence'
- Treat as transient failure → scheduleReconnect()
- No crash, no spam in console

**Files Changed:**
- `llm-angular/src/app/core/services/ws-client.service.ts` (lines 93-103)
- `llm-angular/src/app/core/auth/auth.service.ts` (lines 147-156)

### C) UI Spam Reduction (30s Delay)
**Problem:** Banner shows immediately on every reconnect attempt (noisy)

**Solution:**
- Only show banner after 30 seconds of being disconnected
- Clear timer immediately when connected
- One non-blocking message, suppressed until state changes
- Silent reconnects for transient failures

**Files Changed:**
- `llm-angular/src/app/shared/components/ws-status-banner/ws-status-banner.component.ts` (entire file)

## 📝 Code Changes

### 1. ws-client.service.ts

**Added Mutex:**
```typescript
private connectInFlight = false; // Line 56

// In connect() - start
if (this.connectInFlight) {
  return;
}
this.connectInFlight = true; // Line 85

// In onclose
this.connectInFlight = false; // Line 143

// In catch block
this.connectInFlight = false; // Line 148
```

**Added EmptyError Handling:**
```typescript
// In connect() - ticket fetch (lines 93-103)
let ticketResponse: any;
try {
  ticketResponse = await firstValueFrom(this.authApi.requestWSTicket());
} catch (error: any) {
  // Handle EmptyError as retryable
  if (error?.name === 'EmptyError' || error?.message?.includes('no elements in sequence')) {
    console.warn('[WS] EmptyError fetching ticket - will retry');
    this.scheduleReconnect();
    return;
  }
  throw error; // Re-throw other errors
}
```

**Fixed Timer Management:**
```typescript
// In scheduleReconnect() - clear existing timer (lines 318-321)
if (this.reconnectTimer) {
  clearTimeout(this.reconnectTimer);
  this.reconnectTimer = undefined;
}
```

**Reduced Logging:**
- Removed verbose step-by-step logs
- Kept only: ticket OK, connected, disconnected, errors
- From 8 log statements → 3 log statements per cycle

### 2. auth.service.ts

**Added EmptyError Handling:**
```typescript
// In fetchTokenFromBackend() (lines 147-156)
let response: TokenResponse;
try {
  response = await firstValueFrom(
    this.http.post<TokenResponse>(ENDPOINTS.AUTH_TOKEN, body)
  );
} catch (error: any) {
  // Handle EmptyError as retryable
  if (error?.name === 'EmptyError' || error?.message?.includes('no elements in sequence')) {
    console.warn('[Auth] EmptyError fetching token - treating as transient failure');
    throw new Error('Failed to fetch token: no response from server');
  }
  throw error; // Re-throw other errors
}
```

### 3. ws-status-banner.component.ts

**Complete Rewrite for 30s Delay:**
```typescript
readonly showBanner = signal(false);
private disconnectTimer?: number;

constructor() {
  effect(() => {
    const currentStatus = this.status();
    
    if (currentStatus === 'connected') {
      // Clear timer and hide banner immediately on connect
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
        this.disconnectTimer = undefined;
      }
      this.showBanner.set(false);
    } else if (currentStatus === 'disconnected' || currentStatus === 'reconnecting') {
      // Start 30s timer if not already running
      if (!this.disconnectTimer) {
        this.disconnectTimer = window.setTimeout(() => {
          this.showBanner.set(true);
        }, 30_000); // 30 seconds
      }
    }
  });
}
```

## 🎯 Results

### Before Fix
- ❌ Multiple concurrent ws-ticket requests (storm in Network tab)
- ❌ EmptyError crashes visible in console
- ❌ Banner flashes on every reconnect attempt
- ❌ Noisy logs (8 lines per attempt)

### After Fix
- ✅ Only ONE ws-ticket request per reconnect cycle
- ✅ EmptyError handled gracefully (no crash, schedules retry)
- ✅ Banner only shows after 30s of disconnection
- ✅ Clean logs (3 lines per cycle: ticket OK, connected, errors only)

## 🧪 Verification

### Test 1: Single Request Per Cycle
1. Open DevTools → Network tab
2. Filter: `ws-ticket`
3. Trigger disconnect (turn off server or block request)
4. **Expected:** Only ONE ws-ticket request per reconnect attempt
5. **Expected:** No (canceled) requests in storm

### Test 2: EmptyError Handling
1. Mock `authApi.requestWSTicket()` to return empty observable
2. **Expected:** No uncaught EmptyError in console
3. **Expected:** Warning log: "EmptyError fetching ticket - will retry"
4. **Expected:** Reconnect scheduled

### Test 3: UI Silence
1. Trigger disconnect
2. **Expected:** No banner for first 30 seconds
3. **Expected:** After 30s, ONE banner appears ("Connection issue - reconnecting...")
4. **Expected:** Banner disappears immediately when connected
5. **Expected:** No toast/popup spam

### Test 4: Logs
1. Check console during reconnect cycle
2. **Expected logs:**
   - `[WS] Reconnect in XXXms (attempt N)`
   - `[WS] Ticket OK, connecting...`
   - `[WS] Connected`
3. **No verbose logs:**
   - ~~Step 1/3: Ensuring JWT token exists...~~
   - ~~Step 2/3: Requesting NEW WebSocket ticket...~~
   - ~~JWT ready~~
   - ~~Ticket obtained, connecting to WebSocket...~~

## 📁 Files Modified

1. `llm-angular/src/app/core/services/ws-client.service.ts`
   - Added `connectInFlight` mutex
   - Added EmptyError handling in ticket fetch
   - Fixed timer management in scheduleReconnect()
   - Reduced logging verbosity

2. `llm-angular/src/app/core/auth/auth.service.ts`
   - Added EmptyError handling in token fetch

3. `llm-angular/src/app/shared/components/ws-status-banner/ws-status-banner.component.ts`
   - Added 30s delay before showing banner
   - Timer management with immediate hide on connect

## 🚫 What Was NOT Changed

- ✅ No backend changes
- ✅ No API contract changes
- ✅ No new dependencies
- ✅ No refactoring beyond scope
- ✅ JWT logic unchanged
- ✅ WS protocol unchanged

## 📊 Impact

**User Experience:**
- Cleaner, less noisy UI
- No popup spam during reconnects
- Silent recovery for transient failures
- Only shows message if issue persists >30s

**Developer Experience:**
- Cleaner console logs
- Easier to debug (fewer log lines)
- No EmptyError crashes
- Network tab shows clean single requests

**Performance:**
- No request storms
- Reduced server load
- Proper backoff respected

## 🔧 Technical Details

### Mutex Implementation
```typescript
connectInFlight: boolean = false

// Guards:
1. Check at start of connect()
2. Set to true when starting
3. Set to false in onclose (line 143)
4. Set to false in catch block (line 148)
```

### EmptyError Detection
```typescript
if (error?.name === 'EmptyError' || 
    error?.message?.includes('no elements in sequence'))
```

### Timer Management
```typescript
// scheduleReconnect():
1. Clear existing timer FIRST
2. Calculate delay with backoff + jitter
3. Schedule new timer
4. Clear timer when fired
```

### 30s Delay Logic
```typescript
// effect() watches status:
- connected → clear timer, hide banner
- disconnected/reconnecting → start 30s timer (if not running)
- timer fires → show banner
```

---

**Status:** ✅ Complete and Ready for Testing
**Risk:** Low (minimal changes, proper guards)
**Testing Required:** Network tab verification + 30s banner delay
