# WebSocket Isolation - Key Changes (Diff Summary)

## 1. Subscription Manager - Error Isolation

**File**: `server/src/infra/websocket/subscription-manager.ts`

```diff
  async handleSubscribeRequest(...): Promise<{...}> {
+   try {
      const envelope = message as any;
      const requestId = envelope.requestId as string | undefined;
      // ... ownership verification and routing logic
      
      this.subscribe(route.channel!, route.requestId!, route.sessionId, ws);
      return {
        success: true,
        pending: false,
        channel: route.channel!,
        requestId: route.requestId!,
        sessionId: route.sessionId!
      };
+   } catch (error) {
+     // CRITICAL: Never throw from WS handlers
+     logger.error({
+       clientId,
+       error: error instanceof Error ? error.message : 'unknown',
+       stack: error instanceof Error ? error.stack : undefined,
+       event: 'ws_subscribe_error'
+     }, '[WS] Subscribe handler failed (non-fatal) - returning failure');
+     
+     return { success: false };
+   }
  }
```

---

## 2. Search Controller - WS Activation Guards

**File**: `server/src/controllers/search/search.controller.ts`

### A) Job Creation Logging
```diff
  await searchJobStore.createJob(requestId, {...});
  
  logger.info({
    requestId,
    sessionHash: hashSessionId(ownerSessionId || 'anonymous'),
    hasUserId: Boolean(ownerUserId),
    operation: 'createJob',
    decision: 'ACCEPTED',
    hasIdempotencyKey: true,
+   event: 'job_created'  // NEW: Searchable event tag
  }, '[Observability] Job created with JWT session binding');
```

### B) Enhanced WS Activation Error Handling
```diff
  try {
    wsManager.activatePendingSubscriptions(requestId, ownerSessionId || 'anonymous');
  } catch (wsErr) {
    logger.error({
      requestId,
      error: wsErr instanceof Error ? wsErr.message : 'unknown',
+     stack: wsErr instanceof Error ? wsErr.stack : undefined,
      operation: 'activatePendingSubscriptions',
+     event: 'ws_subscribe_error'
-   }, '[P1 Reliability] WebSocket activation failed (non-fatal) - search continues');
+   }, '[WS] WebSocket activation failed (non-fatal) - search continues via HTTP polling');
  }
```

### C) HTTP Result Independence Documentation
```diff
+ // GUARDRAIL: HTTP result delivery is independent of WS state
+ // Job store is the source of truth, not WS subscriptions
  const job = await searchJobStore.getJob(requestId);
  if (!job) {
+   logger.warn({
+     requestId,
+     event: 'getResult_not_found'
+   }, '[HTTP] Job not found in store - may have expired or never created');
    return res.status(404).json({ code: 'NOT_FOUND', requestId });
  }
```

### D) Result Retrieval Logging
```diff
  if (typeof result === 'object' && 'results' in result) {
    const sanitized = {
      ...result,
      results: sanitizePhotoUrls((result as any).results || [])
    };

+   // OBSERVABILITY: Log successful result retrieval
    logger.info({
      requestId,
      photoUrlsSanitized: true,
      resultCount: (result as any).results?.length || 0,
+     hasResult: true,
+     status: job.status,
+     event: 'getResult_returned'
    }, '[Observability] GET /result returned successfully with results');

    return res.json(sanitized);
  }
```

---

## 3. Async Execution - WS Publish Guards

**File**: `server/src/controllers/search/search.async-execution.ts`

### A) Status Running Logging
```diff
  try {
    await searchJobStore.setStatus(requestId, 'RUNNING', 10);
+   
+   // OBSERVABILITY: Log status transition
+   logger.info({
+     requestId,
+     status: 'RUNNING',
+     progress: 10,
+     event: 'status_running'
+   }, '[Observability] Job status set to RUNNING');
  } catch (redisErr) {
    logger.error({
      requestId,
      error: redisErr instanceof Error ? redisErr.message : 'unknown',
      operation: 'setStatus',
      stage: 'accepted',
+     event: 'ws_error'
    }, 'Redis JobStore write failed (non-fatal) - continuing pipeline');
  }
```

### B) Wrapped WS Progress Publish
```diff
+ // GUARDRAIL: WS publish is optional - never blocks search execution
+ try {
    publishSearchEvent(requestId, {
      channel: 'search',
      contractsVersion: CONTRACTS_VERSION,
      type: 'progress',
      requestId,
      ts: new Date().toISOString(),
      stage: 'accepted',
      status: 'running',
      progress: 10,
      message: 'Search started'
    });
+ } catch (wsErr) {
+   logger.warn({
+     requestId,
+     error: wsErr instanceof Error ? wsErr.message : 'unknown',
+     event: 'ws_publish_error'
+   }, '[WS] Failed to publish progress event (non-fatal)');
+ }
```

### C) Result Storage Logging
```diff
  try {
    await searchJobStore.setResult(requestId, response);
+   
+   // OBSERVABILITY: Log result storage success
+   logger.info({
+     requestId,
+     resultCount: response.results?.length || 0,
+     hasAssist: Boolean(response.assist),
+     event: 'result_stored'
+   }, '[Observability] Search result stored successfully');
  } catch (redisErr) {
    logger.error({
      requestId,
      error: redisErr instanceof Error ? redisErr.message : 'unknown',
      operation: 'setResult',
+     event: 'ws_error'
    }, 'Redis JobStore write failed (non-fatal) - result not persisted');
  }
```

### D) Terminal Status Logging
```diff
  try {
    await searchJobStore.setStatus(requestId, terminalStatus, 100);
+   
+   // OBSERVABILITY: Log terminal status
+   logger.info({
+     requestId,
+     status: terminalStatus,
+     progress: 100,
+     event: 'status_done'
+   }, '[Observability] Job reached terminal status');
  } catch (redisErr) {
    logger.error({
      requestId,
      error: redisErr instanceof Error ? redisErr.message : 'unknown',
      operation: 'setStatus',
      stage: 'done',
+     event: 'ws_error'
    }, 'Redis JobStore write failed (non-fatal) - status not persisted');
  }
```

### E) Wrapped Final WS Publish
```diff
+ // Final WS Notification - GUARDRAIL: Never blocks, even if WS fails
+ try {
    if (wsEventType === 'clarify') {
      publishSearchEvent(requestId, {...});
    } else if (wsEventType === 'stopped') {
      publishSearchEvent(requestId, {...});
    } else {
      publishSearchEvent(requestId, {...});
    }
+ } catch (wsErr) {
+   logger.warn({
+     requestId,
+     error: wsErr instanceof Error ? wsErr.message : 'unknown',
+     wsEventType,
+     event: 'ws_publish_error'
+   }, '[WS] Failed to publish final event (non-fatal) - result still stored');
+ }
```

### F) Wrapped Error Case WS Publish
```diff
  try {
    await searchJobStore.setStatus(requestId, 'DONE_FAILED', 100);
  } catch (redisErr) {
    logger.error({
      requestId,
      error: redisErr instanceof Error ? redisErr.message : 'unknown',
      operation: 'setStatus',
      stage: 'error',
+     event: 'ws_error'
    }, 'Redis JobStore write failed (non-fatal) - status not persisted');
  }

+ // GUARDRAIL: WS publish is optional - never blocks error handling
+ try {
    publishSearchEvent(requestId, {
      channel: 'search',
      contractsVersion: CONTRACTS_VERSION,
      type: 'error',
      requestId,
      ts: new Date().toISOString(),
      stage: 'done',
      code: errorCode as any,
      message
    });
+ } catch (wsErr) {
+   logger.warn({
+     requestId,
+     error: wsErr instanceof Error ? wsErr.message : 'unknown',
+     event: 'ws_publish_error'
+   }, '[WS] Failed to publish error event (non-fatal)');
+ }
```

---

## Summary of Changes

### Files Modified (3)
1. `server/src/infra/websocket/subscription-manager.ts`
2. `server/src/controllers/search/search.controller.ts`
3. `server/src/controllers/search/search.async-execution.ts`

### New Event Tags (for log filtering)
- `event: 'job_created'` - Job registered in store
- `event: 'status_running'` - Pipeline execution started
- `event: 'result_stored'` - Result persisted to store
- `event: 'status_done'` - Terminal status reached
- `event: 'getResult_returned'` - HTTP delivery succeeded
- `event: 'ws_error'` - Redis/storage errors (non-fatal)
- `event: 'ws_subscribe_error'` - WS subscription failures (non-fatal)
- `event: 'ws_publish_error'` - WS publish failures (non-fatal)

### Behavior Guarantees
✅ **WS failures never throw** - All WS operations wrapped with try/catch  
✅ **WS failures never block pipeline** - Search execution continues regardless  
✅ **HTTP polling always works** - Job store is the source of truth  
✅ **Full lifecycle observability** - Key events logged once per requestId  
✅ **No behavior changes** - Only stability improvements, no feature changes  

### Testing Proof
To verify the changes work correctly, grep logs for a single requestId:

```bash
# Normal flow (all events present)
cat server/logs/server.log | grep "req-XXX" | grep -E "job_created|status_running|result_stored|status_done|getResult_returned"

# WS failures (non-blocking)
cat server/logs/server.log | grep "req-XXX" | grep -E "ws_error|ws_subscribe_error|ws_publish_error"

# HTTP success despite WS failures
cat server/logs/server.log | grep "req-XXX" | grep "getResult_returned"
```

Expected: HTTP delivery succeeds even when WS operations fail.
