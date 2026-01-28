# 🧪 Phase 6 Testing Guide - Angular WebSocket Integration

## Quick Start (2 Minutes)

### 1️⃣ Start Backend
```powershell
cd C:\dev\piza\angular-piza\server
npm run dev
```

**Expected Output**:
```
✅ SearchOrchestrator ready
✅ InMemoryRequestStore initialized
✅ WebSocketManager initialized (path: /ws)
✅ Server listening on http://localhost:3000
```

---

### 2️⃣ Start Frontend
```powershell
cd C:\dev\piza\angular-piza\llm-angular
npm start
```

**Expected Output**:
```
✅ Application bundle generation complete
✅ Compiled successfully
** Angular Live Development Server is listening on localhost:4200 **
```

---

### 3️⃣ Open Browser

Navigate to: **http://localhost:4200**

---

## Test Scenarios

### ✅ Test 1: Async Search (< 1 second)

**Steps**:
1. Type "pizza in tel aviv" in search bar
2. Press Enter or click Search

**Expected**:
- ⏱️ Results appear **instantly** (< 1 second)
- 📝 Assistant area shows "Preparing assistant..."
- ✨ Text starts streaming with blinking cursor ▌
- ✅ Text completes, cursor disappears
- 🎯 No errors in DevTools console

**Console Logs** (should see):
```
[WS] Connecting to ws://localhost:3000/ws
[WS] Connected successfully
[SearchFacade] Async search completed { requestId, resultCount, tookMs }
[WS] Subscribed to req-...
[SearchFacade] Assistant status: streaming
[SearchFacade] Assistant stream complete
[SearchFacade] Recommendations received: 3
```

---

### ✅ Test 2: WebSocket Messages (DevTools)

**Steps**:
1. Open DevTools (F12)
2. Go to **Network** tab
3. Filter: **WS** (WebSocket)
4. Find connection to `ws://localhost:3000/ws`
5. Click on it
6. Go to **Messages** tab
7. Do a search

**Expected Messages**:
```
↑ {"type":"subscribe","requestId":"req-..."}
↓ {"type":"status","requestId":"...","status":"streaming"}
↓ {"type":"stream.delta","requestId":"...","text":"Found "}
↓ {"type":"stream.delta","requestId":"...","text":"10 "}
↓ {"type":"stream.delta","requestId":"...","text":"great "}
↓ {"type":"stream.done","requestId":"...","fullText":"..."}
↓ {"type":"recommendation","requestId":"...","actions":[...]}
↓ {"type":"status","requestId":"...","status":"completed"}
```

---

### ✅ Test 3: Reconnection (Resilience)

**Steps**:
1. Do a search (results appear)
2. Stop backend server (Ctrl+C in server terminal)
3. Wait 2-3 seconds

**Expected**:
- ⚠️ Yellow banner appears: "Reconnecting to server..."
- ✅ Results still visible on screen
- 🔄 Console shows: `[WS] Reconnecting in 1000ms (attempt 1)`

**Steps (continue)**:
4. Restart backend server (`npm run dev`)
5. Wait a few seconds

**Expected**:
- ✅ Banner disappears
- 🎉 Console shows: `[WS] Connected successfully`
- ✅ New search works normally

---

### ✅ Test 4: Race Condition Safety

**Steps**:
1. Type "pizza" and press Enter
2. **IMMEDIATELY** type "burger" and press Enter (< 1 second)
3. Watch the UI

**Expected**:
- ✅ Only **burger** results shown
- ✅ Only **burger** assistant text shown
- ❌ No "pizza" text mixed in
- 📋 Console shows: `[SearchFacade] Ignoring WS message for old request req-pizza-...`

---

### ✅ Test 5: Feature Flag Toggle

**Steps**:
1. Open DevTools Console
2. Check current mode:
   ```javascript
   window['searchFacade'].isAsyncMode()  // Should be true
   ```

3. Disable async mode:
   ```javascript
   window['searchFacade'].setAsyncMode(false)
   ```

4. Do a search

**Expected**:
- ⏱️ Takes 4-6 seconds (sync mode)
- ✅ Assistant appears immediately (not streaming)
- ❌ No WebSocket messages

5. Re-enable async:
   ```javascript
   window['searchFacade'].setAsyncMode(true)
   ```

---

## Visual Checklist

### UI Elements to Verify

- [ ] **Search Bar** - Input works, query submitted
- [ ] **Assistant Summary** - Shows in header area (after search bar)
- [ ] **Streaming Cursor** - Blinking cursor ▌ appears during streaming
- [ ] **Results List** - Appears below assistant
- [ ] **WS Status Banner** - Only appears on disconnect/reconnect
- [ ] **No Layout Shifts** - UI doesn't jump around during streaming
- [ ] **Mobile Responsive** - Works on narrow screens

### States to Test

- [ ] `idle` - Before search (nothing shown)
- [ ] `pending` - After HTTP response, before WS messages (spinner + "Preparing...")
- [ ] `streaming` - During LLM streaming (text + blinking cursor)
- [ ] `completed` - After stream.done (final text, no cursor)
- [ ] `failed` - On error (red background, error message)

---

## Expected Console Logs (Full Flow)

```javascript
// 1. App init
[WS] Connecting to ws://localhost:3000/ws
[WS] Connected successfully

// 2. User searches
[SearchFacade] Async search completed {
  requestId: "req-1768074500000-xyz789",
  resultCount: 12,
  tookMs: 850
}
[WS] Subscribed to req-1768074500000-xyz789

// 3. WebSocket messages
[SearchFacade] Assistant status: streaming
[SearchFacade] Assistant stream complete
[SearchFacade] Recommendations received: 3

// 4. If old requestId messages arrive
[SearchFacade] Ignoring WS message for old request req-...
```

---

## Common Issues

### ❌ "WebSocket connection failed"

**Cause**: Backend not running or wrong port

**Fix**:
```bash
cd server
npm run dev
# Verify: http://localhost:3000/health
```

---

### ❌ Assistant stays "Preparing..." forever

**Cause**: AssistantJobService not starting

**Check Backend Logs**:
```bash
# Should see:
assistant_job_queued { requestId }
assistant_job_started { requestId }
assistant_job_completed { requestId, assistantMs, recommendationCount }
```

**Fix**:
- Verify `OPENAI_API_KEY` is set in backend
- Check backend logs for errors

---

### ❌ Results appear but no assistant

**Check Console**:
```javascript
window['searchFacade'].isAsyncMode()  // Should be true
window['searchFacade'].assistantState()  // Should not be 'idle'
```

**Fix**:
- Verify `environment.features.asyncSearch = true`
- Hard refresh (Ctrl+Shift+R)

---

### ❌ "Reconnecting..." banner stuck

**Cause**: Backend crashed or port blocked

**Fix**:
1. Restart backend server
2. If still stuck, refresh browser
3. Check firewall/antivirus blocking port 3000

---

## Performance Validation

### Metrics to Check (DevTools → Network)

**Async Mode**:
- **search API call**: < 1 second
- **WebSocket messages**: 2-4 seconds total
- **Time to First Byte**: < 500ms

**Sync Mode** (for comparison):
- **search API call**: 4-6 seconds
- **Time to First Byte**: ~4000ms

---

## Developer Tools Commands

```javascript
// Get current state
window['searchFacade'].requestId()
window['searchFacade'].assistantState()
window['searchFacade'].assistantNarration()
window['searchFacade'].recommendations()

// Toggle mode
window['searchFacade'].setAsyncMode(false)  // Sync
window['searchFacade'].setAsyncMode(true)   // Async

// Check WS status
window['searchFacade'].wsConnectionStatus()
```

---

## Success Criteria ✅

All of these should pass:

- [x] Build succeeds (0 errors)
- [ ] Results appear < 1 second in async mode
- [ ] Assistant text streams visibly (cursor blink)
- [ ] Reconnection works (banner shows/hides)
- [ ] Race condition safe (rapid searches)
- [ ] Sync mode still works (feature flag)
- [ ] No console errors during normal flow
- [ ] Mobile responsive (test on narrow screen)

---

**Status**: ✅ **BUILD GREEN - READY FOR MANUAL TESTING**

**Test Time**: ~10 minutes for full checklist

**Next**: Run through test scenarios above, then move to Phase 7 (production readiness)
