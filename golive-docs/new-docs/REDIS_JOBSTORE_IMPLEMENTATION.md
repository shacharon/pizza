# Redis Job Store Implementation

## Summary
Implemented Redis-backed persistence for SearchJobStore to prevent 404 errors after server restarts, with automatic fallback to InMemory storage.

## Problem Solved
- **Before**: InMemory store loses all jobs on server restart → 404 NOT_FOUND for active requests
- **After**: Redis persists jobs with 24h TTL → requests survive restarts

## Architecture

### Storage Abstraction Layer
```
ISearchJobStore (interface)
    ├── InMemorySearchJobStore (fallback, always available)
    └── RedisSearchJobStore (persistent, optional)
```

### Dependency Injection
```typescript
// server/src/services/search/job-store/index.ts
export function getSearchJobStore(): ISearchJobStore {
  if (config.enableRedisJobStore && config.redisUrl) {
    return new RedisSearchJobStore(config.redisUrl, config.redisJobTtlSeconds);
  }
  return new InMemorySearchJobStore(); // Fallback
}
```

## Configuration

### Environment Variables
```bash
# Enable Redis job store (default: false)
ENABLE_REDIS_JOBSTORE=true

# Redis connection URL (default: redis://localhost:6379)
REDIS_URL=redis://localhost:6379
# Or with auth: redis://:password@localhost:6379
# Or Redis Cloud: redis://username:password@host:port

# Job TTL in seconds (default: 86400 = 24 hours)
REDIS_JOB_TTL_SECONDS=86400
```

### Local Development
```bash
# Option 1: Use InMemory (no setup required)
# Just start the server - it will use InMemory by default

# Option 2: Use Redis with Docker
docker run -d --name redis-piza -p 6379:6379 redis:7-alpine
export ENABLE_REDIS_JOBSTORE=true
export REDIS_URL=redis://localhost:6379
npm run dev
```

### Production
```bash
# Use Redis Cloud or managed Redis
export ENABLE_REDIS_JOBSTORE=true
export REDIS_URL=redis://username:password@redis-host:6379
export REDIS_JOB_TTL_SECONDS=86400
npm start
```

## Redis Schema

### Key Pattern
```
search:job:{requestId}
```

### Value (JSON)
```json
{
  "requestId": "req-1768673790172-h7hmaa4m9",
  "sessionId": "session-xyz",
  "query": "pizza in tel aviv",
  "status": "DONE",
  "progress": 100,
  "result": { /* full SearchResponse */ },
  "error": null,
  "createdAt": 1768673790172,
  "updatedAt": 1768673795264
}
```

### TTL
- Default: 24 hours (86400 seconds)
- Configurable via `REDIS_JOB_TTL_SECONDS`
- Auto-expires in Redis (no manual cleanup needed)

## Files Changed

### New Files
1. **`server/src/services/search/job-store/job-store.interface.ts`**
   - Defines `ISearchJobStore` interface
   - Types: `SearchJob`, `JobStatus`
   - Methods: `createJob`, `setStatus`, `setResult`, `setError`, `getStatus`, `getResult`, `getJob`, `deleteJob`

2. **`server/src/services/search/job-store/redis-search-job.store.ts`**
   - Redis implementation of `ISearchJobStore`
   - Uses `ioredis` client
   - Key prefix: `search:job:`
   - Auto-retry on connection errors (3 attempts)
   - Graceful error handling

3. **`server/src/services/search/job-store/index.ts`**
   - Factory function `getSearchJobStore()`
   - DI logic: Redis if enabled, else InMemory
   - Singleton proxy for easy import

### Modified Files
4. **`server/src/services/search/job-store/inmemory-search-job.store.ts`**
   - Implements `ISearchJobStore` interface
   - Updated `createJob` signature to match interface
   - Removed duplicate `getJob` method
   - Removed singleton export (moved to index.ts)

5. **`server/src/config/env.ts`**
   - Added `enableRedisJobStore` flag
   - Added `redisUrl` configuration
   - Added `redisJobTtlSeconds` configuration

6. **`server/src/controllers/search/search.controller.ts`**
   - Changed import from `inmemory-search-job.store.js` to `index.js`
   - No other changes (transparent swap)

7. **`server/package.json`**
   - Added `ioredis` dependency

## API Compatibility

### No Breaking Changes
- All controller endpoints work identically
- Response shapes unchanged
- Frontend code requires no modifications

### Async Methods
Redis operations are async, but the interface supports both sync and async:
```typescript
export interface ISearchJobStore {
  createJob(requestId: string, params: {...}): Promise<void> | void;
  getStatus(requestId: string): Promise<{...} | null> | {...} | null;
  // ... etc
}
```

Controllers use `await` for all operations, which works for both implementations.

## Testing

### Manual Test: InMemory (Default)
```bash
# Start server (no Redis needed)
npm run dev

# Create async search
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza in tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}'

# Response: {"requestId":"req-...","resultUrl":"/api/v1/search/req-.../result","contractsVersion":"..."}

# Poll result (wait 5-10s)
curl http://localhost:3000/api/v1/search/req-.../result

# Restart server
# Poll again → 404 NOT_FOUND (expected with InMemory)
```

### Manual Test: Redis
```bash
# Start Redis
docker run -d --name redis-piza -p 6379:6379 redis:7-alpine

# Start server with Redis enabled
export ENABLE_REDIS_JOBSTORE=true
export REDIS_URL=redis://localhost:6379
npm run dev

# Create async search
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"sushi in haifa","userLocation":{"lat":32.7940,"lng":34.9896}}'

# Response: {"requestId":"req-...","resultUrl":"/api/v1/search/req-.../result","contractsVersion":"..."}

# Poll result (wait 5-10s)
curl http://localhost:3000/api/v1/search/req-.../result

# Restart server (keep Redis running)
npm run dev

# Poll again → 200 OK with results (survives restart!)
```

### Verify Redis Keys
```bash
# Connect to Redis CLI
docker exec -it redis-piza redis-cli

# List all job keys
KEYS search:job:*

# Get specific job
GET search:job:req-1768673790172-h7hmaa4m9

# Check TTL
TTL search:job:req-1768673790172-h7hmaa4m9
```

## Error Handling

### Redis Connection Failures
```typescript
// Logs error and falls back to InMemory
logger.error({
  error: err.message,
  msg: '[JobStore] Failed to initialize Redis, falling back to InMemory'
});
searchJobStoreInstance = new InMemorySearchJobStore();
```

### Redis Operation Failures
```typescript
// RedisSearchJobStore has retry logic (3 attempts)
retryStrategy: (times) => {
  if (times > 3) return null;
  return Math.min(times * 100, 2000);
}
```

### Graceful Degradation
- If Redis is unavailable at startup → InMemory
- If Redis connection drops during operation → errors logged, operations fail gracefully
- Frontend polling continues, eventually times out with retry CTA

## Performance

### InMemory
- **Latency**: <1ms per operation
- **Throughput**: Unlimited (local Map)
- **Memory**: ~1KB per job
- **Limitation**: Lost on restart

### Redis
- **Latency**: 1-5ms per operation (local Redis), 10-50ms (remote)
- **Throughput**: 10K-100K ops/sec (depends on Redis setup)
- **Memory**: ~2KB per job (JSON serialization)
- **Benefit**: Survives restarts, can scale horizontally

## Migration Path

### Phase 1: Development (Current)
```bash
# Use InMemory (default)
npm run dev
```

### Phase 2: Staging
```bash
# Enable Redis for testing
export ENABLE_REDIS_JOBSTORE=true
export REDIS_URL=redis://staging-redis:6379
npm start
```

### Phase 3: Production
```bash
# Use managed Redis (e.g., Redis Cloud, AWS ElastiCache)
export ENABLE_REDIS_JOBSTORE=true
export REDIS_URL=redis://username:password@prod-redis:6379
export REDIS_JOB_TTL_SECONDS=86400
npm start
```

## Monitoring

### Key Metrics
1. **Job Creation Rate**: `search:job:*` key creation rate
2. **Job Completion Rate**: Status transitions to DONE/FAILED
3. **Redis Memory Usage**: Monitor with `INFO memory`
4. **Redis Hit Rate**: `GET` success vs 404
5. **TTL Distribution**: Check if jobs are expiring as expected

### Logs to Watch
```json
{"msg":"[JobStore] Initializing Redis store","store":"redis","redisUrl":"redis://localhost:6379"}
{"msg":"[RedisJobStore] Connected","ttlSeconds":86400}
{"msg":"[RedisJobStore] Job created","requestId":"req-..."}
{"msg":"[RedisJobStore] Status updated","requestId":"req-...","status":"DONE"}
```

### Error Patterns
```json
{"msg":"[RedisJobStore] Connection error","error":"..."}
{"msg":"[JobStore] Failed to initialize Redis, falling back to InMemory"}
{"msg":"[RedisJobStore] Failed to parse job","requestId":"req-..."}
```

## Security

### Redis Authentication
```bash
# Use password-protected Redis
export REDIS_URL=redis://:your-password@localhost:6379

# Or with username (Redis 6+)
export REDIS_URL=redis://username:password@localhost:6379
```

### TLS/SSL
```bash
# Use rediss:// for TLS
export REDIS_URL=rediss://username:password@secure-redis:6380
```

### Network Security
- Use private network for Redis (no public exposure)
- Firewall rules: only allow app servers to connect
- VPC peering for cloud deployments

## Troubleshooting

### Issue: Server starts but uses InMemory instead of Redis
**Check**:
1. `ENABLE_REDIS_JOBSTORE=true` is set
2. `REDIS_URL` is correct
3. Redis is running: `docker ps` or `redis-cli ping`
4. Logs show: `[JobStore] Initializing Redis store`

### Issue: Redis connection errors
**Check**:
1. Redis is accessible: `redis-cli -u redis://localhost:6379 ping`
2. Firewall allows port 6379
3. Credentials are correct (if using auth)
4. Check logs for retry attempts

### Issue: 404 after restart (even with Redis enabled)
**Check**:
1. Redis is still running: `docker ps | grep redis`
2. Keys exist: `redis-cli KEYS search:job:*`
3. TTL hasn't expired: `redis-cli TTL search:job:req-...`
4. Server is actually using Redis (check startup logs)

## Future Enhancements

- [ ] Add Redis Cluster support for high availability
- [ ] Implement job result compression (gzip) to reduce memory
- [ ] Add metrics/telemetry for Redis operations
- [ ] Implement job archival to cold storage after 24h
- [ ] Add admin API to inspect/delete jobs
- [ ] Support multiple Redis instances (read replicas)
