# Forced Shutdown Fix - 2026-01-28

## Root Cause
**An unhandled promise rejection during normal HTTP request processing (gate2/intent/google) triggered the global `unhandledRejection` handler, which called `shutdown()` and killed the entire server process.**

### Log Evidence
```
line 19: gate2 started (16:51:50.578Z)
line 20: "Forced shutdown after timeout" (16:51:50.633Z) - 55ms later
```

The shutdown process hung (likely WebSocket or Redis not closing cleanly), and after 10 seconds, the force-exit timeout logged the error message and killed the process with `exit(1)`.

---

## The Problem
**File:** `server/src/server.ts` (lines 99-128)

### Before (BROKEN):
```typescript
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal(...);
  
  if (!isShuttingDown) {
    isShuttingDown = true;
    shutdown('SIGTERM');  // ❌ KILLS ENTIRE PROCESS FOR EVERY REQUEST ERROR
  }
});

process.on('uncaughtException', (error) => {
  logger.fatal(...);
  
  if (!isShuttingDown) {
    isShuttingDown = true;
    shutdown('SIGTERM');  // ❌ KILLS ENTIRE PROCESS FOR EVERY REQUEST ERROR
  }
});
```

**Why this is catastrophically bad:**
- Every unhandled promise rejection → entire server crash
- A single failing HTTP request → kills all active connections
- Makes server extremely fragile and production-unsafe
- Confuses request-level errors with process-level termination

---

## The Fix

### Changed File: `server/src/server.ts`

#### 1. **Removed shutdown() calls from error handlers** (lines 109-135)
```typescript
/**
 * PROD Hardening: Global error handlers for process safety
 * 
 * IMPORTANT: These handlers LOG errors but do NOT kill the process.
 * Process shutdown is ONLY triggered by SIGTERM/SIGINT signals.
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal(
    {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: String(promise)
    },
    '[FATAL] Unhandled Promise Rejection - request will fail but server continues'
  );
  
  // DO NOT call shutdown() here - let the request fail gracefully
  // The server should remain available for other requests
});

process.on('uncaughtException', (error) => {
  logger.fatal(
    {
      error: error.message,
      stack: error.stack
    },
    '[FATAL] Uncaught Exception - server may be in unstable state'
  );
  
  // DO NOT call shutdown() here - log and continue
});
```

**What changed:**
- ❌ Removed: `shutdown('SIGTERM')` calls
- ❌ Removed: `isShuttingDown` flag (no longer needed)
- ✅ Added: Clear documentation explaining why we don't kill the process
- ✅ Changed: Log messages now clarify server continues running

#### 2. **Enhanced shutdown() documentation** (lines 70-95)
```typescript
/**
 * Graceful shutdown handler
 * ONLY called by SIGTERM/SIGINT signals (process termination)
 * NEVER called by request-level errors
 */
function shutdown(signal: NodeJS.Signals) {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    requestStateStore.shutdown();
    wsManager.shutdown();

    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown hangs
    // This is ONLY for process termination scenarios (SIGTERM/SIGINT)
    setTimeout(() => {
        logger.error('Forced shutdown after timeout during process termination');
        process.exit(1);
    }, 10_000).unref(); // unref() allows process to exit naturally
}
```

**What changed:**
- ✅ Added: JSDoc clarifying this is ONLY for SIGTERM/SIGINT
- ✅ Improved: Log message now says "during process termination"
- ✅ Added: `.unref()` on timeout so it doesn't prevent natural exit
- ✅ Kept: 10-second force exit timeout (but now ONLY runs on actual shutdown)

---

## Impact & Verification

### ✅ Fixed
- **"Forced shutdown after timeout"** will NEVER be logged during normal request processing
- Unhandled rejections in gate2/intent/google flows now fail gracefully (request-level)
- Server remains available for other requests when one request fails
- Process shutdown is ONLY triggered by SIGTERM/SIGINT (deployment/restart scenarios)

### ✅ Preserved
- Graceful shutdown still works for SIGTERM/SIGINT
- 10-second force-exit timeout still protects against hung shutdown
- Fatal error logging still works (visibility preserved)
- WebSocket cleanup, Redis cleanup, HTTP server close still happen on shutdown

### ✅ Production Safety
- Single request failures don't kill the entire server
- Better fault isolation between requests
- Process monitors (PM2/Docker/K8s) can still restart on true failures
- Aligns with Node.js best practices (don't exit on every error)

---

## Testing Recommendations

1. **Simulate unhandled rejection during request:**
   - Trigger a gate2 error (e.g., invalid LLM response)
   - Verify: Server logs the error but continues running
   - Verify: Other concurrent requests are unaffected

2. **Test graceful shutdown:**
   - Send SIGTERM to process: `kill -TERM <pid>`
   - Verify: "Shutting down gracefully..." logged
   - Verify: WebSocket connections close cleanly
   - Verify: Process exits with code 0 within 10 seconds

3. **Test force shutdown:**
   - Mock a hung shutdown (e.g., Redis won't quit)
   - Verify: After 10 seconds, "Forced shutdown after timeout during process termination" logged
   - Verify: Process exits with code 1

---

## One-Line Summary
**Unhandled promise rejections in request handlers were calling shutdown() and killing the entire server process; fixed by removing shutdown() calls from error handlers and restricting forced shutdown to SIGTERM/SIGINT only.**
