# Redis Bootstrap Testing Guide

Quick reference for testing the Redis bootstrap fix.

---

## Prerequisites

```bash
# Ensure Redis is installed
redis-server --version

# OR using Docker
docker ps | grep redis
```

---

## Test Scenario 1: Redis Running (Expected: 200 OK)

### 1. Start Redis
```bash
# Docker
docker start stocks-redis

# OR Local Redis
redis-server
```

### 2. Start Server
```bash
cd server
npm run dev
```

### 3. Check Boot Logs
Look for this line:
```
[BOOT] Redis boot status: ✓ CONNECTED
```

Full log structure:
```json
{
  "event": "redis_boot_status",
  "ok": true,
  "redisUrl": "redis://localhost:6379",
  "status": "ready",
  "clientCreated": true,
  "clientConnected": true
}
```

### 4. Test Debug Endpoint
```bash
curl http://localhost:3000/api/v1/debug/redis
```

**Expected Response (200 OK)**:
```json
{
  "ok": true,
  "status": "ready",
  "pingResult": "PONG",
  "timestamp": "2026-02-14T..."
}
```

### 5. Test Bootstrap Endpoint
```bash
curl -X POST http://localhost:3000/api/v1/auth/bootstrap \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -v
```

**Expected Response (200 OK)**:
```
< HTTP/1.1 200 OK
< Set-Cookie: session=<uuid>; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax

{
  "ok": true,
  "sessionId": "abc123def456...",
  "traceId": "req_..."
}
```

**Check Session in Redis**:
```bash
redis-cli
> KEYS session:*
1) "session:<uuid>"
> GET session:<uuid>
"{\"sessionId\":\"<uuid>\",\"createdAt\":...,\"lastSeen\":...}"
```

---

## Test Scenario 2: Redis Stopped (Expected: 503 Service Unavailable)

### 1. Stop Redis
```bash
# Docker
docker stop stocks-redis

# OR Local Redis
redis-cli shutdown
```

### 2. Server Already Running
If server is already running, it should continue to serve requests but bootstrap will fail.

### 3. Test Debug Endpoint
```bash
curl http://localhost:3000/api/v1/debug/redis
```

**Expected Response (503 Service Unavailable)**:
```json
{
  "ok": false,
  "error": "Redis client not initialized",
  "status": null,
  "timestamp": "2026-02-14T..."
}
```

**OR** (if client exists but disconnected):
```json
{
  "ok": false,
  "error": "Connection timeout",
  "status": "close",
  "timestamp": "2026-02-14T..."
}
```

### 4. Test Bootstrap Endpoint
```bash
curl -X POST http://localhost:3000/api/v1/auth/bootstrap
```

**Expected Response (503 Service Unavailable)**:
```json
{
  "error": "Service Unavailable",
  "code": "SESSION_STORE_UNAVAILABLE",
  "message": "Session bootstrap temporarily unavailable",
  "traceId": "req_..."
}
```

**Check Server Logs**:
```
[SessionStore] Redis not ready
  event: session_store_redis_not_ready
  status: close
  message: Redis client exists but not in ready state

[Bootstrap] Redis not available
  event: bootstrap_redis_unavailable
```

---

## Test Scenario 3: Redis Reconnect (Expected: Auto-Recovery)

### 1. Server Running, Redis Stopped
Follow Scenario 2 above.

### 2. Restart Redis
```bash
# Docker
docker start stocks-redis

# OR Local
redis-server &
```

### 3. Wait for Reconnect
ioredis will automatically reconnect (if `retryStrategy` is configured).

Check logs for:
```
[Redis] Client ready
```

### 4. Test Bootstrap Again
```bash
curl -X POST http://localhost:3000/api/v1/auth/bootstrap
```

**Expected**: Should now return 200 OK (auto-recovered).

**Note**: If auto-reconnect doesn't work, restart the server.

---

## Test Scenario 4: Server Start with Redis Down (Expected: Graceful Degradation)

### 1. Stop Redis First
```bash
docker stop stocks-redis
```

### 2. Start Server
```bash
cd server
npm run dev
```

### 3. Check Boot Logs
```
[BOOT] Redis boot status: ✗ FAILED
```

Full log:
```json
{
  "event": "redis_boot_status",
  "ok": false,
  "redisUrl": "redis://localhost:6379",
  "error": "Connection timeout after 2s"
}
```

### 4. Test Bootstrap
```bash
curl -X POST http://localhost:3000/api/v1/auth/bootstrap
```

**Expected**: 503 Service Unavailable

### 5. Start Redis
```bash
docker start stocks-redis
```

### 6. Restart Server
```bash
# Ctrl+C to stop, then:
npm run dev
```

### 7. Test Bootstrap Again
**Expected**: Should now return 200 OK.

---

## Quick Debug Commands

### Check Redis is Running
```bash
# Docker
docker ps | grep redis

# Local
redis-cli ping
# Expected: PONG
```

### Check Redis Connection
```bash
redis-cli
> PING
PONG
> INFO server
```

### Check Session Store Keys
```bash
redis-cli
> KEYS session:*
> GET session:<uuid>
```

### Monitor Redis Commands (Real-time)
```bash
redis-cli MONITOR
```

### Check Server Logs for Redis Events
```bash
# In server logs, search for:
grep "redis_boot_status"
grep "session_store_redis_not_ready"
grep "bootstrap_redis_unavailable"
```

---

## Troubleshooting

### Bootstrap returns 503 even with Redis running

**Check 1**: Verify Redis status
```bash
curl http://localhost:3000/api/v1/debug/redis
```

**Check 2**: Check server logs for `redis_boot_status`
- Should show `ok: true`
- Status should be `'ready'`

**Check 3**: Verify Redis URL in `.env`
```bash
cat server/.env | grep REDIS_URL
# Expected: REDIS_URL=redis://localhost:6379
```

**Check 4**: Test Redis connection manually
```bash
redis-cli ping
```

**Solution**: If all checks pass but still failing, restart the server.

---

### Debug endpoint returns 404

**Cause**: Production mode with `ENABLE_DEBUG_REDIS` not set.

**Solution**:
```bash
export ENABLE_DEBUG_REDIS=true
# OR in .env:
ENABLE_DEBUG_REDIS=true
```

---

### Bootstrap returns 200 but no session in Redis

**Check 1**: Verify cookie was set
```bash
curl -X POST http://localhost:3000/api/v1/auth/bootstrap -c cookies.txt -v
cat cookies.txt
# Should contain: session=<uuid>
```

**Check 2**: Check Redis for session key
```bash
redis-cli
> KEYS session:*
```

**Solution**: If session key exists, it's working. If not, check server logs for errors.

---

## Expected Log Flow (Success)

```
1. [BOOT] Initializing Redis client
2. [BOOT] Redis boot status: ✓ CONNECTED
3. [BOOT] Initializing Redis session store
4. [SessionStore] Initialized with Redis backend
5. [BOOT] ✓ Redis session store ready
6. Server listening on http://localhost:3000

--- User calls bootstrap ---

7. [SessionStore] Session created
8. [Bootstrap] Session bootstrapped successfully
```

---

## Expected Log Flow (Failure)

```
1. [BOOT] Initializing Redis client
2. [BOOT] Redis boot status: ✗ FAILED
3. [BOOT] Session store not initialized - Redis unavailable
4. Server listening on http://localhost:3000

--- User calls bootstrap ---

5. [SessionStore] Redis not ready
6. [Bootstrap] Redis not available
7. Response: 503 Service Unavailable
```

---

## Summary

| Scenario | Redis Status | Bootstrap Response | Debug Endpoint |
|----------|--------------|-------------------|----------------|
| Redis running, connected | `ready` | 200 OK | 200 OK with PONG |
| Redis stopped | `null` or `close` | 503 Unavailable | 503 Unavailable |
| Redis connecting | `connecting` | 503 Unavailable | 503 Unavailable |
| Redis reconnecting | `reconnecting` | 503 Unavailable | 503 Unavailable |

**Key Point**: Bootstrap only returns 200 OK when Redis status is exactly `'ready'`.

---

**Last Updated**: 2026-02-14
