# Stale Results Fix - Request ID Tracking

## Problem
UI shows previous search results when starting a new search, causing confusion and incorrect data display.

**Root Causes:**
1. Old results/chips/assistant messages not cleared when new search starts
2. WebSocket events from old searches processed after new search begins
3. On WS reconnection, resubscribed to ALL past requests (not just current)
4. No requestId validation in event handlers

## Solution

### 1. **State Clearing on New Search** (`search.store.ts`)

Added `clearState()` method to clear all search state while preserving query:

```typescript
clearState(): void {
  this._loading.set(false);
  this._error.set(null);
  this._response.set(null); // Clears results, chips, assist, groups, etc.
}
```

### 2. **Request ID Lifecycle** (`search.facade.ts`)

**On new search submission:**
```typescript
async search(query: string, filters?: SearchFilters): Promise<void> {
  // 1. Clear ALL state BEFORE starting new search
  this.searchStore.clearState(); // Results, chips, error
  this.assistantHandler.reset(); // All assistant messages
  
  // 2. Clear currentRequestId (events from old search now ignored)
  this.currentRequestId.set(undefined);
  
  // 3. Clear WS subscriptions to old requests
  this.wsHandler.clearAllSubscriptions();
  
  // 4. Set loading state
  this.searchStore.setLoading(true);
  
  // 5. Make API call -> get new requestId
  const response = await this.apiHandler.executeSearch(...);
  
  // 6. Set new requestId
  this.currentRequestId.set(response.requestId);
  
  // 7. Subscribe to new requestId
  this.wsHandler.subscribeToRequest(requestId, sessionId);
}
```

### 3. **Event Filtering** (`search-ws.facade.ts`)

**Already implemented - validates requestId on all events:**

```typescript
handleMessage(msg: WSServerMessage, currentRequestId: string | undefined, ...) {
  // REQUESTID SCOPING: Ignore messages for old/different requests
  if ('requestId' in msg && (msg as any).requestId) {
    const msgRequestId = (msg as any).requestId;

    // No active search - ignore all request-specific messages
    if (!currentRequestId) {
      console.debug('[SearchWsHandler] Ignoring message - no active search');
      return true; // ✅ IGNORE
    }

    // Different requestId - ignore (old search)
    if (msgRequestId !== currentRequestId) {
      console.debug('[SearchWsHandler] Ignoring message from old request', {
        msgRequestId,
        currentRequestId
      });
      return true; // ✅ IGNORE
    }
  }
  
  // Process event...
}
```

### 4. **Subscription Management** (`ws-subscriptions.ts`)

Added `clearAllSubscriptions()` to unsubscribe from all old requests:

```typescript
clearAllSubscriptions(): void {
  // Unsubscribe from all active subscriptions
  for (const sub of this.subscriptions.values()) {
    const message = this.buildMessage('unsubscribe', {
      requestId: sub.requestId,
      channel: sub.channel,
      sessionId: sub.sessionId
    });
    this.sendOrQueue('unsubscribe', this.makeKey(sub), message);
  }
  
  // Clear subscription tracking
  this.subscriptions.clear();
  this.pending.clear();
}
```

**On WS reconnect:**
- Only resubscribes to subscriptions in `this.subscriptions` map
- Since we cleared old subscriptions, only current requestId is resubscribed ✅

### 5. **Full Stack Trace**

```
User clicks Search A
├─ search.facade.ts: search("A")
│  ├─ clearState() + reset() + clearAllSubscriptions()
│  ├─ currentRequestId = undefined
│  ├─ POST /search → {requestId: "req_A"}
│  ├─ currentRequestId = "req_A"
│  └─ subscribeToRequest("req_A")
│
├─ WebSocket: Events for "req_A" arrive
│  └─ handleMessage: msgRequestId="req_A" === currentRequestId="req_A" ✅ PROCESS
│
User clicks Search B (BEFORE A completes)
├─ search.facade.ts: search("B")
│  ├─ clearState() + reset() + clearAllSubscriptions()
│  │  └─ unsubscribe("req_A") sent to server
│  ├─ currentRequestId = undefined
│  ├─ POST /search → {requestId: "req_B"}
│  ├─ currentRequestId = "req_B"
│  └─ subscribeToRequest("req_B")
│
├─ WebSocket: Late event for "req_A" arrives
│  └─ handleMessage: msgRequestId="req_A" !== currentRequestId="req_B" ❌ IGNORE
│
├─ WebSocket: Events for "req_B" arrive
│  └─ handleMessage: msgRequestId="req_B" === currentRequestId="req_B" ✅ PROCESS
│
WebSocket reconnects
├─ onConnected()
│  ├─ subscriptions.size = 1 (only "req_B")
│  └─ resubscribe("req_B") ✅ Only current request
```

## Testing

### Manual Test: Rapid Search Switching

1. **Start Search A:**
   ```
   Input: "pizza tel aviv"
   → currentRequestId = "req_A"
   → Results appear
   ```

2. **Immediately start Search B (before A finishes):**
   ```
   Input: "sushi jerusalem"
   → clearState() clears results
   → currentRequestId = undefined (temporarily)
   → clearAllSubscriptions() unsubscribes from "req_A"
   → currentRequestId = "req_B"
   → subscribeToRequest("req_B")
   ```

3. **Expected behavior:**
   - Results from "req_A" do NOT appear (ignored by requestId filter)
   - Results from "req_B" appear correctly
   - No mixed results from both searches

### Debug Logging (Already Present)

Enable debug logging in browser console:

```javascript
// In search-ws.facade.ts
console.debug('[SearchWsHandler] Ignoring message from old request', {
  msgRequestId: 'req_A',
  currentRequestId: 'req_B'
});
```

**Look for these logs:**
- `Ignoring message - no active search` → Event arrived with no currentRequestId
- `Ignoring message from old request` → Event from previous search ignored ✅

### Test: WebSocket Reconnection

1. **Start Search A:**
   ```
   → currentRequestId = "req_A"
   → Results appear
   ```

2. **Disconnect WebSocket** (simulate network drop)

3. **Start Search B:**
   ```
   → clearAllSubscriptions() (unsubscribe "req_A")
   → currentRequestId = "req_B"
   → subscribeToRequest("req_B")
   ```

4. **WebSocket reconnects:**
   ```
   → onConnected() resubscribes ALL active subscriptions
   → subscriptions.size = 1 (only "req_B")
   → resubscribe("req_B") ✅
   ```

5. **Expected behavior:**
   - NO resubscription to "req_A"
   - Only "req_B" events delivered
   - No stale results

## State Cleared on New Search

When `search(query)` is called:

| State | Method | What's Cleared |
|-------|--------|----------------|
| **Results** | `searchStore.clearState()` | `_response.set(null)` → clears results array |
| **Chips** | `searchStore.clearState()` | Computed from response → cleared |
| **Assistant** | `assistantHandler.reset()` | All messages (line + card channels) |
| **Error** | `searchStore.clearState()` | `_error.set(null)` |
| **Loading** | `searchStore.setLoading(true)` | Reset to true for new search |
| **RequestId** | `currentRequestId.set(undefined)` | Temporarily cleared, then set to new ID |
| **WS Subscriptions** | `wsHandler.clearAllSubscriptions()` | Unsubscribe from all old requests |
| **Card State** | `_cardState.set('RUNNING')` | Reset to RUNNING |

## Files Modified

1. ✅ `llm-angular/src/app/state/search.store.ts`
   - Added `clearState()` method

2. ✅ `llm-angular/src/app/facades/search.facade.ts`
   - Clear state before new search
   - Clear currentRequestId before new search
   - Clear WS subscriptions before new search

3. ✅ `llm-angular/src/app/facades/search-ws.facade.ts`
   - Added `clearAllSubscriptions()` method
   - Already has requestId filtering in `handleMessage()`

4. ✅ `llm-angular/src/app/core/services/ws-client.service.ts`
   - Added `clearAllSubscriptions()` public API

5. ✅ `llm-angular/src/app/core/services/ws/ws-subscriptions.ts`
   - Added `clearAllSubscriptions()` implementation
   - Unsubscribes from all active subscriptions
   - Clears subscription map

## Edge Cases Handled

### 1. Search A → Search B (rapid switching)
- ✅ State cleared before B starts
- ✅ Events from A ignored (requestId mismatch)
- ✅ Only B results shown

### 2. Search A → WS disconnect → Search B → WS reconnect
- ✅ On reconnect, only B is resubscribed (A was cleared)
- ✅ No stale A events delivered

### 3. Search A → API timeout → Search B
- ✅ State cleared, A results never shown
- ✅ B proceeds independently

### 4. No active search + old WS events arrive
- ✅ Events ignored (currentRequestId = undefined)

### 5. Search A completes → User waits → Search B starts
- ✅ A results cleared before B starts
- ✅ No overlap

## Debugging Tips

### If seeing stale results:

1. **Check currentRequestId:**
   ```typescript
   console.log('Current requestId:', this.currentRequestId());
   ```

2. **Check event requestId:**
   ```typescript
   console.log('Event requestId:', msg.requestId);
   ```

3. **Verify state cleared:**
   ```typescript
   // Should log empty array after clearState()
   console.log('Results:', this.searchStore.results());
   ```

4. **Check WS subscriptions:**
   ```typescript
   // Should log 0 after clearAllSubscriptions()
   console.log('Active subs:', wsClient.getActiveSubscriptionsCount());
   ```

### If events from old search still processed:

1. **Verify handleMessage() filtering:**
   - Check if `msgRequestId !== currentRequestId` → should return early
   - Look for debug log: "Ignoring message from old request"

2. **Verify clearAllSubscriptions() called:**
   - Check if `clearAllSubscriptions()` is in search() method
   - Look for log: "[WS] Cleared all subscriptions"

## Performance Impact

- ✅ **Minimal overhead:** Only adds one signal check per WS event
- ✅ **No extra API calls:** Reuses existing WS subscription protocol
- ✅ **Faster perceived performance:** No stale results = cleaner UX

## Result

✅ **Fixed:** UI no longer shows stale results from previous searches  
✅ **Fixed:** WS reconnection only resubscribes to current request  
✅ **Fixed:** All state cleared before new search starts  
✅ **Fixed:** RequestId validation on all WS events  

🎉 **Clean slate for every search!**
