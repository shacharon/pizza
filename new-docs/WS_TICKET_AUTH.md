# WebSocket Security Upgrade - Ticket-Based Authentication

## Overview

Implemented secure WebSocket authentication using one-time tickets instead of JWT in URL query parameters.

## Security Improvements

### Before (INSECURE)
- ❌ JWT token in WebSocket URL query string
- ❌ JWT token stored in localStorage
- ❌ Token visible in browser history, logs, and proxies
- ❌ Token reusable for multiple connections

### After (SECURE)
- ✅ One-time ticket in WebSocket URL (not JWT)
- ✅ JWT only used in HTTP Authorization headers
- ✅ Ticket expires in 30 seconds
- ✅ Ticket deleted after first use (one-time)
- ✅ Ticket stored in Redis with user identity
- ✅ No secrets in localStorage for WebSocket flow

## Implementation

### 1. Backend: WS Ticket Endpoint

**File**: `server/src/controllers/auth/ws-ticket.controller.ts`

```typescript
POST /api/v1/ws-ticket
Headers: Authorization: Bearer <JWT>
Response: { ticket: string, expiresInSeconds: 30 }
```

**Flow**:
1. Client authenticates with JWT (existing `/api/v1/auth/token`)
2. Client requests ticket using JWT in Authorization header
3. Server generates cryptographically random ticket (128 bits)
4. Server stores ticket in Redis: `ws_ticket:<ticket>` → `{ userId, sessionId }` (TTL: 30s)
5. Server returns ticket to client

### 2. Backend: WebSocket Verification

**File**: `server/src/infra/websocket/websocket-manager.ts`

**Changes**:
- Removed JWT verification from WebSocket handshake
- Added ticket verification with Redis
- Ticket is deleted atomically on first use (GETDEL pattern)
- Updated log messages: "no auth token" → "no auth ticket"

**Flow**:
1. Client connects with `ws://host/ws?ticket=<ticket>`
2. Server extracts ticket from query param
3. Server validates ticket in Redis
4. If valid: delete ticket, attach identity to connection, allow
5. If invalid/expired: reject connection with 401

### 3. Frontend: Secure Connection

**Files**:
- `llm-angular/src/app/core/services/auth-api.service.ts` (new)
- `llm-angular/src/app/core/services/ws-client.service.ts` (updated)

**Flow**:
1. Client has JWT token (from existing auth flow)
2. Before WebSocket connection: client requests ticket via HTTP POST
3. Client receives ticket (valid for 30s)
4. Client connects to WebSocket with ticket
5. On reconnect: obtain fresh ticket first

**Key Changes**:
- `connect()` is now async (requests ticket before connecting)
- No more JWT in WebSocket URL
- Ticket never stored in localStorage (memory only)

## Configuration

### Environment Variables

**Development** (localhost):
```bash
NODE_ENV=development
REDIS_URL=redis://localhost:6379
WS_REQUIRE_AUTH=true  # default, can be false for local testing
FRONTEND_ORIGINS=http://localhost:4200,http://localhost:4201
```

**Production**:
```bash
NODE_ENV=production
REDIS_URL=redis://<prod-redis-host>:6379
WS_REQUIRE_AUTH=true  # always true in prod
FRONTEND_ORIGINS=https://www.going2eat.food,https://app.going2eat.food
```

## Testing

### Manual Test with curl + wscat

```bash
# 1. Get JWT token
curl -X POST http://localhost:3000/api/v1/auth/token | jq
# Output: { "token": "eyJ...", "sessionId": "sess_..." }

# 2. Request WS ticket
TOKEN="<paste_token_from_step_1>"
curl -X POST http://localhost:3000/api/v1/ws-ticket \
  -H "Authorization: Bearer $TOKEN" | jq
# Output: { "ticket": "a1b2c3...", "expiresInSeconds": 30 }

# 3. Connect to WebSocket (within 30s)
TICKET="<paste_ticket_from_step_2>"
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
# Expected: Connected successfully
```

### Automated Test Script

```bash
cd server
chmod +x test-ws-ticket.sh
./test-ws-ticket.sh
```

### Expected Logs

**Success**:
```
[WSTicket] Ticket generated (sessionId: sess_..., ttl: 30s)
[WS] Authenticated via ticket (sessionId: sess_..., ticketAgeMs: 123)
```

**Failure (expired/invalid ticket)**:
```
[WS] Rejected - ticket invalid or expired (ticketHash: a1b2c3...)
```

**Failure (no ticket)**:
```
[WS] Rejected - no auth ticket
```

## Security Checklist

### Authentication
- ✅ JWT not exposed in WebSocket URL
- ✅ JWT only used in HTTP Authorization headers (HTTPS in prod)
- ✅ WebSocket ticket is one-time use
- ✅ Ticket expires in 30 seconds
- ✅ Ticket requires prior JWT authentication

### Storage
- ✅ JWT stored in localStorage (acceptable for HTTP API)
- ✅ No JWT stored for WebSocket (uses tickets)
- ✅ Tickets stored in Redis (server-side only)
- ✅ Tickets deleted on first use

### Network
- ✅ DEV: WS allowed from localhost:4200, 4201
- ✅ PROD: WSS required (ALB terminates TLS)
- ✅ PROD: Origin allowlist enforced
- ✅ No secrets in query strings

### Logging
- ✅ No JWT tokens logged
- ✅ No tickets logged (only hash/last4)
- ✅ Identity logged as sessionId prefix
- ✅ Ticket age logged for debugging

## Migration Notes

### Frontend Changes Required
- Update all WebSocket connection calls to use `await connect()`
- No other changes needed (service API unchanged)

### Backend Dependencies
- Requires Redis (already in use)
- No new packages needed

### Backward Compatibility
- Old JWT-in-URL flow no longer supported
- All clients must upgrade to ticket flow
- Coordinated deploy required (backend → frontend)

## Troubleshooting

### "WS: Rejected - no auth ticket"
- Client not sending ticket parameter
- Check frontend: ensure `connect()` is called as async

### "WS: Rejected - ticket invalid or expired"
- Ticket expired (>30s since issuance)
- Ticket already used (one-time only)
- Redis unavailable
- Check server logs for ticketHash

### "Redis client not available"
- Redis not running
- Check REDIS_URL environment variable
- Verify Redis connection in server startup logs

### Ticket request returns 401
- JWT token invalid or expired
- Check Authorization header format
- Request fresh JWT from /api/v1/auth/token

## Performance Impact

- **Latency**: +1 HTTP round-trip per WebSocket connection (~50ms)
- **Reconnect**: Ticket must be obtained for each reconnect attempt
- **Redis**: Minimal load (simple GET/DEL operations)
- **Acceptable**: WebSocket connections are long-lived (reconnect is rare)

## Future Enhancements

1. **HttpOnly Cookie Auth** (alternative to tickets)
   - Set HttpOnly cookie on JWT token endpoint
   - WebSocket inherits cookie automatically
   - No ticket request needed
   - Requires same-origin or careful CORS setup

2. **Ticket Pooling** (if reconnect latency becomes issue)
   - Pre-request multiple tickets
   - Use from pool on reconnect
   - Refresh pool in background

3. **Metrics**
   - Track ticket generation rate
   - Monitor ticket expiration rate
   - Alert on Redis failures

## References

- OWASP WebSocket Security: https://owasp.org/www-community/vulnerabilities/WebSocket_security
- RFC 6455 (WebSocket Protocol): https://tools.ietf.org/html/rfc6455
- Redis GETDEL (atomic get+delete): https://redis.io/commands/getdel/
