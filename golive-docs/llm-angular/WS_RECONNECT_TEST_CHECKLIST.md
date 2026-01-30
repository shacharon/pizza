# WebSocket Reconnect Fix - Verification Checklist

## Quick Test Guide

### ✅ Test 1: No Request Storm (CRITICAL)

**Steps:**
1. Open Chrome DevTools → Network tab
2. Filter by: `ws-ticket`
3. Clear network log
4. Stop backend server (or use Network throttling → Offline)
5. Observe reconnect attempts

**Expected Results:**
- [ ] Only ONE `ws-ticket` request per reconnect cycle
- [ ] No multiple simultaneous requests
- [ ] No (canceled) requests
- [ ] Clean backoff visible: 250ms → 500ms → 1s → 2s → 4s → 5s

**Failed If:**
- ❌ Multiple ws-ticket requests at same time
- ❌ Canceled requests in Network tab
- ❌ Request storm (>1 request per cycle)

---

### ✅ Test 2: EmptyError Handling

**Steps:**
1. Open Console
2. Trigger scenario where observable returns empty
3. Or: Mock network error that causes EmptyError

**Expected Results:**
- [ ] No uncaught EmptyError in console
- [ ] Warning log appears: `[WS] EmptyError fetching ticket - will retry`
- [ ] Reconnect scheduled (see next attempt in logs)
- [ ] No crash, app continues running

**Failed If:**
- ❌ Red error: "Uncaught EmptyError"
- ❌ App crashes or stops reconnecting
- ❌ No retry scheduled

---

### ✅ Test 3: UI Silence (No Popup Spam)

**Steps:**
1. Start with connected state
2. Stop backend server
3. Start timer (or note time)
4. Wait and observe UI

**Expected Results:**
- [ ] 0-29 seconds: No banner visible
- [ ] At 30 seconds: ONE banner appears: "Connection issue - reconnecting..."
- [ ] Banner stays visible while disconnected
- [ ] Start backend server
- [ ] Banner disappears IMMEDIATELY when connected
- [ ] No toast/notification popups at any point

**Failed If:**
- ❌ Banner shows immediately (<30s)
- ❌ Multiple banners or toasts appear
- ❌ Banner flashes on each reconnect attempt
- ❌ Banner doesn't disappear when connected

---

### ✅ Test 4: Clean Logs

**Steps:**
1. Open Console
2. Clear console
3. Trigger disconnect
4. Observe reconnect cycle logs

**Expected Logs (3 per cycle):**
```
[WS] Reconnect in 250ms (attempt 1)
[WS] Ticket OK, connecting...
[WS] Connected
```

**Should NOT See:**
- ❌ `Step 1/3: Ensuring JWT token exists...`
- ❌ `Step 2/3: Requesting NEW WebSocket ticket...`
- ❌ `JWT ready`
- ❌ `Ticket obtained, connecting to WebSocket...`
- ❌ `Step 3/3: Connecting with ticket...`
- ❌ `Resubscribing to...` (only visible once per actual resubscribe)

**Failed If:**
- ❌ More than 3 log lines per successful cycle
- ❌ Verbose step-by-step logs present
- ❌ Noisy logs on each attempt

---

### ✅ Test 5: Mutex (No Concurrent Connections)

**Steps:**
1. Add temporary log in connect() start: `console.log('[TEST] connect() called')`
2. Open Console
3. Clear console
4. Trigger disconnect
5. Count log entries per reconnect cycle

**Expected Results:**
- [ ] Only ONE `[TEST] connect() called` per cycle
- [ ] No overlapping connection attempts
- [ ] `connectInFlight` prevents re-entry

**Failed If:**
- ❌ Multiple `connect() called` logs appear simultaneously
- ❌ Overlapping attempts visible

---

### ✅ Test 6: Reconnect Backoff

**Steps:**
1. Open Console
2. Note timestamps of reconnect logs
3. Calculate delays between attempts

**Expected Delays (with ~25% jitter):**
- Attempt 1: ~250ms (187-312ms range)
- Attempt 2: ~500ms (375-625ms range)
- Attempt 3: ~1000ms (750-1250ms range)
- Attempt 4: ~2000ms (1500-2500ms range)
- Attempt 5: ~4000ms (3000-5000ms range)
- Attempt 6+: ~5000ms (3750-6250ms range, capped)

**Expected Results:**
- [ ] Delays increase exponentially
- [ ] Max delay capped at ~5 seconds
- [ ] Jitter visible (not exact values)

**Failed If:**
- ❌ All delays are the same
- ❌ No backoff (constant retry rate)
- ❌ Delays exceed 6-7 seconds

---

### ✅ Test 7: Successful Reconnect

**Steps:**
1. Start with connected state
2. Stop backend server
3. Wait for 2-3 reconnect attempts (check Network tab)
4. Start backend server
5. Observe reconnection

**Expected Results:**
- [ ] Connection succeeds on next attempt
- [ ] Reconnect attempts counter resets to 0
- [ ] Banner disappears immediately
- [ ] Status changes: `disconnected` → `connecting` → `connected`
- [ ] No further reconnect attempts after success

**Failed If:**
- ❌ Continues reconnecting after server is back
- ❌ Banner stays visible after connected
- ❌ Counter doesn't reset

---

### ✅ Test 8: Hard Failure (Stop Reconnect)

**Steps:**
1. Start with connected state
2. Modify backend to return 401 on ws-ticket request
3. Observe behavior

**Expected Results:**
- [ ] One error log: `[WS] Hard failure - auth error`
- [ ] Stops reconnecting (no more attempts)
- [ ] `shouldReconnect` set to false
- [ ] No ongoing request storm

**Failed If:**
- ❌ Continues reconnecting forever on 401
- ❌ Multiple error logs spam console
- ❌ Request storm continues

---

## Summary Checklist

- [ ] Test 1: No request storm ✅
- [ ] Test 2: EmptyError handled ✅
- [ ] Test 3: UI silence (30s delay) ✅
- [ ] Test 4: Clean logs (3 per cycle) ✅
- [ ] Test 5: Mutex works ✅
- [ ] Test 6: Backoff increases ✅
- [ ] Test 7: Reconnect succeeds ✅
- [ ] Test 8: Hard failure stops ✅

---

## Quick Smoke Test (1 Minute)

For fast verification:

1. **Network Tab** → Filter `ws-ticket` → Stop server
   - See: Only 1 request per attempt ✅

2. **Console** → Count logs per attempt
   - See: ~3 lines (reconnect in, ticket ok, connected) ✅

3. **UI** → Watch for banner
   - See: No banner for first 30 seconds ✅

4. **Restart Server** → Watch reconnect
   - See: Connects, banner disappears ✅

**All 4 pass = Fix is working!**

---

## Debugging Tips

### If request storm still occurs:
- Check: `connectInFlight` is set/cleared properly
- Check: No other code calling `connect()` directly
- Check: Timer is cleared before scheduling new one

### If EmptyError still crashes:
- Check: try-catch around `firstValueFrom()`
- Check: Error name check: `error?.name === 'EmptyError'`
- Check: scheduleReconnect() called in catch block

### If banner shows immediately:
- Check: Timer is set to 30_000ms
- Check: effect() is watching status correctly
- Check: Timer cleared when connected

### If logs still verbose:
- Check: Removed step-by-step console.log statements
- Check: Only 3 logs remain per cycle
