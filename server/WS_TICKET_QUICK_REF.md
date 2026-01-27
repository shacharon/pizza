# WS Ticket Authentication - Quick Reference

## Implementation Summary

**Status**: ✅ Complete  
**Build**: ✅ Passing  
**Route**: `POST /api/v1/auth/ws-ticket`  
**Auth**: JWT required (via Authorization header)  
**Ticket TTL**: 60 seconds  
**One-time use**: Yes (deleted on first WS connection)

## Files Modified

```
✅ server/src/controllers/auth/auth.controller.ts
   - Added POST /ws-ticket endpoint with JWT auth
   - Generates UUID tickets, stores in Redis with 60s TTL
   - Returns { ticket, ttlSeconds, traceId }

✅ server/src/routes/v1/index.ts
   - Removed duplicate route mounting
   - Now: router.use('/auth', authRouter) includes both /token and /ws-ticket

❌ server/src/controllers/auth/ws-ticket.controller.ts
   - Deleted (consolidated into auth.controller.ts)
```

## Quick Test Commands

### PowerShell (Windows)

```powershell
# Step 1: Get JWT token
$tokenResp = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/token" -Method POST -ContentType "application/json" -Body '{}'
$token = $tokenResp.token
$sessionId = $tokenResp.sessionId
Write-Host "Token acquired for session: $sessionId"

# Step 2: Get WebSocket ticket
$ticketResp = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/ws-ticket" -Method POST -Headers @{ "Authorization" = "Bearer $token" }
$ticket = $ticketResp.ticket
$ttl = $ticketResp.ttlSeconds
Write-Host "Ticket: $ticket (expires in $ttl seconds)"

# Step 3: Test WebSocket connection (browser console)
Write-Host ""
Write-Host "Browser Console Command:"
Write-Host "const ws = new WebSocket('ws://localhost:3000/ws?ticket=$ticket');"
Write-Host "ws.onopen = () => console.log('Connected');"
Write-Host "ws.onclose = (e) => console.log('Closed:', e.code, e.reason);"
```

### CURL (Linux/Mac/Git Bash)

```bash
# Step 1: Get JWT token
TOKEN_RESP=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{}')
TOKEN=$(echo $TOKEN_RESP | jq -r '.token')
SESSION_ID=$(echo $TOKEN_RESP | jq -r '.sessionId')
echo "Token acquired for session: $SESSION_ID"

# Step 2: Get WebSocket ticket
TICKET_RESP=$(curl -s -X POST http://localhost:3000/api/v1/auth/ws-ticket \
  -H "Authorization: Bearer $TOKEN")
TICKET=$(echo $TICKET_RESP | jq -r '.ticket')
TTL=$(echo $TICKET_RESP | jq -r '.ttlSeconds')
echo "Ticket: $TICKET (expires in $TTL seconds)"

# Step 3: Test WebSocket connection (requires wscat)
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
```

## Expected Responses

### Success Flow

**1. POST /api/v1/auth/token**
```json
HTTP 200 OK
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzZXNzX2FiYzEyMyIsImlhdCI6MTcwNjIyNjEyMywiZXhwIjoxNzA4ODE4MTIzfQ.xyz...",
  "sessionId": "sess_abc123-def456-ghi789",
  "traceId": "req-xyz789"
}
```

**2. POST /api/v1/auth/ws-ticket** (with Authorization header)
```json
HTTP 200 OK
{
  "ticket": "550e8400-e29b-41d4-a716-446655440000",
  "ttlSeconds": 60,
  "traceId": "req-abc456"
}
```

**3. WebSocket Connection**: `ws://localhost:3000/ws?ticket=<ticket>`
```
✅ Connection opens successfully
✅ No 1008 error
✅ Can send/receive messages
```

### Error Responses

**Missing Authorization header**:
```json
HTTP 401 Unauthorized
{
  "error": "Unauthorized",
  "code": "MISSING_AUTH",
  "traceId": "req-xyz"
}
```

**Invalid JWT**:
```json
HTTP 401 Unauthorized
{
  "error": "Unauthorized",
  "code": "INVALID_TOKEN",
  "traceId": "req-xyz"
}
```

**JWT missing sessionId** (shouldn't happen):
```json
HTTP 401 Unauthorized
{
  "error": "NOT_AUTHORIZED",
  "code": "MISSING_SESSION",
  "message": "JWT must contain sessionId",
  "traceId": "req-xyz"
}
```

**Redis unavailable**:
```json
HTTP 503 Service Unavailable
{
  "error": "WS_REDIS_UNAVAILABLE",
  "code": "WS_REDIS_UNAVAILABLE",
  "message": "Ticket service temporarily unavailable",
  "traceId": "req-xyz"
}
```

**Expired/invalid ticket** (WebSocket):
```
WebSocket closes with code 1008 (Policy Violation)
Reason: "NOT_AUTHORIZED"
```

## Verification Steps

### 1. Start Server
```bash
cd server
npm run dev
```

### 2. Verify Health
```bash
curl http://localhost:3000/healthz
# Should show: "redis": { "connected": true }
```

### 3. Run Automated Test
```powershell
cd server
.\test-ws-ticket-complete.ps1
```

Expected output:
```
[1/5] Checking server health...
      ✅ Server is running
      ✅ Redis is connected

[2/5] Requesting JWT token...
      ✅ JWT token acquired

[3/5] Requesting WebSocket ticket...
      ✅ WebSocket ticket acquired

[4/5] Verifying endpoint authentication...
      ✅ Endpoint correctly requires authentication

[5/5] Validating ticket properties...
      ✅ Ticket format is valid UUID
      ✅ TTL is correct (60 seconds)

✅ All Tests Passed (7/7)
```

### 4. Test WebSocket Connection
Open browser console and paste:
```javascript
const ws = new WebSocket('ws://localhost:3000/ws?ticket=YOUR_TICKET_HERE');
ws.onopen = () => console.log('✅ Connected');
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

Expected: Logs "✅ Connected" (no 1008 error)

### 5. Test One-Time Use
Try connecting again with the same ticket:
```javascript
const ws2 = new WebSocket('ws://localhost:3000/ws?ticket=YOUR_TICKET_HERE');
ws2.onclose = (e) => console.log('Expected 1008:', e.code, e.reason);
```

Expected: Logs "Expected 1008: 1008 NOT_AUTHORIZED"

## Technical Details

### Ticket Storage (Redis)

**Key**: `ws_ticket:${ticket}`

**Value**:
```json
{
  "userId": "user123" | null,
  "sessionId": "sess_abc123",
  "createdAt": 1706226123456
}
```

**TTL**: 60 seconds

### WebSocket Auth Flow

```
Client                    Auth API                Redis               WebSocket
   |                         |                      |                     |
   |-- POST /auth/token ---->|                      |                     |
   |<---- JWT + sessionId ---|                      |                     |
   |                         |                      |                     |
   |-- POST /auth/ws-ticket -|                      |                     |
   |    (with JWT)           |                      |                     |
   |                         |-- SET ticket data -->|                     |
   |                         |    (60s TTL)         |                     |
   |<---- ticket ------------|                      |                     |
   |                         |                      |                     |
   |-- WS connect (ticket) ---------------------------------->|            |
   |                         |                      |<-- GET ticket ---|  |
   |                         |                      |    then DEL ---->|  |
   |                         |                      |                  |  |
   |<--------------------- WS connected (authenticated) ----------------|  |
   |                         |                      |                     |
```

### Security Properties

✅ **JWT required**: Endpoint protected by `authenticateJWT` middleware  
✅ **No JWT in WS URL**: Ticket is ephemeral, not a long-lived credential  
✅ **One-time use**: Ticket deleted after first connection  
✅ **Short TTL**: 60-second window limits exposure  
✅ **Session binding**: Ticket carries authenticated identity from JWT  
✅ **Cryptographically secure**: UUID v4 (122 bits of randomness)

## Environment Setup

```bash
# Required
REDIS_URL=redis://localhost:6379
JWT_SECRET=<32+ character secret>

# Optional
WS_REQUIRE_AUTH=true              # Default: true (recommended)
ENABLE_REDIS_JOB_STORE=true       # Default: true (required for Redis)
NODE_ENV=production               # Default: development
```

## Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| 404 on /api/v1/auth/ws-ticket | Route not mounted | Restart server: `npm run dev` |
| 401 MISSING_AUTH | No Authorization header | Add `Authorization: Bearer <token>` |
| 401 INVALID_TOKEN | JWT expired/invalid | Request new JWT from /auth/token |
| 503 WS_REDIS_UNAVAILABLE | Redis not running | Start Redis: `redis-server` |
| WS 1008 loop | Ticket expired/used/invalid | Request fresh ticket before each connection |

## Documentation

- **Implementation**: `WS_TICKET_AUTH_IMPLEMENTATION.md` (full details)
- **Testing Guide**: `TESTING_WS_TICKET.md` (comprehensive test scenarios)
- **Test Script**: `test-ws-ticket-complete.ps1` (automated verification)
- **Source Code**: `src/controllers/auth/auth.controller.ts` (lines 115-230)
- **WebSocket Auth**: `src/infra/websocket/websocket-manager.ts` (lines 174-307)

## Build Verification

```bash
cd server
npm run build
# ✅ Build completed in ~40s
# ✅ dist/server/src/server.js exists
```

## Deployment Checklist

- [ ] Redis accessible at REDIS_URL
- [ ] JWT_SECRET configured (32+ chars)
- [ ] ENABLE_REDIS_JOB_STORE=true
- [ ] Build passes: `npm run build`
- [ ] Health check shows Redis connected
- [ ] Test flow: JWT → ticket → WS connection
- [ ] No 1008 errors in logs

---

**Status**: ✅ Ready for Testing  
**Next**: Run `.\test-ws-ticket-complete.ps1` to verify
