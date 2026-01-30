# P0/P1 Fixes - Verification Guide

## Quick Verification

### 1. JWT_SECRET Validation
```bash
# Test: Start server without JWT_SECRET in production
NODE_ENV=production npm start
# Expected: Server fails to start with error about JWT_SECRET

# Test: Start server with short JWT_SECRET in production
NODE_ENV=production JWT_SECRET="short" npm start
# Expected: Server fails to start

# Test: Start server with valid JWT_SECRET
NODE_ENV=production JWT_SECRET="this-is-a-valid-secret-with-32-chars-or-more" npm start
# Expected: Server starts successfully
```

### 2. JWT Claims Validation
```bash
# Run JWT middleware tests
npm test auth.middleware
# Expected: All tests pass with iat validation
```

### 3. WebSocket Auth Guards
```bash
# Test: Try to disable WS auth in production
NODE_ENV=production WS_REQUIRE_AUTH=false npm start
# Expected: Server fails with error about WS_REQUIRE_AUTH

# Test: Start without Redis when auth enabled
NODE_ENV=production WS_REQUIRE_AUTH=true REDIS_URL="" npm start
# Expected: Server fails with error about Redis requirement
```

### 4. Run Security Tests
```bash
cd server

# Test 1: WS Pending IDOR
npm test websocket-pending-idor
# Expected: Attacker gets sub_nack, no data leakage

# Test 2: WS Expired Ticket
npm test websocket-expired-ticket
# Expected: Expired tickets rejected

# Test 3: Search IDOR
npm test search-session-mismatch
# Expected: Session mismatch returns 404

# Test 4: Route2 Timeout
npm test route2-global-timeout
# Expected: Pipeline times out at 45s
```

### 5. Rate Limiting
```bash
# Check rate limiter initialization logs
npm start 2>&1 | grep -i "rate"
# Expected: See "[RateLimit] Using Redis-backed rate limiting" if Redis available
# Or: "[RateLimit] Using in-memory rate limiting (not distributed)" if Redis unavailable
```

## Manual Testing Scenarios

### Scenario 1: WS Pending IDOR Attack
1. Open browser dev console
2. Connect WebSocket: `ws = new WebSocket('ws://localhost:3000/ws?ticket=<attacker-ticket>')`
3. Subscribe to unknown requestId: `ws.send(JSON.stringify({type: 'subscribe', channel: 'search', requestId: 'req-unknown-123'}))`
4. Wait for `sub_ack` with `pending: true`
5. Have another user create job for that requestId
6. Observe: Attacker receives `sub_nack` with reason `session_mismatch`
7. Verify: Attacker receives NO data from the job

### Scenario 2: JWT Expiration
1. Generate JWT with short expiry: `POST /api/v1/auth/token`
2. Wait for expiration
3. Try to access protected route: `GET /api/v1/search/:requestId/result`
4. Observe: 401 Unauthorized with "Token expired"

### Scenario 3: Rate Limiting
1. Make 300 requests rapidly to `/api/v1/search`
2. Observe: 429 Too Many Requests after 300 requests
3. Check response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
4. Wait 60 seconds
5. Verify: Rate limit resets

## Production Deployment Verification

After deploying to production:

1. ✅ Check logs for JWT_SECRET validation
   ```
   grep "JWT_SECRET" /var/log/app.log
   # Should NOT see any warnings
   ```

2. ✅ Check logs for WebSocket auth status
   ```
   grep "WebSocketManager: Configuration resolved" /var/log/app.log
   # Should see redisEnabled: true
   ```

3. ✅ Check logs for rate limiter backend
   ```
   grep "RateLimit" /var/log/app.log
   # Should see "Using Redis-backed rate limiting"
   ```

4. ✅ Monitor error rates
   - Watch for 401 errors (auth failures)
   - Watch for 429 errors (rate limit hits)
   - Watch for WS connection rejections

5. ✅ Test WS connection flow
   ```bash
   # Get JWT token
   TOKEN=$(curl -X POST http://localhost:3000/api/v1/auth/token | jq -r .token)
   
   # Get WS ticket
   TICKET=$(curl -X POST http://localhost:3000/api/v1/auth/ws-ticket \
     -H "Authorization: Bearer $TOKEN" | jq -r .ticket)
   
   # Connect WebSocket
   wscat -c "ws://localhost:3000/ws?ticket=$TICKET"
   ```

## Rollback Triggers

Rollback if you observe:

1. **High 401 error rate** (> 5% of requests)
   - Indicates JWT validation issues
   - Check JWT_SECRET configuration

2. **WS connection failures** (> 10% of attempts)
   - Check Redis connectivity
   - Check WS_REQUIRE_AUTH setting

3. **Rate limiter falling back to memory**
   - Redis connectivity issues
   - Monitor log: "Redis error, falling back to memory store"

4. **Pipeline timeouts** (> 1% of searches)
   - 45s timeout may be too aggressive
   - Check LLM/Google API latencies

## Performance Benchmarks

Expected latencies (p95):

- JWT validation: < 5ms
- WS ticket verification: < 50ms (Redis roundtrip)
- Rate limit check: < 10ms (Redis) or < 1ms (memory)
- Route2 pipeline: < 5000ms (normal), < 45000ms (timeout)

## Monitoring Queries

### JWT Failures
```
# Count JWT verification failures
grep "JWT verification failed" /var/log/app.log | wc -l
```

### WS Auth Rejections
```
# Count WS connection rejections
grep "WS: Connection rejected" /var/log/app.log | wc -l
```

### Rate Limit Hits
```
# Count rate limit blocks
grep "Request blocked - limit exceeded" /var/log/app.log | wc -l
```

### Pipeline Timeouts
```
# Count pipeline timeouts
grep "pipeline_timeout" /var/log/app.log | wc -l
```

## Success Criteria

All fixes are working correctly if:

1. ✅ Server starts in production with valid JWT_SECRET
2. ✅ Server fails to start in production with invalid JWT_SECRET
3. ✅ WS connections require valid ticket
4. ✅ Expired tickets are rejected
5. ✅ Pending WS subscriptions validate ownership on activation
6. ✅ Rate limiting uses Redis when available
7. ✅ Route2 pipeline times out at 45s
8. ✅ Background search errors are caught
9. ✅ All 4 security tests pass
10. ✅ No API/WS contract changes observed by clients

## Support

If you encounter issues:
1. Check logs for detailed error messages
2. Verify environment variables are set correctly
3. Run security tests to identify specific failures
4. Review `PROD_FIXES_SUMMARY.md` for change details
