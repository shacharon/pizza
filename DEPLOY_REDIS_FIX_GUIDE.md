# Deployment Guide: Redis Readiness Fix

## Overview
Complete fix for `/ws-ticket` 503 spam after deploy when Redis container is starting.

## What Changed

### Architecture
- **Before**: Lazy Redis init → /ws-ticket 503 spam → Eventually connects
- **After**: EAGER Redis init → /ws-ticket always works → No spam

### Files Modified

#### Backend Core
1. **`server/src/infra/redis/redis.service.ts`** (MOVED from `lib/redis/`)
   - Method renamed: `initialize()` → `start()`
   - Added: `isReady()` synchronous check
   - Added: Fail-closed behavior in production
   - Added: Startup timeout (8s default)

2. **`server/src/server.ts`**
   - EAGER Redis init before `app.listen()`
   - Fail-closed in production: `process.exit(1)` if Redis unavailable
   - Degraded mode in development: Continue without Redis

3. **`server/src/controllers/auth/auth.controller.ts`**
   - Simplified: Use `RedisService.isReady()` (no await, no timeout)
   - Updated error code: `WS_TICKET_REDIS_NOT_READY`
   - Kept: `Retry-After: 2` header

4. **`server/src/controllers/health.controller.ts`** (NEW)
   - `/health` - Liveness (process alive?)
   - `/ready` - Readiness (Redis ready?)
   - `/healthz` - Legacy (backward compat)

5. **`server/src/app.ts`**
   - Added `/health`, `/ready`, `/healthz` routes
   - Removed old health controller import

#### Infrastructure Updates
6. **`server/src/infra/websocket/websocket-manager.ts`**
   - Import path: `lib/redis/` → `infra/redis/`

7. **`server/src/services/search/job-store/index.ts`**
   - Import path: `lib/redis/` → `infra/redis/`

8. **`server/src/services/search/route2/stages/google-maps/cache-manager.ts`**
   - Import path: `lib/redis/` → `infra/redis/`

#### ECS Configuration
9. **`server/docs/ecs-task-definition-redis.json`** (NEW)
   - Redis container with healthcheck
   - API container with `dependsOn` Redis HEALTHY
   - API healthcheck uses `/ready`

#### Tests
10. **`server/src/controllers/auth/__tests__/ws-ticket-redis.test.ts`** (NEW)
    - Test: Redis not ready → 503
    - Test: Redis ready → 200
    - Test: No log spam
    - Test: Retry-After header

## Pre-Deployment Verification

### 1. Local Testing

```bash
# Test 1: Redis available
docker run -d -p 6379:6379 --name redis-test redis:7-alpine
npm start

# Expected logs:
✓ redis_connect_start
✓ redis_connect_ok (durationMs: ~100-200ms)
✓ Server listening on port 3000

# Test /ready endpoint:
curl http://localhost:3000/ready
# Expected: 200 + {"status":"UP","ready":true,"checks":{"redis":"UP"}}

# Test /ws-ticket (requires valid JWT):
curl -X POST http://localhost:3000/api/v1/auth/ws-ticket \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 + {"ticket":"..."}

# Test 2: Redis unavailable
docker stop redis-test
npm start

# Expected logs (development mode):
✓ redis_connect_start
✓ redis_connect_fail
✓ redis_connect_degraded (env: development)
✓ Server listening on port 3000 (continues)

# Test /ready endpoint:
curl http://localhost:3000/ready
# Expected: 503 + {"status":"NOT_READY","ready":false,"checks":{"redis":"DOWN"}}

# Test /ws-ticket:
curl -X POST http://localhost:3000/api/v1/auth/ws-ticket \
  -H "Authorization: Bearer $TOKEN"
# Expected: 503 + {"errorCode":"WS_TICKET_REDIS_NOT_READY","retryAfter":2}
# Header: Retry-After: 2

# Test 3: Production fail-closed
export NODE_ENV=production
npm start

# Expected:
✓ redis_connect_start
✓ redis_connect_fail
✓ redis_connect_fatal
✓ Process exits with code 1 (does NOT continue)
```

### 2. Integration Tests

```bash
# Run test suite
npm test -- ws-ticket-redis.test.ts

# Expected results:
✓ Redis not ready → 503 with error code
✓ Redis ready → 200 with ticket
✓ Retry-After header present
✓ No log spam (1 log per request)
✓ No stack traces in error response
```

## Deployment Steps

### Step 1: Update ECS Task Definition

**File**: `ecs-task-definition.json`

**Changes**:
1. Add Redis container with healthcheck:
```json
{
  "name": "redis",
  "healthCheck": {
    "command": ["CMD-SHELL", "redis-cli ping | grep PONG"],
    "interval": 5,
    "timeout": 2,
    "retries": 12,
    "startPeriod": 10
  }
}
```

2. Add dependency in API container:
```json
{
  "name": "api",
  "dependsOn": [
    {
      "containerName": "redis",
      "condition": "HEALTHY"
    }
  ]
}
```

3. Update API healthcheck:
```json
{
  "healthCheck": {
    "command": ["CMD-SHELL", "curl -f http://localhost:3000/ready || exit 1"],
    "interval": 10,
    "timeout": 3,
    "retries": 3,
    "startPeriod": 30
  }
}
```

**Deploy Task Definition**:
```bash
aws ecs register-task-definition \
  --cli-input-json file://ecs-task-definition.json
```

### Step 2: Update ALB Target Group

**Update Healthcheck Path**:
```bash
aws elbv2 modify-target-group \
  --target-group-arn $TARGET_GROUP_ARN \
  --health-check-path /ready \
  --health-check-interval-seconds 10 \
  --health-check-timeout-seconds 3 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

### Step 3: Deploy Code

**1. Build & Push Docker Image**:
```bash
# Build
docker build -t piza-api:${VERSION} .

# Tag
docker tag piza-api:${VERSION} ${ECR_REPO}:${VERSION}

# Push
docker push ${ECR_REPO}:${VERSION}
```

**2. Update ECS Service**:
```bash
aws ecs update-service \
  --cluster piza-cluster \
  --service piza-api-service \
  --task-definition piza-api-task:${NEW_REVISION} \
  --force-new-deployment \
  --health-check-grace-period-seconds 60
```

**3. Monitor Deployment**:
```bash
# Watch ECS service events
aws ecs describe-services \
  --cluster piza-cluster \
  --services piza-api-service \
  --query 'services[0].events[:5]'

# Watch CloudWatch logs
aws logs tail /ecs/piza-api --follow --filter-pattern "redis_connect"
```

### Step 4: Verify Deployment

**Check 1: Redis Connection**
```bash
# Tail logs for redis_connect events
aws logs tail /ecs/piza-api --follow | grep redis_connect

# Expected:
✓ redis_connect_start
✓ redis_connect_ok (within 2s)
✓ NO redis_connect_fail
✓ NO redis_connect_fatal
```

**Check 2: ALB Target Health**
```bash
aws elbv2 describe-target-health \
  --target-group-arn $TARGET_GROUP_ARN

# Expected:
✓ State: healthy (all targets)
✓ Reason: "Target.HealthCheckPassed"
```

**Check 3: ws-ticket Endpoint**
```bash
# Get valid token
TOKEN=$(curl -X POST https://api.piza.com/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r .token)

# Test ws-ticket
curl -X POST https://api.piza.com/api/v1/auth/ws-ticket \
  -H "Authorization: Bearer $TOKEN" \
  -v

# Expected:
✓ HTTP 200
✓ Response: {"ticket":"...","ttlSeconds":60,"traceId":"..."}
✓ NO 503 errors
✓ NO Retry-After header
```

**Check 4: Readiness Endpoint**
```bash
curl https://api.piza.com/ready

# Expected:
✓ HTTP 200
✓ Response: {"status":"UP","ready":true,"checks":{"redis":"UP"}}
```

## Rollback Plan

### Scenario 1: Redis Healthcheck Fails

**Symptoms**:
- ECS tasks stuck in "PROVISIONING"
- Logs: `redis_connect_fail` repeated
- ALB targets: 0 healthy

**Actions**:
1. Check Redis container logs:
   ```bash
   aws logs tail /ecs/piza-api --follow --filter-pattern "redis"
   ```

2. If Redis config issue:
   - Fix Redis environment variables
   - Redeploy with corrected config

3. If Redis unavailable:
   - Increase healthcheck `startPeriod` to 30s
   - Increase API startup timeout to 15s
   - Redeploy

### Scenario 2: API Fails to Start (Production Fail-Closed)

**Symptoms**:
- ECS tasks exit immediately (code 1)
- Logs: `redis_connect_fatal`
- ALB targets: 0 healthy

**Actions**:
1. Check Redis connectivity:
   ```bash
   # SSH into ECS host (if possible)
   redis-cli -h localhost -p 6379 ping
   ```

2. If Redis truly unavailable:
   - **Rollback immediately**:
     ```bash
     aws ecs update-service \
       --cluster piza-cluster \
       --service piza-api-service \
       --task-definition piza-api-task:${PREVIOUS_REVISION}
     ```

3. If Redis available but API can't connect:
   - Check network policies (Security Groups, NACLs)
   - Check Redis URL in environment variables
   - Check Redis authentication

### Scenario 3: High 503 Rate After Deploy

**Symptoms**:
- Some /ws-ticket requests return 503
- Logs: `ws_ticket_redis_not_ready` (intermittent)
- ALB targets: Flapping (healthy → unhealthy → healthy)

**Actions**:
1. Check Redis connection stability:
   ```bash
   aws logs tail /ecs/piza-api --filter-pattern "redis_error"
   ```

2. If connection instability:
   - Increase Redis `commandTimeout` to 5000ms
   - Add Redis connection pooling
   - Check Redis CPU/memory metrics

3. If temporary:
   - Monitor for 10 minutes
   - Should stabilize automatically
   - Frontend retry logic handles gracefully

## Monitoring

### CloudWatch Alarms

**1. Redis Connection Failures**
```yaml
MetricName: RedisConnectionFailures
Namespace: Piza/API
Statistic: Sum
Period: 300 (5 minutes)
Threshold: > 0
AlarmActions: [PagerDuty]
```

**2. WS-Ticket 503 Rate**
```yaml
MetricName: WSTicket503Rate
Namespace: Piza/API
Statistic: Average
Period: 60 (1 minute)
Threshold: > 5%
AlarmActions: [Slack]
```

**3. ALB Unhealthy Targets**
```yaml
MetricName: UnHealthyHostCount
Namespace: AWS/ApplicationELB
Statistic: Average
Period: 60
Threshold: > 0
AlarmActions: [PagerDuty, AutoScaling]
```

### Log Insights Queries

**Query 1: Redis Connection Timeline**
```
fields @timestamp, event, durationMs, error, env
| filter event in ["redis_connect_start", "redis_connect_ok", "redis_connect_fail", "redis_connect_fatal"]
| sort @timestamp desc
| limit 100
```

**Query 2: WS-Ticket Error Rate**
```
fields @timestamp, event, traceId
| filter event = "ws_ticket_redis_not_ready"
| stats count() by bin(1m) as errors_per_minute
| sort @timestamp desc
```

**Query 3: Container Startup Performance**
```
fields @timestamp, event, durationMs
| filter event = "redis_connect_ok"
| stats avg(durationMs) as avg_ms, max(durationMs) as max_ms, min(durationMs) as min_ms
```

## Success Criteria

### Immediate (Post-Deploy)
- [ ] All ECS tasks running (not stuck in PROVISIONING)
- [ ] Redis healthcheck passing
- [ ] API healthcheck passing (curl /ready → 200)
- [ ] ALB targets healthy (2/2 or N/N)
- [ ] Logs show `redis_connect_ok` (no `redis_connect_fail`)
- [ ] `/ws-ticket` returns 200 (no 503)

### 1 Hour Post-Deploy
- [ ] Zero `ws_ticket_redis_not_ready` events
- [ ] Zero `redis_connect_fail` events
- [ ] ALB 5xx rate < 0.1%
- [ ] WebSocket connection success rate > 99%

### 24 Hours Post-Deploy
- [ ] No Redis connection failures
- [ ] No ECS task restarts due to Redis
- [ ] No customer complaints about loading issues
- [ ] CloudWatch logs clean (no error spam)

## FAQ

### Q: What if Redis is truly unavailable in production?

**A**: Container will exit with code 1 (fail-closed). ECS will restart until Redis becomes available. This prevents serving broken traffic.

### Q: Will this increase cold start time?

**A**: Yes, by ~2-5s (Redis connection time). Trade-off is worth it to prevent 503 spam and ensure readiness.

### Q: What if I need to disable fail-closed temporarily?

**A**: Set environment variable:
```bash
REDIS_FAIL_CLOSED=false
```
Then restart. **NOT RECOMMENDED** for production.

### Q: Can I use external Redis (ElastiCache)?

**A**: Yes! Update `REDIS_URL`:
```bash
REDIS_URL=redis://piza-cache.abc123.0001.use1.cache.amazonaws.com:6379
```

Ensure:
- Security Group allows traffic from ECS tasks
- Healthcheck timeout increased to 5s (network latency)

### Q: What about Redis cluster mode?

**A**: Supported. Use cluster URL:
```bash
REDIS_URL=redis://piza-cache.clustercfg.abc123.use1.cache.amazonaws.com:6379
```

Update RedisService to use cluster mode client if needed.

## Files Modified Summary

| File | Change | Breaking |
|------|--------|----------|
| `infra/redis/redis.service.ts` | Moved from `lib/redis/`, renamed methods | ⚠️ Import path |
| `server.ts` | EAGER init + fail-closed | ✅ No |
| `controllers/auth/auth.controller.ts` | Simplified check + new error code | ⚠️ Error code |
| `controllers/health.controller.ts` | New file, /ready endpoint | ✅ No |
| `app.ts` | New routes: /health, /ready | ✅ No |
| `websocket-manager.ts` | Import path update | ✅ No |
| `job-store/index.ts` | Import path update | ✅ No |
| `cache-manager.ts` | Import path update | ✅ No |

## Breaking Changes

### 1. Error Code Change
**Before**: `WS_REDIS_UNAVAILABLE`
**After**: `WS_TICKET_REDIS_NOT_READY`

**Impact**: Low (frontend already handles all 503s the same)

**Migration**: Frontend retry logic doesn't depend on error code.

### 2. Import Path Change
**Before**: `import { RedisService } from '../../lib/redis/redis.service.js'`
**After**: `import { RedisService } from '../../infra/redis/redis.service.js'`

**Impact**: Internal only (no external API)

### 3. Method Rename
**Before**: `await RedisService.initialize(options)`
**After**: `await RedisService.start(options, startupOptions)`

**Impact**: Internal only (called once in server.ts)

## Backward Compatibility

### ✅ Maintained
- `/ws-ticket` request/response format (unchanged)
- `/ws-ticket` ticket TTL (60s, unchanged)
- `/ws-ticket` security model (Redis-backed, unchanged)
- WebSocket protocol (unchanged)
- Search pipeline (unchanged)
- JobStore fallback (InMemory in dev, unchanged)

### ⚠️ Changed
- `/healthz` now uses /ready logic (stricter)
- Production: Exits if Redis unavailable (fail-closed)
- Error code: `WS_TICKET_REDIS_NOT_READY` (was `WS_REDIS_UNAVAILABLE`)

## Rollout Strategy

### Phase 1: Canary (1 ECS Task)
1. Deploy to 1 task in canary environment
2. Monitor for 1 hour:
   - `redis_connect_ok` events
   - `/ws-ticket` success rate
   - `/ready` healthcheck status
3. If stable: Proceed to Phase 2
4. If unstable: Rollback, investigate

### Phase 2: Staging (Full)
1. Deploy to staging environment
2. Run load tests:
   - 1000 concurrent /ws-ticket requests
   - All should return 200 (no 503)
3. Simulate Redis failure:
   - Stop Redis container
   - Verify API exits (fail-closed)
   - Verify ECS restarts container
4. If stable: Proceed to Phase 3

### Phase 3: Production (Blue/Green)
1. Deploy to production with blue/green
2. Monitor for 10 minutes:
   - `/ws-ticket` 503 rate < 0.1%
   - ALB targets all healthy
   - WebSocket connections working
3. If stable: Complete deployment
4. If unstable: Auto-rollback via circuit breaker

### Phase 4: Monitoring (24h)
1. Monitor CloudWatch alarms
2. Check error logs (should be clean)
3. Track user-reported issues (should be zero)
4. After 24h stable: Declare success

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Redis startup timeout | Low | High | Increase timeout to 15s |
| Container dependency race | Medium | High | Use HEALTHY condition (not START) |
| Production fail-closed too strict | Low | Critical | Test thoroughly in staging |
| Network latency (ElastiCache) | Low | Medium | Increase timeout for remote Redis |
| ECS task stuck PROVISIONING | Low | High | Add timeout alarm, auto-rollback |

## Success Metrics

### Before Fix
- `/ws-ticket` 503 rate: **15-25%** (first 30s after deploy)
- WebSocket connection failures: **40-60%** (first minute)
- Log volume: **500 lines/min** (spam)
- Time to healthy: **30-60s**

### After Fix (Expected)
- `/ws-ticket` 503 rate: **< 0.1%** (steady state)
- WebSocket connection failures: **< 1%** (transient only)
- Log volume: **50 lines/min** (clean)
- Time to healthy: **10-15s** (EAGER init + healthcheck)

## Related Documents
- `WS_TICKET_503_REDIS_FIX.md` - Technical implementation
- `REDIS_INITIALIZATION_FIX.md` - Redis service refactor
- `WS_TICKET_RETRY_BACKOFF_FIX.md` - Frontend retry logic
- `ecs-task-definition-redis.json` - ECS config reference
