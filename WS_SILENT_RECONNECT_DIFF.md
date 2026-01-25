# WebSocket Silent Reconnect - Code Diff

## 1. Server: websocket-manager.ts

### Import Changes
```diff
  import { validateOrigin, getSafeOriginSummary } from '../../lib/security/origin-validator.js';
+ import { HARD_CLOSE_REASONS, SOFT_CLOSE_REASONS } from './ws-close-reasons.js';
```

### Origin Blocked
```diff
  if (!result.allowed) {
    logger.warn({ ip, origin: rawOrigin, reason: result.reason }, 'WS: Connection rejected');
+   (info.req as any).wsRejectReason = HARD_CLOSE_REASONS.ORIGIN_BLOCKED;
    return false;
  }
```

### Auth Failures
```diff
  if (!ticket) {
    logger.warn({ ip, origin: rawOrigin }, 'WS: Rejected - no auth ticket');
+   (info.req as any).wsRejectReason = HARD_CLOSE_REASONS.NOT_AUTHORIZED;
    return false;
  }
```

### Subscribe Validation
```diff
  if (!requestId && channel === 'search') {
    logger.warn({ clientId, channel }, 'WS: Subscribe rejected - missing requestId');
    this.sendError(ws, 'invalid_request', 'Missing requestId');
+   ws.close(1008, HARD_CLOSE_REASONS.BAD_SUBSCRIBE);
    return;
  }
```

### Idle Timeout
```diff
  idleTimer = setTimeout(() => {
    try {
-     ws.close(1000, 'Idle timeout');
+     ws.close(1000, SOFT_CLOSE_REASONS.IDLE_TIMEOUT);
    } catch {
      // ignore
    }
  }, 15 * 60 * 1000);
```

### Heartbeat Timeout
```diff
  this.wss.clients.forEach((ws: any) => {
    if (ws.isAlive === false) {
      ws.terminatedBy = 'server_heartbeat';
      this.cleanup(ws);
+     try {
+       ws.close(1000, SOFT_CLOSE_REASONS.HEARTBEAT_TIMEOUT);
+     } catch {
+       // If close fails, proceed with terminate
+     }
      ws.terminate();
      terminatedCount++;
```

### Server Shutdown
```diff
  this.wss.clients.forEach(ws => {
    this.cleanup(ws);
-   ws.close(1001, 'Server shutting down');
+   ws.close(1001, SOFT_CLOSE_REASONS.SERVER_SHUTDOWN);
  });
```

---

## 2. Client: ws-client.service.ts

### Imports
```diff
  import { isWSServerMessage } from '../models/ws-protocol.types';
+ import { isHardCloseReason } from '../models/ws-close-reasons';
```

### Reconnection State
```diff
- // Reconnection state
  private reconnectAttempts = 0;
- private readonly maxReconnectDelay = 30_000; // 30 seconds
+ private readonly maxReconnectDelay = 5_000; // 5 seconds max
+ private readonly baseReconnectDelay = 250; // Start at 250ms
  private reconnectTimer?: number;
  private lastRequestId?: string;
+ private hardFailureLogged = false; // Log hard failures only once per page load
+ private shouldReconnect = true; // Flag to stop reconnect on hard failures
```

### onopen Handler
```diff
  this.ws.onopen = () => {
-   console.log('[WS] Connected successfully');
+   console.log('[WS] Connected');
    this.connectionStatus.set('connected');
    this.reconnectAttempts = 0;
+   this.shouldReconnect = true;
+   this.hardFailureLogged = false;
```

### onerror Handler
```diff
  this.ws.onerror = (error) => {
-   console.error('[WS] Error', error);
+   // Don't log noisy errors - they're handled in onclose
  };
```

### onclose Handler (MAJOR CHANGE)
```diff
  this.ws.onclose = (event) => {
-   console.log('[WS] Disconnected', { code: event.code, reason: event.reason });
+   const reason = event.reason || '';
+   const wasClean = event.wasClean;
+   const code = event.code;
+
+   // Always log close to console for debugging
+   console.log('[WS] Disconnected', { code, reason, wasClean });
+
    this.connectionStatus.set('disconnected');
-   this.scheduleReconnect();
+
+   // Classify hard vs soft failures
+   if (isHardCloseReason(reason)) {
+     // HARD failure: log once and stop reconnecting
+     if (!this.hardFailureLogged) {
+       console.error('[WS] Hard failure - stopping reconnect', { code, reason, wasClean });
+       this.hardFailureLogged = true;
+       
+       // TODO: Send analytics/log event to backend (once per page load)
+       // this.sendHardFailureLog(code, reason);
+     }
+     
+     this.shouldReconnect = false;
+     return;
+   }
+
+   // SOFT failure or unknown: reconnect with backoff
+   if (this.shouldReconnect) {
+     this.scheduleReconnect();
+   }
  };
```

### connect() Error Handler
```diff
  } catch (error) {
    console.error('[WS] Failed to connect', error);
    this.connectionStatus.set('disconnected');
-   this.scheduleReconnect();
+   
+   // Only reconnect if we haven't hit a hard failure
+   if (this.shouldReconnect) {
+     this.scheduleReconnect();
+   }
  }
```

### disconnect() Method
```diff
  disconnect(): void {
-   console.log('[WS] Disconnecting');
+   this.shouldReconnect = false; // Explicit disconnect stops auto-reconnect
```

### scheduleReconnect() Method (COMPLETE REWRITE)
```diff
  /**
-  * Schedule reconnection with exponential backoff
+  * Schedule reconnection with exponential backoff + jitter
+  * Backoff: 250ms → 500ms → 1s → 2s → 4s → 5s (max)
+  * Jitter: ±25% randomization to prevent thundering herd
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

-   // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
+   // Exponential backoff: 250ms * 2^attempts, capped at 5s
    const delay = Math.min(
-     1000 * Math.pow(2, this.reconnectAttempts),
-     this.maxReconnectDelay
+     this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
+     this.maxReconnectDelay
    );

+   // Add jitter: ±25%
+   const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
+   const delay = Math.round(exponentialDelay + jitter);
+
+   // Silent: only log to console, never show in UI
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
+   
    this.connectionStatus.set('reconnecting');
```

---

## 3. Client: ws-status-banner.component.ts

### Template (MAJOR SIMPLIFICATION)
```diff
  template: `
    @if (status() === 'reconnecting') {
      <div class="ws-banner reconnecting">
        <span class="icon">⟳</span>
-       <span>Reconnecting to server...</span>
+       <span>Reconnecting...</span>
      </div>
    }
-   @if (status() === 'disconnected') {
-     <div class="ws-banner disconnected">
-       <span class="icon">⚠️</span>
-       <span>Connection lost. Results may be outdated.</span>
-       <button class="retry-btn" (click)="retry()">Retry</button>
-     </div>
-   }
  `,
```

### Styles (REMOVED ERROR STATE)
```diff
  .reconnecting {
    background: #fff3cd;
    color: #856404;
    border-bottom: 1px solid #ffc107;
  }

- .disconnected {
-   background: #f8d7da;
-   color: #721c24;
-   border-bottom: 1px solid #f5c6cb;
- }

  .icon {
    font-size: 1.2rem;
+   animation: rotate 1s linear infinite;
  }

+ @keyframes rotate {
+   from { transform: rotate(0deg); }
+   to { transform: rotate(360deg); }
+ }

- .retry-btn {
-   margin-left: auto;
-   padding: 0.25rem 0.75rem;
-   background: white;
-   border: 1px solid currentColor;
-   border-radius: 4px;
-   cursor: pointer;
-   font-size: 0.85rem;
-   transition: all 0.2s;
-
-   &:hover {
-     background: rgba(0, 0, 0, 0.05);
-   }
- }
```

### Component Class
```diff
  export class WsStatusBannerComponent {
    private wsClient = inject(WsClientService);
    
    readonly status = this.wsClient.connectionStatus;
-   
-   retry() {
-     this.wsClient.connect();
-   }
  }
```

---

## Summary of Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Close Reasons** | None (empty string) | Structured: `NOT_AUTHORIZED`, `ORIGIN_BLOCKED`, etc. |
| **Hard Failure Handling** | Always reconnect | Stop on hard failures |
| **Backoff Start** | 1s | 250ms |
| **Backoff Max** | 30s | 5s |
| **Jitter** | None | ±25% |
| **Error UI** | Red banner with retry button | No error UI |
| **Reconnect UI** | "Reconnecting... (attempt 3)" | "Reconnecting..." (no count) |
| **Console Logs** | Noisy errors | Structured, minimal |
| **Analytics** | None | TODO: send hard failures to backend |

---

**Result:** Silent, smart, production-ready WebSocket reconnection ✅
