# Shutdown Handler Improvements

## Summary

Enhanced graceful shutdown handler to properly clean up in-flight jobs and provide better visibility during server shutdown.

## Changes Made

### 1. Job Store Interface (`job-store.interface.ts`)
Added `getRunningJobs()` method to track in-flight requests:
```typescript
getRunningJobs(): Promise<SearchJob[]> | SearchJob[];
```

### 2. In-Memory Job Store (`inmemory-search-job.store.ts`)
Implemented `getRunningJobs()` to iterate through Map and return all jobs with `status === 'RUNNING'`:
- Filters out expired jobs based on TTL
- Returns array of running SearchJob objects

### 3. Redis Job Store (`redis-search-job.store.ts`)
Implemented `getRunningJobs()` using Redis SCAN command:
- Scans all job keys matching pattern `search:job:*`
- Fetches jobs in parallel with `Promise.all()`
- Filters for `RUNNING` status
- Includes error handling for Redis failures (returns empty array on error)

### 4. Server Shutdown Handler (`server.ts`)

#### Increased Drain Timeout in Dev
- **Development**: 60s timeout (allows graceful debugging)
- **Production**: 30s timeout (ECS stopTimeout=60s allows: 30s drain + 30s cleanup buffer)

#### New Phase 3.5: Mark Running Jobs as Failed
Before closing Redis, all RUNNING jobs are marked as `DONE_FAILED`:
```typescript
const runningJobs = await searchJobStore.getRunningJobs();

logger.info({
  event: 'shutdown_inflight_counts',
  runningJobsCount: runningJobs.length,
  requestIds: runningJobs.map(j => j.requestId),
  msg: '[Shutdown] Marking running jobs as failed'
});

await Promise.all(
  runningJobs.map(job =>
    searchJobStore.setError(
      job.requestId,
      'SERVER_SHUTDOWN',
      'Server shutting down, request terminated',
      'UNKNOWN'
    )
  )
);
```

#### Enhanced Logging
Added `drainTimeoutMs` to drain_timeout event for better observability.

## Shutdown Sequence

1. **Phase 1**: Stop accepting new connections (`server.close()`)
   - ALB health checks fail immediately
   - Traffic routes away from instance

2. **Phase 2**: Close WebSocket connections
   - Sends close frames with shutdown reason
   - Non-fatal errors logged

3. **Phase 3**: Shutdown state store
   - Clear intervals (cleanup timer)
   - Non-fatal errors logged

4. **Phase 3.5**: Mark RUNNING jobs as DONE_FAILED ← **NEW**
   - Logs `shutdown_inflight_counts` with job count and requestIds
   - Marks all jobs with error code `SERVER_SHUTDOWN`
   - Uses `Promise.all()` for parallel marking
   - Non-fatal errors logged

5. **Phase 3.6**: Close Redis connection
   - Graceful disconnect
   - Non-fatal errors logged

6. **Phase 4**: Wait for in-flight HTTP to drain
   - Dev: 60s timeout (increased from 30s)
   - Prod: 30s timeout
   - Unref'd timer allows early exit if drain completes

## Expected Log Output

```json
{"level":"info","event":"shutdown_initiated","signal":"SIGTERM","msg":"[Shutdown] Graceful shutdown started"}
{"level":"info","event":"http_server_closed","msg":"[Shutdown] HTTP server stopped accepting new connections"}
{"level":"info","event":"websocket_closed","msg":"[Shutdown] WebSocket connections closed"}
{"level":"info","event":"state_store_shutdown","msg":"[Shutdown] Request state store cleanup completed"}
{"level":"info","event":"shutdown_inflight_counts","runningJobsCount":3,"requestIds":["req-123","req-456","req-789"],"msg":"[Shutdown] Marking running jobs as failed"}
{"level":"info","event":"jobs_marked_failed","count":3,"msg":"[Shutdown] All running jobs marked as DONE_FAILED"}
{"level":"info","event":"redis_closed","msg":"[Shutdown] Redis connection closed"}
{"level":"info","event":"drain_started","maxWaitMs":60000,"msg":"[Shutdown] Waiting for in-flight HTTP requests to complete (max 60s)"}
```

## Benefits

✅ **No orphaned jobs**: All RUNNING jobs are marked as failed before shutdown  
✅ **Better observability**: `shutdown_inflight_counts` shows exactly which requests were terminated  
✅ **Longer dev timeout**: 60s allows graceful debugging without premature exit  
✅ **Production safety**: 30s timeout still respects ECS stopTimeout constraints  
✅ **Graceful cleanup order**: Jobs marked before Redis closes (prevents partial updates)  

## Testing

To test the shutdown handler:
1. Start a long-running search request
2. Send SIGINT (Ctrl+C) or SIGTERM to the server process
3. Check `server/logs/server.log` for the shutdown sequence
4. Verify `shutdown_inflight_counts` appears with running job details
5. Verify all jobs are marked as `DONE_FAILED` with `SERVER_SHUTDOWN` error code

## ECS Configuration

Ensure ECS task definition has:
```json
{
  "stopTimeout": 60
}
```

This allows:
- 30s for drain + job cleanup
- 30s buffer for Redis/WS/state store shutdown
