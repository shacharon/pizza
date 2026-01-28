# WebSocket Authentication Fix

## Problem
WebSocket connection was failing with "No auth token available" because:
1. It was reading from `localStorage.getItem('authToken')` (wrong key)
2. The actual JWT token is stored in `'g2e_jwt'`
3. Should use `AuthService` instead of direct localStorage access

## Solution
Updated `ws-client.service.ts` to use `AuthService.getToken()` instead of localStorage.

## Changes Made

### File: `llm-angular/src/app/core/services/ws-client.service.ts`

#### 1. Import AuthService
```typescript
import { AuthService } from '../auth/auth.service';
```

#### 2. Inject AuthService
```typescript
export class WsClientService {
  private readonly authService = inject(AuthService);
  // ... rest of service
}
```

#### 3. Update connect() method
**Before:**
```typescript
// Get auth token from localStorage (only for HTTP API calls)
const authToken = localStorage.getItem('authToken');

if (!authToken) {
  console.error('[WS] No auth token available');
  // ...
}
```

**After:**
```typescript
// Get JWT token from AuthService (cached or fetch)
console.log('[WS] Getting JWT token...');
const authToken = await this.authService.getToken();

if (!authToken) {
  console.error('[WS] No auth token available');
  // ...
}
```

## Architecture

### WebSocket Auth Flow (Ticket-Based)
1. **Get JWT Token** - `authService.getToken()` returns cached or fetches new JWT
2. **Request WS Ticket** - POST to `/api/v1/ws-ticket` with JWT in Authorization header
3. **Connect with Ticket** - `ws://localhost:3000/ws?ticket=<one-time-ticket>`
4. **Server Validates** - Redis-backed ticket verification (one-time use)

### Why Ticket-Based Auth?
- **Security**: JWT tokens never exposed in WebSocket URL (tickets are one-time use)
- **Redis-backed**: Tickets stored in Redis with TTL
- **No localStorage access**: Uses same AuthService as HTTP API

## Verification Steps

### Step 1: Check Console Logs
1. Open browser DevTools → Console
2. Refresh the page
3. Look for WebSocket connection logs:
   ```
   [WS] Getting JWT token...
   [WS] Requesting ticket...
   [WS] Ticket obtained, connecting...
   [WS] Connected successfully
   ```

### Step 2: Verify WebSocket Connection
1. Open DevTools → Network tab → WS filter
2. Look for connection to `ws://localhost:3000/ws?ticket=...`
3. Check status: should show "101 Switching Protocols" (success)
4. Connection should stay open (not immediately close)

### Step 3: Verify Search Updates Arrive
1. Make a search request (e.g., "pizza near me")
2. WebSocket should receive messages:
   - `type: "status"` - Request status updates
   - `type: "stream.*"` - Streaming results
   - `type: "recommendation"` - Final recommendations
3. Check console for: `[WS] Subscribed to { requestId: "req_...", channel: "search" }`

### Step 4: Backend Logs Verification
Check `server/logs/server.log` should show:
- No more "No auth token available" errors
- Successful ticket generation: `[Auth] JWT verified`
- WebSocket authentication: `WS: Authenticated via ticket`
- Subscription success: `websocket_subscribed`

## Token Flow Diagram

```
┌─────────────────┐
│  Angular App    │
│                 │
│  AuthService    │
│  (g2e_jwt)      │
└────────┬────────┘
         │
         │ getToken()
         ├──────────────────┐
         │                  │
         ▼                  ▼
┌─────────────────┐  ┌──────────────────┐
│  HTTP API       │  │  WS Ticket API   │
│  (Bearer JWT)   │  │  (Bearer JWT)    │
└─────────────────┘  └────────┬─────────┘
                              │
                              │ ticket (one-time)
                              ▼
                     ┌──────────────────┐
                     │  WebSocket       │
                     │  ?ticket=xxx     │
                     └──────────────────┘
```

## Key Benefits

1. **Single Source of Truth**: Both HTTP and WS use the same JWT from AuthService
2. **No localStorage Access**: WS service doesn't need to know storage implementation
3. **Automatic Token Refresh**: If JWT expires, AuthService handles refresh
4. **Consistent Error Handling**: Both HTTP and WS use same auth flow

## Files Modified

1. `llm-angular/src/app/core/services/ws-client.service.ts`
   - Added AuthService injection
   - Replaced `localStorage.getItem('authToken')` with `authService.getToken()`
   - Added console log for better debugging

## Testing

### Manual Test
1. Clear localStorage: `localStorage.clear()`
2. Refresh page
3. Make a search
4. Check console for JWT token acquisition
5. Check Network tab for WebSocket connection
6. Verify search results arrive via WebSocket

### Expected Behavior
- First API request triggers JWT fetch
- JWT stored in `g2e_jwt` localStorage key
- WebSocket uses same JWT to get ticket
- WebSocket connects successfully
- Search updates arrive in real-time

## Status

✅ **Fix Applied**
✅ **AuthService Integration Complete**
✅ **WebSocket Now Uses Same JWT as HTTP**
✅ **Ticket-Based Auth Preserved**

Ready for testing!
