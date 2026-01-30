# WebSocket Silent Reconnect - Quick Patch Summary

## Files Changed

### New Files (2)
1. `server/src/infra/websocket/ws-close-reasons.ts` - Shared close reason constants
2. `llm-angular/src/app/core/models/ws-close-reasons.ts` - Client copy of constants

### Modified Files (3)
1. `server/src/infra/websocket/websocket-manager.ts` - Send structured close reasons
2. `llm-angular/src/app/core/services/ws-client.service.ts` - Classify failures + silent reconnect
3. `llm-angular/src/app/shared/components/ws-status-banner/ws-status-banner.component.ts` - Remove error UI

## Key Changes

### Server
```typescript
// Before
ws.close(1008); // No reason

// After
ws.close(1008, 'NOT_AUTHORIZED'); // Structured reason
```

### Client
```typescript
// Before
this.ws.onclose = (event) => {
  console.log('[WS] Disconnected');
  this.scheduleReconnect(); // Always reconnect
};

// After
this.ws.onclose = (event) => {
  const reason = event.reason;
  console.log('[WS] Disconnected', { code, reason, wasClean });
  
  if (isHardCloseReason(reason)) {
    console.error('[WS] Hard failure - stopping reconnect');
    this.shouldReconnect = false;
    return;
  }
  
  if (this.shouldReconnect) {
    this.scheduleReconnect(); // Only on soft failures
  }
};
```

### Backoff
```typescript
// Before: 1s → 2s → 4s → 8s → 16s → 30s (max)
const delay = Math.min(1000 * Math.pow(2, attempts), 30_000);

// After: 250ms → 500ms → 1s → 2s → 4s → 5s (max) + jitter
const exponentialDelay = Math.min(250 * Math.pow(2, attempts), 5_000);
const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
const delay = Math.round(exponentialDelay + jitter);
```

## Testing Commands

### Local Test (Dev Server)
```bash
# Terminal 1: Start server
cd server
npm run dev

# Terminal 2: Start client
cd llm-angular
ng serve

# Open browser: http://localhost:4200
# Test: Refresh page 5x → no error UI
```

### Production Test
```bash
# Open production app
# URL: https://app.going2eat.food
# WebSocket: wss://api.going2eat.food/ws

# Test: Refresh page 5x
# Expected: Silent reconnect, no errors
```

### Console Output (Success)
```
[WS] Disconnected { code: 1006, reason: '', wasClean: false }
[WS] Reconnecting in 245ms (attempt 1)
[WS] Connected
```

### Console Output (Hard Failure)
```
[WS] Disconnected { code: 1008, reason: 'NOT_AUTHORIZED', wasClean: true }
[WS] Hard failure - stopping reconnect { code: 1008, reason: 'NOT_AUTHORIZED' }
```

## Deployment Order

1. ✅ Deploy server first (backward compatible)
2. ✅ Deploy client after (starts using new logic)
3. ✅ Monitor logs for hard failures

## Acceptance Criteria

- ✅ Page refresh: no error UI, silent reconnect
- ✅ Hard failure (auth/origin): stops reconnect, logs once
- ✅ Soft failure (network): reconnects with backoff
- ✅ Banner: shows only "Reconnecting..." (no error state)
- ✅ Backoff: 250ms → 5s max with jitter

---

**Full documentation:** See `WS_SILENT_RECONNECT_FIX.md`
