# Polling + WebSocket Contract Update

## Summary

Updated Angular SearchFacade to implement optimized polling strategy with WebSocket-first approach.

## Files Modified

1. **`llm-angular/src/app/facades/search.facade.ts`**
   - Added `pollingStartTimeoutId` for 3s delayed polling start
   - Replaced fixed-interval polling with jittered + backoff strategy
   - Enhanced WS event handlers for `search_progress`, `search_done`, `search_failed`
   - Updated `cancelPolling()` to clear all three timer types

## Polling Configuration

### Phase 1: Delayed Start
- **Delay**: `3000ms` (3 seconds)
- **Purpose**: If WebSocket delivers progress/done within 3s, polling never starts
- **Cancellation**: Any WS `progress` event cancels the polling start timeout

### Phase 2: Fast Polling (0-12 seconds)
- **Base Interval**: `1400ms`
- **Jitter**: `±200ms` (random 1200-1600ms per poll)
- **Purpose**: Quick result retrieval with randomization to avoid thundering herd

### Phase 3: Slow Polling (12-45 seconds)
- **Interval**: `4000ms` (4 seconds)
- **Backoff Trigger**: After `12000ms` (12 seconds) elapsed
- **Purpose**: Reduce backend load for slow searches

### Phase 4: Max Duration
- **Timeout**: `45000ms` (45 seconds total)
- **Behavior**: Stop polling, keep WebSocket listening
- **Purpose**: Prevent infinite polling, rely on WS for late results

## WebSocket Event Handling

### `search_progress`
```typescript
{
  type: "progress",
  requestId: "req-...",
  stage: "gate2" | "intent" | "route_llm" | "google",
  status: "running",
  progress: 0-100,
  message: "Processing search"
}
```
**Action**: Cancel `pollingStartTimeoutId` (prevent polling from starting)

### `search_done`
```typescript
{
  type: "ready",
  requestId: "req-...",
  stage: "done",
  ready: "results",
  decision: "CONTINUE",
  resultCount: 20
}
```
**Action**: 
1. Cancel all polling timers
2. Fetch authoritative result via `GET /api/v1/search/:requestId/result`
3. Call `handleSearchResponse()`

### `search_failed`
```typescript
{
  type: "error",
  requestId: "req-...",
  stage: "done",
  code: "SEARCH_FAILED" | "TIMEOUT",
  message: "Error description"
}
```
**Action**:
1. Cancel all polling timers
2. Set error state in store
3. Show error to user

## Timer Cleanup

The `cancelPolling()` method now clears all three timer types:

```typescript
private cancelPolling(): void {
  if (this.pollingStartTimeoutId) {
    clearTimeout(this.pollingStartTimeoutId);
    this.pollingStartTimeoutId = undefined;
  }
  if (this.pollingIntervalId) {
    clearTimeout(this.pollingIntervalId);
    this.pollingIntervalId = undefined;
  }
  if (this.pollingTimeoutId) {
    clearTimeout(this.pollingTimeoutId);
    this.pollingTimeoutId = undefined;
  }
}
```

Called on:
- New search start
- WS `search_done` received
- WS `search_failed` received
- Max duration timeout (45s)
- Component cleanup

## Jittered Polling Implementation

Uses recursive `setTimeout` instead of `setInterval` for per-tick jitter:

```typescript
const scheduleNextPoll = () => {
  const elapsed = Date.now() - startTime;
  const useSlow = elapsed > BACKOFF_AT; // 12s
  const interval = useSlow 
    ? SLOW_INTERVAL // 4000ms
    : FAST_INTERVAL_BASE + (Math.random() * FAST_JITTER * 2 - FAST_JITTER); // 1200-1600ms

  this.pollingIntervalId = setTimeout(async () => {
    // Poll logic...
    scheduleNextPoll(); // Schedule next poll
  }, interval);
};
```

## Expected Behavior

### Scenario 1: Fast WebSocket (< 3s)
```
T+0s    → POST 202, WS subscribe, schedule polling start at T+3s
T+0.5s  → WS progress event → cancel polling start
T+2s    → WS progress event
T+5s    → WS done event → fetch result
Result: Zero HTTP polls (WebSocket only)
```

### Scenario 2: Slow WebSocket (3-12s)
```
T+0s    → POST 202, WS subscribe, schedule polling start at T+3s
T+3s    → No WS yet → start fast polling (1200-1600ms jitter)
T+4.4s  → Poll 1 → 202 PENDING
T+5.8s  → Poll 2 → 202 PENDING
T+7s    → WS done event → cancel polling, fetch result
Result: 2-3 HTTP polls + WebSocket
```

### Scenario 3: No WebSocket (12-45s)
```
T+0s    → POST 202, WS subscribe, schedule polling start at T+3s
T+3s    → Start fast polling (1200-1600ms jitter)
T+4.4s  → Poll 1 → 202 PENDING
T+5.8s  → Poll 2 → 202 PENDING
...
T+12s   → Switch to slow polling (4000ms)
T+16s   → Poll N → 202 PENDING
T+20s   → Poll N+1 → 200 DONE → handle result
Result: ~8 fast polls + 2 slow polls
```

### Scenario 4: Very Slow (> 45s)
```
T+0s    → POST 202, start polling at T+3s
T+45s   → Max duration → stop polling
T+50s   → WS done event → fetch result
Result: Polling stops, WebSocket delivers late result
```

## Benefits

✅ **Reduced Backend Load**: 3s delay eliminates polling for fast searches (most cases)  
✅ **Thundering Herd Protection**: Jitter spreads poll requests across time  
✅ **Adaptive Backoff**: Slower polling for slow searches reduces load  
✅ **WebSocket First**: Polling is truly a fallback, not primary mechanism  
✅ **Bounded Duration**: 45s max prevents infinite polling  
✅ **Race Safety**: All timers canceled on completion or new search  

## Configuration Constants

```typescript
const DELAY_MS = 3000;           // Polling start delay
const FAST_INTERVAL_BASE = 1400; // Fast poll base interval
const FAST_JITTER = 200;         // ±200ms jitter
const SLOW_INTERVAL = 4000;      // Slow poll interval
const BACKOFF_AT = 12000;        // Switch to slow at 12s
const MAX_DURATION = 45000;      // Stop polling at 45s
```

All values are in milliseconds and can be tuned in `search.facade.ts`.
