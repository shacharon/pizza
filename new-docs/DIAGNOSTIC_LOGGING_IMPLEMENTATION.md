# Diagnostic Logging Implementation - Search Pipeline

**Date**: 2026-01-28  
**Goal**: Add comprehensive diagnostic logging to trace search requests and identify failure points  
**Status**: ✅ Implemented

---

## Overview

Added diagnostic logging to answer these questions for every search requestId:

- **A)** Did UI receive WS error/progress?
- **B)** Did server reach Google stage?
- **C)** Was failure DNS vs timeout vs HTTP error?
- **D)** Was assistant fallback published on failure?

---

## Changes Summary

### 1. Enhanced `fetch-with-timeout.ts`

**Added**:
- ✅ DNS preflight check (optional, via `ENABLE_DNS_PREFLIGHT=true`)
- ✅ Typed error kinds: `DNS_FAIL`, `TIMEOUT`, `ABORT`, `HTTP_ERROR`, `NETWORK_ERROR`
- ✅ Safe URL parsing (logs host + path only, no query params or API keys)
- ✅ Duration measurement for all requests
- ✅ Detailed error logging with error kind classification

**New Error Type**:
```typescript
export type FetchErrorKind = 'DNS_FAIL' | 'TIMEOUT' | 'ABORT' | 'HTTP_ERROR' | 'NETWORK_ERROR';

export interface TimeoutError extends Error {
  code: 'UPSTREAM_TIMEOUT';
  provider: string;
  timeoutMs: number;
  stage: string;
  requestId?: string;
  errorKind: FetchErrorKind;
  host: string;
}
```

**DNS Preflight** (optional):
```typescript
// Enable with ENABLE_DNS_PREFLIGHT=true in .env
const dnsResult = await checkDns(urlObj.hostname, 1500);
// Logs: [FETCH] DNS preflight places.googleapis.com: ✓ 6 IPs (234ms)
```

**Request Logging**:
```typescript
// Before request
console.log(`[FETCH] POST places.googleapis.com/v1/places:searchText timeout=8000ms stage=google_maps requestId=req-123`);

// After success
console.log(`[FETCH] Response 200 from places.googleapis.com/v1/places:searchText (1234ms)`);

// On error
console.error(`[FETCH] TIMEOUT places.googleapis.com after 8012ms: timeout error message`);
```

---

### 2. Enhanced `google-maps.stage.ts`

**Pre-Request Diagnostics**:
```typescript
logger.info({
  requestId,
  provider: 'google_places_new',
  providerMethod: 'searchText', // or 'searchNearby'
  hostname: 'places.googleapis.com',
  path: '/v1/places:searchText',
  timeoutMs: 8000,
  googleApiKeyPresent: true,
  keyLen: 39,
  method: 'POST',
  event: 'google_api_call_start'
}, '[GOOGLE] Starting API call');
```

**Success Logging**:
```typescript
logger.info({
  requestId,
  provider: 'google_places_new',
  providerMethod: 'searchText',
  durationMs: 1234,
  placesCount: 8,
  event: 'google_api_call_success'
}, '[GOOGLE] API call succeeded');
```

**Error Logging** (with errorKind):
```typescript
logger.error({
  requestId,
  provider: 'google_places_new',
  providerMethod: 'searchText',
  errorKind: 'TIMEOUT', // or DNS_FAIL, HTTP_ERROR, NETWORK_ERROR
  host: 'places.googleapis.com',
  timeoutMs: 8000,
  durationMs: 8012,
  error: 'google_places timeout after 8000ms',
  event: 'google_api_call_failed'
}, '[GOOGLE] API call failed in catch block');
```

**Stage Failure Logging**:
```typescript
logger.error({
  requestId,
  pipelineVersion: 'route2',
  stage: 'google_maps',
  event: 'stage_failed',
  durationMs: 8150,
  providerMethod: 'searchText',
  errorKind: 'TIMEOUT', // ✅ NEW: extracted from TimeoutError
  error: 'google_places timeout after 8000ms'
}, '[ROUTE2] google_maps failed');
```

---

### 3. Enhanced WebSocket Error Publishing

**WebSocket Manager** (`websocket-manager.ts`):
```typescript
// Extract error details if this is an error message
const errorDetails = message.type === 'error' && 'code' in message 
  ? {
      errorType: message.code,
      errorMessage: message.message?.substring(0, 100),
      errorStage: message.stage,
      errorKind: message.errorKind // ✅ NEW
    }
  : {};

logger.info({
  channel,
  requestId,
  clientCount: sent,
  payloadType: 'error',
  durationMs,
  ...errorDetails // ✅ Includes errorKind for error messages
}, 'websocket_published');
```

**Example Error WS Log**:
```json
{
  "level": "info",
  "channel": "search",
  "requestId": "req-123",
  "clientCount": 1,
  "payloadType": "error",
  "errorType": "SEARCH_FAILED",
  "errorMessage": "google_places timeout after 8000ms",
  "errorStage": "google_maps",
  "errorKind": "TIMEOUT",
  "msg": "websocket_published"
}
```

---

### 4. Assistant Fallback on Pipeline Failure

**Route2 Orchestrator** (`route2.orchestrator.ts`):

**Pipeline Failure Logging**:
```typescript
logger.error({
  requestId,
  pipelineVersion: 'route2',
  event: 'pipeline_failed',
  durationMs,
  errorKind: 'TIMEOUT', // ✅ NEW: extracted from error
  errorStage: 'google_maps', // ✅ NEW: extracted from error
  error: 'google_places timeout after 8000ms'
}, '[ROUTE2] Pipeline failed');
```

**Assistant Fallback Message** (published to `assistant` channel):
```typescript
// Publish assistant fallback message on failure (best-effort)
if (ASSISTANT_MODE_ENABLED && wsManager) {
  const fallbackMessage = generateFailureFallbackMessage(errorKind, error);
  const assistantPayload = {
    type: 'assistant_message',
    requestId,
    narrator: {
      type: 'ERROR_FALLBACK',
      message: fallbackMessage.message, // Hebrew error message
      question: null,
      suggestedAction: fallbackMessage.suggestedAction, // 'retry' or 'refine_query'
      blocksSearch: false
    },
    timestamp: Date.now()
  };
  
  wsManager.publishToChannel('assistant', requestId, ctx.sessionId, assistantPayload);
}
```

**Fallback Messages by Error Kind**:

| errorKind | Hebrew Message | Suggested Action |
|-----------|----------------|------------------|
| `DNS_FAIL` | אנחנו נתקלים בבעיה בחיבור לשרתים. אנא נסה שוב בעוד מספר דקות. | `retry` |
| `TIMEOUT` | החיפוש לוקח יותר זמן מהרגיל. אנא נסה שוב עם חיפוש ספציפי יותר. | `refine_query` |
| `NETWORK_ERROR` | יש לנו בעיה זמנית בחיבור לשירות. נסה שוב בעוד רגע. | `retry` |
| `HTTP_ERROR` (403/401) | יש לנו בעיה זמנית בגישה לשירות החיפוש. אנחנו עובדים על זה. | `null` |
| `HTTP_ERROR` (other) | החיפוש נתקל בבעיה. אנא נסה שוב. | `retry` |
| `UNKNOWN` | משהו השתבש בחיפוש. אנא נסה שוב או שנה את החיפוש. | `retry` |

---

## Files Changed

### Modified (4 files)

1. ✅ `server/src/utils/fetch-with-timeout.ts` - DNS preflight + error kind classification
2. ✅ `server/src/services/search/route2/stages/google-maps.stage.ts` - Pre-request diagnostics + error kind extraction
3. ✅ `server/src/infra/websocket/websocket-manager.ts` - Error details in WS publish logs
4. ✅ `server/src/services/search/route2/route2.orchestrator.ts` - Pipeline error kind + assistant fallback

**Total**: 4 modified files

---

## Diagnostic Flow Example

### Scenario: Google Places Timeout

**1. Pre-Request (google-maps.stage.ts)**:
```json
{
  "level": "info",
  "requestId": "req-123",
  "provider": "google_places_new",
  "providerMethod": "searchText",
  "googleApiKeyPresent": true,
  "keyLen": 39,
  "timeoutMs": 8000,
  "event": "google_api_call_start",
  "msg": "[GOOGLE] Starting API call"
}
```

**2. Fetch Start (fetch-with-timeout.ts console)**:
```
[FETCH] POST places.googleapis.com/v1/places:searchText timeout=8000ms stage=google_maps requestId=req-123
```

**3. Fetch Timeout (fetch-with-timeout.ts console)**:
```
[FETCH] TIMEOUT places.googleapis.com after 8012ms: google_places timeout after 8000ms
```

**4. API Call Failed (google-maps.stage.ts)**:
```json
{
  "level": "error",
  "requestId": "req-123",
  "providerMethod": "searchText",
  "errorKind": "TIMEOUT",
  "host": "places.googleapis.com",
  "timeoutMs": 8000,
  "durationMs": 8012,
  "event": "google_api_call_failed",
  "msg": "[GOOGLE] API call failed in catch block"
}
```

**5. Stage Failed (google-maps.stage.ts)**:
```json
{
  "level": "error",
  "requestId": "req-123",
  "stage": "google_maps",
  "event": "stage_failed",
  "durationMs": 8150,
  "providerMethod": "searchText",
  "errorKind": "TIMEOUT",
  "msg": "[ROUTE2] google_maps failed"
}
```

**6. Pipeline Failed (route2.orchestrator.ts)**:
```json
{
  "level": "error",
  "requestId": "req-123",
  "event": "pipeline_failed",
  "durationMs": 8200,
  "errorKind": "TIMEOUT",
  "errorStage": "google_maps",
  "msg": "[ROUTE2] Pipeline failed"
}
```

**7. Assistant Fallback Published (route2.orchestrator.ts)**:
```json
{
  "level": "info",
  "requestId": "req-123",
  "channel": "assistant",
  "event": "fallback_assistant_published",
  "errorKind": "TIMEOUT",
  "msg": "[NARRATOR] Published fallback assistant message on pipeline failure"
}
```

**8. WebSocket Error Published (websocket-manager.ts)**:
```json
{
  "level": "info",
  "channel": "search",
  "requestId": "req-123",
  "clientCount": 1,
  "payloadType": "error",
  "errorType": "SEARCH_FAILED",
  "errorStage": "google_maps",
  "errorKind": "TIMEOUT",
  "msg": "websocket_published"
}
```

**9. WebSocket Assistant Message Published (websocket-manager.ts)**:
```json
{
  "level": "info",
  "channel": "assistant",
  "requestId": "req-123",
  "clientCount": 1,
  "payloadType": "assistant_message",
  "msg": "websocket_published"
}
```

---

## Answering the Diagnostic Questions

### A) Did UI receive WS error/progress?

**Search logs for**:
```
websocket_published channel="search" requestId="req-123"
```

**Check**:
- `payloadType: "error"` → UI received error
- `payloadType: "status"` → UI received progress
- `clientCount > 0` → At least one client received it

### B) Did server reach Google stage?

**Search logs for**:
```
google_api_call_start requestId="req-123"
```

**If found**: Yes, server started Google API call  
**If not found**: No, failed before Google stage (gate2, intent, route_llm)

### C) Was failure DNS vs timeout vs HTTP error?

**Search logs for**:
```
errorKind requestId="req-123"
```

**Error kinds**:
- `DNS_FAIL` → DNS resolution failed
- `TIMEOUT` → Request timed out (8+ seconds)
- `NETWORK_ERROR` → Connection refused/reset
- `HTTP_ERROR` → API returned non-200 status
- `UNKNOWN` → Other error

### D) Was assistant fallback published on failure?

**Search logs for**:
```
fallback_assistant_published requestId="req-123"
```

**If found**: Yes, assistant fallback message was published to WS  
**If not found**: Either `ASSISTANT_MODE` is disabled or publish failed (check for `Failed to publish fallback` warn log)

---

## Configuration

### Optional DNS Preflight

**Enable** (adds ~200ms overhead but provides DNS diagnostics):
```bash
# In server/.env
ENABLE_DNS_PREFLIGHT=true
```

**When enabled, logs**:
```
[FETCH] DNS preflight places.googleapis.com: ✓ 6 IPs (234ms)
```

or

```
[FETCH] DNS preflight places.googleapis.com: ✗ ENOTFOUND (1502ms)
```

### Existing Config

- `GOOGLE_PLACES_TIMEOUT_MS` - Google Places API timeout (default 8000ms)
- `ASSISTANT_MODE` - Enable assistant messages (default false)
- `DEBUG_NARRATOR` - Verbose narrator logs (default false)

---

## Testing

### Manual Test: Timeout Simulation

1. Set very low timeout:
   ```bash
   GOOGLE_PLACES_TIMEOUT_MS=100
   ```

2. Run search query

3. Check logs for complete flow:
   - ✅ `google_api_call_start`
   - ✅ `[FETCH] POST places.googleapis.com...`
   - ✅ `[FETCH] TIMEOUT places.googleapis.com...`
   - ✅ `google_api_call_failed` with `errorKind: "TIMEOUT"`
   - ✅ `stage_failed` with `errorKind: "TIMEOUT"`
   - ✅ `pipeline_failed` with `errorKind: "TIMEOUT"`
   - ✅ `fallback_assistant_published` (if `ASSISTANT_MODE=true`)
   - ✅ `websocket_published` with `errorKind: "TIMEOUT"`

### Manual Test: DNS Failure Simulation

1. Enable DNS preflight:
   ```bash
   ENABLE_DNS_PREFLIGHT=true
   ```

2. Use invalid hostname (requires code change for testing)

3. Check logs for:
   - ✅ `[FETCH] DNS preflight invalid.hostname: ✗ ENOTFOUND`
   - ✅ `errorKind: "DNS_FAIL"`

---

## Summary

| Feature | Status |
|---------|--------|
| DNS preflight check | ✅ Implemented (optional) |
| Error kind classification | ✅ 5 types (DNS_FAIL, TIMEOUT, etc.) |
| Safe URL logging | ✅ Host + path only |
| Duration measurement | ✅ All requests |
| Pre-request diagnostics | ✅ API key presence, timeout config |
| Error kind in stage logs | ✅ Extracted from TimeoutError |
| Error kind in WS logs | ✅ Included in websocket_published |
| Assistant fallback on failure | ✅ Hebrew messages + suggested actions |
| Pipeline error tracking | ✅ errorKind + errorStage |

**Status**: All requirements implemented ✅  
**Behavior**: No changes except added logs + assistant fallback  
**Diffs**: Minimal (4 files modified)

---

**Next Steps**:
1. Restart server to activate new logging
2. Run search query to test flow
3. Use logs to diagnose any failures with `errorKind` classification
4. Frontend can display assistant fallback messages on errors
