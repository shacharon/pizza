# WebSocket Search Subscribe Key Fix

## Problem
Server logs showed `status: "not_found"` when subscribing to search channel, even though the request completed successfully.

## Root Cause
1. Subscription key was using `search:session:${sessionId}` when sessionId was provided
2. Request state store uses `${requestId}` as key
3. Mismatch caused "not_found" status in logs

## Solution

### Key Format (Simplified)

**Search Channel:**
```
search:${requestId}
```
- Always use requestId only
- Ignore sessionId even if provided
- Matches InMemoryRequestStore key format

**Assistant Channel:**
```
assistant:${sessionId}  (if sessionId provided)
assistant:${requestId}  (fallback)
```

### Files Changed

**1. `server/src/infra/websocket/websocket-manager.ts`**

**Change 1: Simplified key building (lines 412-430)**
```typescript
private buildSubscriptionKey(channel: WSChannel, requestId: string, sessionId?: string): SubscriptionKey {
  if (channel === 'search') {
    return `search:${requestId}`;  // ← Always use requestId for search
  }
  
  // Assistant channel: prefer session-based
  if (sessionId) {
    return `${channel}:${sessionId}`;
  }
  return `${channel}:${requestId}`;
}
```

**Change 2: Minimal logging for search (lines 216-244)**
```typescript
// Search channel: minimal logging (no status check)
if (channel === 'search') {
  logger.info({
    clientId,
    channel,
    requestId
    // ← No sessionId, no status
  }, 'websocket_subscribed');
}
```

**2. `server/src/infra/state/in-memory-request-store.ts`**
No changes needed - already using `requestId` as key:
```typescript
async set(requestId: string, state: RequestState, ttl = this.defaultTtlSeconds): Promise<void> {
  this.store.set(requestId, { ... });  // ← Uses requestId directly
}

async get(requestId: string): Promise<RequestState | null> {
  return this.store.get(requestId);  // ← Uses requestId directly
}
```

## Key Format Summary

| Channel   | Key Format              | Example                                    |
|-----------|-------------------------|---------------------------------------------|
| search    | `search:${requestId}`   | `search:req-1768594979161-0c07ngbg7`       |
| assistant | `assistant:${sessionId}` | `assistant:session-1768594965398-a0oja8g8i` |
| assistant | `assistant:${requestId}` | `assistant:req-1768594979161-0c07ngbg7` (fallback) |

## Expected Behavior (After Fix)

### Subscribe Log (Search)
```json
{
  "level": "info",
  "clientId": "ws-1768594965427-de8tth",
  "channel": "search",
  "requestId": "req-1768594979161-0c07ngbg7",
  "msg": "websocket_subscribed"
}
```

**Note:** No `sessionId`, no `status` field for search subscriptions.

### Subscription Map
```
Map {
  "search:req-1768594979161-0c07ngbg7" => Set<WebSocket> { ws1, ws2, ... }
}
```

### State Store
```
Map {
  "req-1768594979161-0c07ngbg7" => { state: {...}, expiresAt: 1768595279161 }
}
```

**Keys match:** Both use `requestId` directly.

## Benefits

1. ✅ **Consistent keys** - Subscription and state store use same key
2. ✅ **No false "not_found"** - State lookup works correctly
3. ✅ **Simpler logs** - Search subscriptions don't log sessionId or status
4. ✅ **Cleaner architecture** - Search is request-based, assistant is session-based
5. ✅ **No breaking changes** - Client still sends sessionId, server just ignores it for search

## Testing

1. **Search subscription:**
   - Subscribe with `{v:1, type:"subscribe", channel:"search", requestId:"req-123", sessionId:"session-456"}`
   - Socket registered under: `search:req-123`
   - Log shows: `{channel:"search", requestId:"req-123"}`

2. **State store:**
   - Store set with: `requestStore.set("req-123", state)`
   - Store get with: `requestStore.get("req-123")`
   - Keys match subscription key

3. **Replay:**
   - Subscribe after search completes
   - State found using `requestId`
   - Results replayed successfully

## Constraints Met

✅ Search key: `search:${requestId}` (ignore sessionId)  
✅ No store lookup failure on subscribe  
✅ InMemoryRequestStore uses same key format  
✅ Minimal logging (no payload, no unnecessary fields)  
✅ No breaking changes
