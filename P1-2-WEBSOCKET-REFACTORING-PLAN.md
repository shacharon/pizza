# P1-2: WebSocket Manager Modularization Plan

**Current State**: Partially refactored (704 lines)  
**Goal**: Further extract responsibilities while preserving exact behavior  
**Date**: 2026-01-30

## Current Architecture

### Already Extracted ✅
1. **connection-handler.ts** - Setup, close, error, heartbeat execution
2. **backlog-manager.ts** - Backlog queue management
3. **pending-subscriptions.ts** - Pending subscription tracking
4. **subscription-manager.ts** - Active subscription management
5. **auth-verifier.ts** - Client verification
6. **websocket.config.ts** - Configuration resolution

### Remaining in Main Class (704 lines)

## Proposed Additional Extractions

### 1. LegacyProtocolAdapter
**Location**: Lines 154-165 in handleMessage()  
**Purpose**: Normalize legacy message formats

**Current Code**:
```typescript
// Normalize requestId from various legacy locations
if (message && message.type === 'subscribe' && !message.requestId) {
  if (message.payload?.requestId) {
    message.requestId = message.payload.requestId;
  } else if ((message as any).data?.requestId) {
    message.requestId = (message as any).data.requestId;
  } else if ((message as any).reqId) {
    message.requestId = (message as any).reqId;
  }
}
```

**Extract To**: `websocket/message-normalizer.ts`

**New Interface**:
```typescript
export function normalizeLegacyMessage(message: any, clientId: string): any {
  // Normalize requestId from various legacy locations
  // Keep logging identical
  return normalizedMessage;
}
```

### 2. MessageRouter
**Location**: Lines 238-325 (handleClientMessage)  
**Purpose**: Route and validate client messages

**Current Responsibilities**:
- Switch on message.type
- Rate limiting checks
- Auth checks  
- Delegation to handlers

**Extract To**: `websocket/message-router.ts`

**New Interface**:
```typescript
export class MessageRouter {
  constructor(
    private checkRateLimit: (ws: WebSocket) => boolean,
    private subscriptionManager: SubscriptionManager,
    // ... other dependencies
  ) {}
  
  async routeMessage(
    ws: WebSocket,
    message: WSClientMessage,
    clientId: string
  ): Promise<void>
}
```

### 3. SubscriptionResponseHandler
**Location**: Lines 394-436 (sendSubAck, sendSubNack)  
**Purpose**: Send subscription protocol responses

**Extract To**: `websocket/subscription-responses.ts`

**New Interface**:
```typescript
export class SubscriptionResponseHandler {
  sendSubAck(ws: WebSocket, channel: WSChannel, requestId: string, pending: boolean): void
  sendSubNack(ws: WebSocket, channel: WSChannel, requestId: string, reason: string): void
}
```

### 4. RateLimiter  
**Location**: Lines 36-58 (interface), 210-236 (checkRateLimit)  
**Purpose**: Per-socket rate limiting with token bucket

**Extract To**: `websocket/rate-limiter.ts`

**New Interface**:
```typescript
export class WebSocketRateLimiter {
  constructor(config: RateLimitConfig) {}
  checkAndConsume(ws: WebSocket): boolean
}
```

### 5. LifecycleCoordinator
**Location**: Lines 613-680 (startHeartbeat, sendConnectionStatus, shutdown)  
**Purpose**: Coordinate lifecycle events

**Extract To**: `websocket/lifecycle-coordinator.ts`

**New Interface**:
```typescript
export class LifecycleCoordinator {
  startHeartbeat(cleanup: (ws: WebSocket) => void): void
  sendConnectionStatus(ws: WebSocket, state: ConnectionState): void
  shutdown(clients: Set<WebSocket>, cleanup: (ws: WebSocket) => void): void
}
```

## Implementation Priority

### Phase 1: Low-Risk Extractions (Start Here)
1. **LegacyProtocolAdapter** - Pure function, easy to test
2. **SubscriptionResponseHandler** - Isolated, no complex dependencies
3. **RateLimiter** - Self-contained logic

### Phase 2: Medium-Risk Extractions  
4. **LifecycleCoordinator** - Has interval management
5. **MessageRouter** - Central dispatch logic

## Non-Goals (Already Well-Organized)
- ❌ Don't touch connection-handler.ts (already clean)
- ❌ Don't touch backlog-manager.ts (already clean)
- ❌ Don't touch subscription-manager.ts (already clean)

## Public API (Must Remain Unchanged)

```typescript
export class WebSocketManager {
  constructor(server: HTTPServer, config?: Partial<WebSocketManagerConfig>)
  
  // Public methods (DO NOT CHANGE)
  activatePendingSubscriptions(requestId: string, ownerSessionId: string): void
  subscribe(requestId: string, client: WebSocket): void  // @deprecated
  publishToChannel(channel: WSChannel, requestId: string, sessionId: string | undefined, message: WSServerMessage): PublishSummary
  publish(requestId: string, message: WSServerMessage): PublishSummary  // legacy
  shutdown(): void
  getStats(): WebSocketStats
}
```

## Log Event Names (Must Remain Unchanged)
- `websocket_published`
- `websocket_subscribed`
- `websocket_unsubscribed`
- `websocket_event_received`
- `websocket_action_clicked`
- `websocket_ui_state_changed`
- `subscribe_rate_limited`
- All others in connection-handler

## Testing Strategy
- Run existing tests after each extraction
- No new test files needed unless behavior clarification required
- Focus on preserving exact behavior

## Success Criteria
✅ WebSocketManager < 400 lines  
✅ All existing tests pass  
✅ No changes to public API  
✅ No changes to log event names  
✅ No changes to runtime behavior  
✅ Improved SOLID compliance  

## Estimated Impact
- **Before**: 704 lines in main class
- **After**: ~350-400 lines in main class
- **New files**: 5 focused modules
- **Risk**: Low (incremental, well-tested)
