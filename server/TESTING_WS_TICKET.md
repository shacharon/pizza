# WebSocket Ticket Authentication - Testing Guide

## Quick Test Commands

### PowerShell (Windows)

Run the complete automated test:
```powershell
cd server
.\test-ws-ticket-complete.ps1
```

Or test manually:

```powershell
# 1. Get JWT token
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/token" -Method POST -ContentType "application/json" -Body '{}'
$token = $response.token
Write-Host "Token: $token"

# 2. Get WebSocket ticket
$ticketResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/ws-ticket" -Method POST -Headers @{ "Authorization" = "Bearer $token" }
$ticket = $ticketResponse.ticket
Write-Host "Ticket: $ticket (TTL: $($ticketResponse.ttlSeconds)s)"

# 3. Test in browser console
Write-Host ""
Write-Host "Browser Console Command:"
Write-Host "const ws = new WebSocket('ws://localhost:3000/ws?ticket=$ticket');"
Write-Host "ws.onopen = () => console.log('Connected');"
Write-Host "ws.onclose = (e) => console.log('Closed:', e.code, e.reason);"
```

### CURL (Linux/Mac/Git Bash)

```bash
# 1. Get JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.token')
echo "Token: $TOKEN"

# 2. Get WebSocket ticket
TICKET=$(curl -s -X POST http://localhost:3000/api/v1/auth/ws-ticket \
  -H "Authorization: Bearer $TOKEN" | jq -r '.ticket')
echo "Ticket: $TICKET"

# 3. Test WebSocket connection (requires wscat)
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
```

## Expected Results

### ✅ Success Scenario

**JWT Token Request**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "sess_abc123...",
  "traceId": "req-xyz789"
}
```

**WS Ticket Request** (with valid JWT):
```json
{
  "ticket": "550e8400-e29b-41d4-a716-446655440000",
  "ttlSeconds": 60,
  "traceId": "req-abc456"
}
```

**WebSocket Connection**:
- Opens successfully (no 1008 error)
- Can send/receive messages
- Server logs show: `[WSTicket] Ticket generated` → `WS: Authenticated via ticket`

**Second Connection Attempt** (same ticket):
- Closes immediately with code 1008 (NOT_AUTHORIZED)
- Server logs show: `WS: Rejected - ticket invalid or expired`

### ❌ Error Scenarios

| Scenario | Status | Response | Fix |
|----------|--------|----------|-----|
| No Authorization header | 401 | `{ "error": "Unauthorized", "code": "MISSING_AUTH" }` | Add `Authorization: Bearer <token>` header |
| Invalid JWT | 401 | `{ "error": "Unauthorized", "code": "INVALID_TOKEN" }` | Request new token from `/auth/token` |
| JWT missing sessionId | 401 | `{ "error": "NOT_AUTHORIZED", "code": "MISSING_SESSION" }` | Regenerate JWT (shouldn't happen with current endpoint) |
| Redis not available | 503 | `{ "error": "WS_REDIS_UNAVAILABLE", "code": "WS_REDIS_UNAVAILABLE" }` | Start Redis server, check REDIS_URL env var |
| Ticket expired | WS 1008 | WebSocket closes with "NOT_AUTHORIZED" | Request new ticket (60s TTL) |
| Ticket already used | WS 1008 | WebSocket closes with "NOT_AUTHORIZED" | Request new ticket (one-time use) |
| Invalid ticket format | WS 1008 | WebSocket closes with "NOT_AUTHORIZED" | Use exact ticket from API response |

## Browser Console Testing

### Basic Connection Test

```javascript
// 1. Get ticket from API first (see PowerShell/CURL commands above)
const ticket = 'YOUR_TICKET_HERE';

// 2. Connect to WebSocket
const ws = new WebSocket(`ws://localhost:3000/ws?ticket=${ticket}`);

ws.onopen = () => {
  console.log('✅ WebSocket Connected');
  
  // Try subscribing to assistant channel
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'assistant'
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('📨 Message:', data);
};

ws.onerror = (error) => {
  console.error('❌ WebSocket Error:', error);
};

ws.onclose = (event) => {
  console.log('🔌 WebSocket Closed:', {
    code: event.code,
    reason: event.reason,
    wasClean: event.wasClean
  });
  
  if (event.code === 1008) {
    console.error('❌ AUTH ERROR: Ticket invalid, expired, or already used');
  }
};
```

### Test Ticket One-Time Use

```javascript
// After first connection succeeds, try connecting again with same ticket
const ws2 = new WebSocket(`ws://localhost:3000/ws?ticket=${ticket}`);

ws2.onclose = (event) => {
  if (event.code === 1008) {
    console.log('✅ One-time use verified: Second connection rejected');
  } else {
    console.warn('⚠️ Unexpected close code:', event.code);
  }
};
```

### Test Ticket Expiration

```javascript
// Request ticket but wait 61+ seconds before connecting
async function testExpiration() {
  // Get fresh token and ticket
  const tokenRes = await fetch('http://localhost:3000/api/v1/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const { token } = await tokenRes.json();
  
  const ticketRes = await fetch('http://localhost:3000/api/v1/auth/ws-ticket', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const { ticket, ttlSeconds } = await ticketRes.json();
  
  console.log(`Waiting ${ttlSeconds + 1} seconds for ticket to expire...`);
  
  // Wait for ticket to expire
  await new Promise(resolve => setTimeout(resolve, (ttlSeconds + 1) * 1000));
  
  // Try to connect with expired ticket
  const ws = new WebSocket(`ws://localhost:3000/ws?ticket=${ticket}`);
  ws.onclose = (event) => {
    if (event.code === 1008) {
      console.log('✅ Expiration verified: Expired ticket rejected');
    }
  };
}

testExpiration();
```

## Frontend Integration Test

1. **Start Server**:
   ```bash
   cd server
   npm run dev
   ```

2. **Start Frontend**:
   ```bash
   cd llm-angular
   npm start
   ```

3. **Open Browser**: Navigate to `http://localhost:4200`

4. **Perform Search**: Enter any search query

5. **Verify Success**:
   - ✅ Search results appear (streaming via WebSocket)
   - ✅ No "Connection issue" banner
   - ✅ No 1008 errors in browser console
   - ✅ No reconnection loop spam in console

6. **Verify Logs** (server console):
   ```
   [WSTicket] Ticket generated
   WS: Authenticated via ticket
   websocket_connected
   websocket_subscribed
   websocket_published
   ```

## Troubleshooting Common Issues

### Issue: 404 Not Found on /api/v1/auth/ws-ticket

**Symptoms**:
```
POST http://localhost:3000/api/v1/auth/ws-ticket 404 (Not Found)
```

**Diagnosis**:
```powershell
# Check if route is mounted
curl http://localhost:3000/api/v1/auth/ws-ticket
# Should return 401 (not 404)
```

**Possible Causes**:
1. Server not restarted after code changes
2. Route not properly mounted in `auth.controller.ts`
3. Build artifacts outdated

**Fix**:
```bash
cd server
npm run build
npm run dev
```

### Issue: WS 1008 Loop (Continuous Reconnection)

**Symptoms**:
- Browser console shows rapid WS connection/close cycle
- Each connection closes immediately with code 1008
- Frontend shows "Connection issue" banner

**Diagnosis**:
```javascript
// Check in browser console
const ws = new WebSocket('ws://localhost:3000/ws?ticket=test');
ws.onclose = (e) => console.log('Close:', e.code, e.reason);
// Should see: Close: 1008 NOT_AUTHORIZED
```

**Possible Causes**:
1. Frontend not requesting ticket before connecting
2. Frontend using wrong ticket endpoint URL
3. Frontend JWT expired/missing

**Fix**:
1. Verify frontend WebSocket service is calling `/api/v1/auth/ws-ticket` first
2. Check browser network tab for 401/503 errors on ticket endpoint
3. Verify JWT token is valid and being sent with ticket request

### Issue: Redis Unavailable (503)

**Symptoms**:
```json
{
  "error": "WS_REDIS_UNAVAILABLE",
  "code": "WS_REDIS_UNAVAILABLE"
}
```

**Diagnosis**:
```bash
# Check Redis connection
redis-cli ping
# Should return: PONG

# Check server health
curl http://localhost:3000/healthz
# Should show: "redis": { "connected": true }
```

**Fix**:
```bash
# Start Redis
redis-server

# Or with Docker
docker run -p 6379:6379 redis

# Verify REDIS_URL in .env
echo $REDIS_URL  # Should be: redis://localhost:6379
```

### Issue: Token Missing sessionId

**Symptoms**:
```json
{
  "error": "NOT_AUTHORIZED",
  "code": "MISSING_SESSION"
}
```

**Diagnosis**:
```powershell
# Check JWT payload
$token = "YOUR_TOKEN_HERE"
$parts = $token.Split('.')
$payload = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($parts[1]))
Write-Host $payload
# Should contain: "sessionId": "sess_..."
```

**Fix**:
This should never happen with the current `/auth/token` endpoint, which always includes sessionId. If it does:
1. Regenerate token from `/api/v1/auth/token`
2. Check JWT_SECRET is correctly configured
3. Verify no middleware is stripping sessionId from token

## Performance Testing

### Ticket Generation Performance

```javascript
// Generate 100 tickets sequentially
async function perfTest() {
  const tokenRes = await fetch('http://localhost:3000/api/v1/auth/token', {
    method: 'POST',
    body: '{}'
  });
  const { token } = await tokenRes.json();
  
  const start = performance.now();
  const promises = [];
  
  for (let i = 0; i < 100; i++) {
    promises.push(
      fetch('http://localhost:3000/api/v1/auth/ws-ticket', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    );
  }
  
  await Promise.all(promises);
  const duration = performance.now() - start;
  
  console.log(`Generated 100 tickets in ${duration.toFixed(0)}ms`);
  console.log(`Avg: ${(duration / 100).toFixed(2)}ms per ticket`);
}

perfTest();
```

**Expected**: < 50ms per ticket (depending on Redis latency)

### WebSocket Connection Throughput

```javascript
// Test 10 concurrent WS connections
async function wsLoadTest() {
  const tokenRes = await fetch('http://localhost:3000/api/v1/auth/token', {
    method: 'POST',
    body: '{}'
  });
  const { token } = await tokenRes.json();
  
  const connections = [];
  
  for (let i = 0; i < 10; i++) {
    const ticketRes = await fetch('http://localhost:3000/api/v1/auth/ws-ticket', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const { ticket } = await ticketRes.json();
    
    const ws = new WebSocket(`ws://localhost:3000/ws?ticket=${ticket}`);
    connections.push(new Promise((resolve) => {
      ws.onopen = () => {
        console.log(`Connection ${i + 1} opened`);
        resolve();
      };
    }));
  }
  
  await Promise.all(connections);
  console.log('All 10 connections established');
}

wsLoadTest();
```

## Security Testing

### Test Auth Protection

```bash
# Should return 401 (not 200)
curl -X POST http://localhost:3000/api/v1/auth/ws-ticket
```

### Test Ticket Isolation

```javascript
// Verify ticket from one JWT can't be used by different session
async function testIsolation() {
  // Get two separate JWT tokens
  const token1 = (await (await fetch('http://localhost:3000/api/v1/auth/token', { method: 'POST', body: '{}' })).json()).token;
  const token2 = (await (await fetch('http://localhost:3000/api/v1/auth/token', { method: 'POST', body: '{}' })).json()).token;
  
  // Generate ticket with token1
  const ticket1 = (await (await fetch('http://localhost:3000/api/v1/auth/ws-ticket', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token1}` }
  })).json()).ticket;
  
  // Try to use ticket1 with session from token2
  // This should work because ticket carries its own sessionId
  const ws = new WebSocket(`ws://localhost:3000/ws?ticket=${ticket1}`);
  ws.onopen = () => console.log('✅ Ticket contains its own identity');
  ws.onclose = (e) => {
    if (e.code === 1008) {
      console.log('❌ Ticket rejected (unexpected)');
    }
  };
}

testIsolation();
```

## Documentation

For full implementation details, see:
- `WS_TICKET_AUTH_IMPLEMENTATION.md` - Complete implementation documentation
- `test-ws-ticket-complete.ps1` - Automated test script
- `src/controllers/auth/auth.controller.ts` - Source code with inline docs
- `src/infra/websocket/websocket-manager.ts` - WebSocket auth logic (lines 174-307)

## Support

If tests fail:
1. Check server logs for detailed error messages
2. Verify environment variables (JWT_SECRET, REDIS_URL)
3. Confirm Redis is running: `redis-cli ping`
4. Review `WS_TICKET_AUTH_IMPLEMENTATION.md` troubleshooting section
