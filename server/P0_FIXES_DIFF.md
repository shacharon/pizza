# P0 Fixes - Detailed Diff

## Files Modified (3 total)

1. `server/src/services/search/route2/stages/google-maps.stage.ts` (+47 lines)
2. `server/src/controllers/search/search.controller.ts` (+60 lines)
3. `server/src/infra/websocket/websocket-manager.ts` (+4 lines, unrelated TS fix)

---

## 1. google-maps.stage.ts

### Added: fetchWithTimeout helper (lines 36-73)

```typescript
/**
 * P0 Fix: Fetch with timeout using AbortController
 * Prevents hanging requests to Google APIs
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  config: { timeoutMs: number; requestId: string; stage: string; provider: string }
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Map AbortError to structured error
    if (err instanceof Error && (err.name === 'AbortError' || controller.signal.aborted)) {
      logger.error({
        requestId: config.requestId,
        provider: config.provider,
        stage: config.stage,
        timeoutMs: config.timeoutMs,
        url: url.split('?')[0]
      }, 'Upstream API timeout');
      
      const timeoutError = new Error(`${config.provider} API timeout after ${config.timeoutMs}ms`);
      (timeoutError as any).code = 'UPSTREAM_TIMEOUT';
      (timeoutError as any).provider = config.provider;
      (timeoutError as any).timeoutMs = config.timeoutMs;
      (timeoutError as any).stage = config.stage;
      throw timeoutError;
    }
    
    throw err;
  }
}
```

### Modified: callGooglePlacesSearchText (line ~550)

```diff
-  const response = await fetch(url, {
+  const response = await fetchWithTimeout(url, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-Goog-Api-Key': apiKey,
       'X-Goog-FieldMask': PLACES_FIELD_MASK
     },
     body: JSON.stringify(body)
+  }, {
+    timeoutMs: 8000,
+    requestId,
+    stage: 'google_maps',
+    provider: 'google_places'
   });
```

### Modified: callGooglePlacesSearchNearby (line ~633)

```diff
-  const response = await fetch(url, {
+  const response = await fetchWithTimeout(url, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-Goog-Api-Key': apiKey,
       'X-Goog-FieldMask': PLACES_FIELD_MASK
     },
     body: JSON.stringify(body)
+  }, {
+    timeoutMs: 8000,
+    requestId,
+    stage: 'google_maps',
+    provider: 'google_places'
   });
```

### Modified: callGoogleGeocoding (line ~684)

```diff
-  const response = await fetch(url, {
+  const response = await fetchWithTimeout(url, {
     method: 'GET',
     headers: {
       'Accept': 'application/json'
     }
+  }, {
+    timeoutMs: 8000,
+    requestId,
+    stage: 'google_maps',
+    provider: 'google_geocoding'
   });
```

---

## 2. search.controller.ts

### Modified: executeBackgroundSearch - setStatus (line ~53)

```diff
     // Step 1: Accepted
-    await searchJobStore.setStatus(requestId, 'RUNNING', 10);
+    // P0 Fix: Non-fatal Redis write (job tracking is optional)
+    try {
+      await searchJobStore.setStatus(requestId, 'RUNNING', 10);
+    } catch (redisErr) {
+      logger.error({ 
+        requestId, 
+        error: redisErr instanceof Error ? redisErr.message : 'unknown',
+        operation: 'setStatus',
+        stage: 'accepted'
+      }, 'Redis JobStore write failed (non-fatal) - continuing pipeline');
+    }
+    
     publishSearchEvent(requestId, { ... });
```

### Modified: executeBackgroundSearch - setStatus (line ~67)

```diff
     // Step 2: Processing (route_llm)
-    await searchJobStore.setStatus(requestId, 'RUNNING', 50);
+    // P0 Fix: Non-fatal Redis write
+    try {
+      await searchJobStore.setStatus(requestId, 'RUNNING', 50);
+    } catch (redisErr) {
+      logger.error({ 
+        requestId, 
+        error: redisErr instanceof Error ? redisErr.message : 'unknown',
+        operation: 'setStatus',
+        stage: 'route_llm'
+      }, 'Redis JobStore write failed (non-fatal) - continuing pipeline');
+    }
+    
     publishSearchEvent(requestId, { ... });
```

### Modified: executeBackgroundSearch - setResult + setStatus (line ~98-99)

```diff
-    await searchJobStore.setResult(requestId, response);
-    await searchJobStore.setStatus(requestId, terminalStatus, 100);
+    // P0 Fix: Non-fatal Redis writes
+    try {
+      await searchJobStore.setResult(requestId, response);
+    } catch (redisErr) {
+      logger.error({ 
+        requestId, 
+        error: redisErr instanceof Error ? redisErr.message : 'unknown',
+        operation: 'setResult'
+      }, 'Redis JobStore write failed (non-fatal) - result not persisted');
+    }
+    
+    try {
+      await searchJobStore.setStatus(requestId, terminalStatus, 100);
+    } catch (redisErr) {
+      logger.error({ 
+        requestId, 
+        error: redisErr instanceof Error ? redisErr.message : 'unknown',
+        operation: 'setStatus',
+        stage: 'done'
+      }, 'Redis JobStore write failed (non-fatal) - status not persisted');
+    }
```

### Modified: executeBackgroundSearch - error handler (line ~132-133)

```diff
   } catch (err) {
     const message = err instanceof Error ? err.message : 'Internal error';
     const isAborted = abortController.signal.aborted;
     let errorCode = isAborted ? 'TIMEOUT' : 'SEARCH_FAILED';

-    await searchJobStore.setError(requestId, errorCode, message, 'SEARCH_FAILED');
-    await searchJobStore.setStatus(requestId, 'DONE_FAILED', 100);
+    // P0 Fix: Non-fatal Redis writes
+    try {
+      await searchJobStore.setError(requestId, errorCode, message, 'SEARCH_FAILED');
+    } catch (redisErr) {
+      logger.error({ 
+        requestId, 
+        error: redisErr instanceof Error ? redisErr.message : 'unknown',
+        operation: 'setError'
+      }, 'Redis JobStore write failed (non-fatal) - error not persisted');
+    }
+    
+    try {
+      await searchJobStore.setStatus(requestId, 'DONE_FAILED', 100);
+    } catch (redisErr) {
+      logger.error({ 
+        requestId, 
+        error: redisErr instanceof Error ? redisErr.message : 'unknown',
+        operation: 'setStatus',
+        stage: 'error'
+      }, 'Redis JobStore write failed (non-fatal) - status not persisted');
+    }
```

### Modified: POST /search - async mode (line ~190)

```diff
     if (mode === 'async') {
       const ownerUserId = (req as any).userId || null;
       const ownerSessionId = queryData.sessionId || req.ctx?.sessionId || null;

-      await searchJobStore.createJob(requestId, {
-        sessionId: queryData.sessionId || 'new',
-        query: queryData.query,
-        ownerUserId,
-        ownerSessionId
-      });
+      // P0 Fix: Non-fatal Redis write
+      try {
+        await searchJobStore.createJob(requestId, {
+          sessionId: queryData.sessionId || 'new',
+          query: queryData.query,
+          ownerUserId,
+          ownerSessionId
+        });
+      } catch (redisErr) {
+        logger.error({ 
+          requestId, 
+          error: redisErr instanceof Error ? redisErr.message : 'unknown',
+          operation: 'createJob'
+        }, 'Redis JobStore write failed (non-fatal) - job not tracked, but search will proceed');
+      }

       const resultUrl = `/api/v1/search/${requestId}/result`;
       res.status(202).json({ requestId, resultUrl, contractsVersion: CONTRACTS_VERSION });
```

---

## 3. websocket-manager.ts (unrelated TS fix)

### Modified: Type safety fixes for optional requestId (lines 506, 520, 522, 544)

```diff
-        this.subscribeToChannel(channel, requestId, effectiveSessionId, ws);
+        this.subscribeToChannel(channel, requestId || 'unknown', effectiveSessionId, ws);

-          this.replayStateIfAvailable(requestId, ws, clientId);
+          if (requestId) {
+            this.replayStateIfAvailable(requestId, ws, clientId);
+          }

-          const requestStatus = await this.getRequestStatus(requestId);
+          const requestStatus = requestId ? await this.getRequestStatus(requestId) : 'unknown';

-        this.unsubscribeFromChannel(channel, requestId, effectiveSessionId, ws);
+        this.unsubscribeFromChannel(channel, requestId || 'unknown', effectiveSessionId, ws);
```

---

## Summary

**Total Lines Changed**: ~111 lines  
**Files Modified**: 3  
**Breaking Changes**: 0  
**Backward Compatible**: ✅ YES  
**Build Status**: ✅ PASSING  

**Key Changes**:
1. Google API calls now timeout after 8s (prevents hanging)
2. Redis writes are non-fatal (search proceeds on Redis failure)
3. All errors logged with full context (requestId, operation, stage)
4. Error mapping follows existing patterns (structured errors, not raw throws)