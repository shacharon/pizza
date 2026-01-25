# WebSocket Secure Ticket Auth - Quick Reference

## 🚀 Quick Start

### Test Locally (Windows)
```batch
cd server
test-ws-ticket.bat
```

### Test Locally (Linux/Mac)
```bash
cd server
chmod +x test-ws-ticket.sh
./test-ws-ticket.sh
```

### Manual Test with curl + wscat
```bash
# 1. Get JWT token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token | jq -r '.token')

# 2. Get WS ticket (must have JWT)
TICKET=$(curl -s -X POST http://localhost:3000/api/v1/ws-ticket \
  -H "Authorization: Bearer $TOKEN" | jq -r '.ticket')

# 3. Connect to WebSocket (within 30 seconds)
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"

# Expected: Connected (>)
# Type a subscribe message:
# {"v":1,"type":"subscribe","channel":"search","requestId":"test_123"}
```

---

## 📋 Files Changed Summary

### Backend (3 modified + 1 new)
| File | Change | Lines |
|------|--------|-------|
| `server/src/controllers/auth/ws-ticket.controller.ts` | **NEW** | 130 |
| `server/src/routes/v1/index.ts` | Modified | +3 |
| `server/src/infra/websocket/websocket-manager.ts` | Modified | ~100 |

### Frontend (1 modified + 1 new)
| File | Change | Lines |
|------|--------|-------|
| `llm-angular/src/app/core/services/auth-api.service.ts` | **NEW** | 51 |
| `llm-angular/src/app/core/services/ws-client.service.ts` | Modified | ~50 |

### Docs & Tests
- `WS_TICKET_AUTH.md` - Full documentation
- `WS_SECURITY_IMPLEMENTATION.md` - Implementation summary
- `server/test-ws-ticket.sh` - Linux/Mac test script
- `server/test-ws-ticket.bat` - Windows test script

---

## 🔐 Security Checklist

- ✅ JWT not exposed in WebSocket URL
- ✅ JWT not stored in localStorage for WS (only for HTTP API)
- ✅ One-time tickets with 30s TTL
- ✅ Tickets stored in Redis (server-side)
- ✅ Tickets deleted on first use (atomic)
- ✅ No secrets logged (only hashes)
- ✅ PROD: WSS enforced (TLS at ALB)
- ✅ PROD: Origin allowlist enforced
- ✅ DEV: localhost:4200, 4201 allowed
- ✅ Redis required for auth (fail-closed)

---

## 🔧 Configuration

### Required Environment Variables
```bash
# Backend
REDIS_URL=redis://localhost:6379
JWT_SECRET=<your-secret-32-chars-min>
WS_REQUIRE_AUTH=true  # default, set false only for local testing

# Frontend (Angular environments)
# environment.ts already configured
```

### Verify Redis
```bash
# Check Redis is running
redis-cli ping
# Expected: PONG

# Check Redis connection in server logs
npm run dev
# Expected: "WebSocketManager: Redis enabled"
```

---

## 🐛 Troubleshooting

### "WS: Rejected - no auth ticket"
**Cause**: Frontend not sending ticket parameter
**Fix**: Ensure WS client uses `await connect()` (async)

### "WS: Rejected - ticket invalid or expired"
**Causes**:
- Ticket expired (>30s since issuance)
- Ticket already used (one-time only)
- Redis unavailable

**Fixes**:
1. Check server logs for `ticketHash` 
2. Verify Redis is running: `redis-cli ping`
3. Check ticket age in logs (should be <30s)

### "Redis client not available"
**Cause**: Redis not running or REDIS_URL incorrect
**Fix**: 
```bash
# Start Redis
redis-server

# Or check REDIS_URL
echo $REDIS_URL
```

### Frontend: "Failed to connect"
**Causes**:
- Backend not running
- JWT token missing in localStorage
- Ticket request failed (401)

**Fixes**:
1. Check backend is running: `curl http://localhost:3000/healthz`
2. Check JWT token: Open DevTools → Application → LocalStorage → `authToken`
3. Check network tab for `/ws-ticket` request (should be 200)

---

## 📊 Expected Logs

### Success Flow
```
[Auth] JWT token generated (sessionId: sess_abc123)
[WSTicket] Ticket generated (sessionId: sess_abc, ttl: 30s)
[WS] Authenticated via ticket (sessionId: sess_abc, ticketAgeMs: 123)
websocket_connected (clientId: ws-123, authenticated: true)
```

### Failure: No Ticket
```
[WS] Rejected - no auth ticket (ip: ::1, origin: http://localhost:4200)
```

### Failure: Invalid Ticket
```
[WS] Rejected - ticket invalid or expired (ticketHash: a1b2c3...)
```

### Failure: Expired Ticket
```
[WS] Rejected - ticket invalid or expired (ticketHash: d4e5f6...)
```

---

## 🎯 Manual Testing Scenarios

### ✅ Test 1: Happy Path (Should Succeed)
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token | jq -r '.token')
TICKET=$(curl -s -X POST http://localhost:3000/api/v1/ws-ticket -H "Authorization: Bearer $TOKEN" | jq -r '.ticket')
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
# Expected: Connected (>)
```

### ❌ Test 2: No Ticket (Should Fail)
```bash
wscat -c "ws://localhost:3000/ws"
# Expected: Connection rejected
# Log: "WS: Rejected - no auth ticket"
```

### ❌ Test 3: Invalid Ticket (Should Fail)
```bash
wscat -c "ws://localhost:3000/ws?ticket=invalid_12345"
# Expected: Connection rejected
# Log: "WS: Rejected - ticket invalid or expired"
```

### ❌ Test 4: Expired Ticket (Should Fail)
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token | jq -r '.token')
TICKET=$(curl -s -X POST http://localhost:3000/api/v1/ws-ticket -H "Authorization: Bearer $TOKEN" | jq -r '.ticket')
sleep 35  # Wait for ticket to expire
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
# Expected: Connection rejected
# Log: "WS: Rejected - ticket invalid or expired"
```

### ❌ Test 5: Ticket Reuse (Should Fail on 2nd Try)
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/token | jq -r '.token')
TICKET=$(curl -s -X POST http://localhost:3000/api/v1/ws-ticket -H "Authorization: Bearer $TOKEN" | jq -r '.ticket')

# First connection (should succeed)
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
# Press Ctrl+C to disconnect

# Second connection with same ticket (should fail)
wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
# Expected: Connection rejected (one-time use)
```

---

## 📦 Deployment Checklist

### Pre-Deploy
- [ ] All manual tests pass locally
- [ ] Redis running and accessible
- [ ] Logs show "WS: Authenticated via ticket"
- [ ] Frontend compiles without errors
- [ ] Backend compiles without errors
- [ ] No linter errors

### Deploy Staging
- [ ] Deploy backend first
- [ ] Verify Redis connectivity
- [ ] Check backend logs for "Redis enabled"
- [ ] Deploy frontend
- [ ] Test WebSocket connection from browser
- [ ] Monitor logs for auth failures

### Deploy Production
- [ ] Verify REDIS_URL points to prod Redis
- [ ] Verify FRONTEND_ORIGINS contains prod domains
- [ ] Verify WS_REQUIRE_AUTH=true (never false in prod)
- [ ] Deploy backend
- [ ] Verify "WSS" (secure WebSocket) is used
- [ ] Deploy frontend
- [ ] Monitor WebSocket connection metrics
- [ ] Check for auth rejections in logs

### Post-Deploy
- [ ] WebSocket connections succeed
- [ ] No JWT in WebSocket URLs
- [ ] Logs show "Authenticated via ticket"
- [ ] Redis ops: GET/DEL for ws_ticket:* keys
- [ ] No security warnings in logs

---

## 📞 Support

### Check Server Status
```bash
curl http://localhost:3000/healthz
# Expected: {"status":"ok","checks":{"redis":"UP"}}
```

### Check Redis Keys
```bash
redis-cli KEYS "ws_ticket:*"
# Should show active tickets (if any)
# Tickets auto-expire after 30s
```

### Monitor WebSocket Traffic
```javascript
// Browser DevTools Console
const ws = new WebSocket('ws://localhost:3000/ws?ticket=<paste_ticket>');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', e.data);
ws.onerror = (e) => console.error('Error:', e);
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

---

## 🎓 Key Concepts

### Why Tickets?
- **JWT in URL**: Visible in logs, browser history, proxies → SECURITY RISK
- **Tickets**: Short-lived, one-time use, not replayable → SECURE

### How It Works
1. Client authenticates with JWT (existing flow)
2. Client requests ticket from `/api/v1/ws-ticket` using JWT in Authorization header
3. Server generates random ticket and stores in Redis (30s TTL)
4. Client connects to WebSocket with ticket (not JWT)
5. Server validates ticket, deletes it (one-time), attaches identity, allows connection

### Why Not Cookies?
- Cookies would work (HttpOnly, Secure)
- But require same-origin or complex CORS
- Tickets are more flexible for cross-origin scenarios
- May switch to cookies in future for better UX

---

## 📈 Performance

| Metric | Impact |
|--------|--------|
| Connection latency | +50-200ms (ticket request) |
| Reconnect overhead | Same (need fresh ticket each time) |
| Redis load | Minimal (3 ops per connection) |
| Network overhead | ~1KB per connection |

**Acceptable**: WebSocket connections are long-lived, reconnect is rare.

---

## 🔗 References

- Full docs: `WS_TICKET_AUTH.md`
- Implementation summary: `WS_SECURITY_IMPLEMENTATION.md`
- Test scripts: `server/test-ws-ticket.{sh,bat}`
