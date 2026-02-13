# SSE Assistant Migration - Test Guide

**Status:** ✅ Implemented (Feature Flag: `environment.features.useSseAssistant`)

---

## Changes Summary

### 1. New Service: AssistantSseService
**File:** `src/app/core/services/assistant-sse.service.ts`

- Wraps EventSource API for SSE connection
- Connects to: `GET /api/v1/stream/assistant/:requestId`
- Uses session cookie authentication (`withCredentials: true`)
- Listens for events: `meta`, `message`, `done`, `error`
- Also listens for `metadata` (backward compatibility)
- Auto-cleanup on unsubscribe

### 2. Feature Flag
**Files:** `src/environments/environment*.ts`

```typescript
features: {
  useSseAssistant: true  // Use SSE for assistant instead of WebSocket
}
```

- Default: `true` (enabled in all environments)
- Set to `false` to fallback to legacy WebSocket assistant

### 3. Modified: SearchWsHandler
**File:** `src/app/facades/search-ws.facade.ts`

- Checks feature flag `environment.features.useSseAssistant`
- If enabled: Subscribes to SSE for assistant, WS for search results only
- If disabled: Uses legacy WS for both assistant and search
- Routes SSE messages through existing `assistantHandler.routeMessage()`
- Cleanup: Unsubscribes from SSE when clearing subscriptions

### 4. Modified: SearchFacade
**File:** `src/app/facades/search.facade.ts`

- Passes `assistantHandler` to `subscribeToRequest()` for SSE routing

---

## SSE Event Flow

### Expected Sequence:

```
1. meta     → { requestId, language, startedAt }
2. message  → { type: 'GENERIC_QUERY_NARRATION', message: 'Searching now…', ... } (narration template)
3. message  → { type: 'SUMMARY', message: 'Found 5 great restaurants...', ... } (LLM summary)
4. done     → {}
```

### Handling:

- **meta**: Logged, can be used for connection status (currently ignored in UI)
- **message**: Routed to `assistantHandler.routeMessage()` (same as WS)
  - Narration (`GENERIC_QUERY_NARRATION`): Line message (progress indicator)
  - Summary/Clarify/Gate (`SUMMARY`, `CLARIFY`, `GATE_FAIL`): Card message (main UI)
- **done**: Closes SSE connection, marks complete
- **error**: Logs error, closes connection

---

## Manual Test Steps

### Prerequisites:

1. **Backend running:** `npm run dev` (port 3000)
2. **Redis running:** For job store (optional - SSE works without Redis)
3. **Session cookie configured:** `.env` has `SESSION_COOKIE_SECRET`
4. **Feature flag enabled:** Check `environment.ts` has `useSseAssistant: true`

### Test Procedure:

#### 1. Start Frontend

```bash
cd llm-angular
npm start
# OR
ng serve
```

Open: `http://localhost:4200`

#### 2. Login / Get Token

- Login with your credentials
- Token is stored in localStorage automatically

#### 3. Run Async Search

- Enter query: "best pizza in Tel Aviv"
- Ensure location is set (or app will use default)
- Click search button

#### 4. Observe Console Logs

**Expected SSE logs:**

```
[SearchWsHandler] Using SSE for assistant (WS assistant disabled)
[AssistantSSE] Connecting to SSE { requestId: 'req-...', url: 'http://localhost:3000/api/v1/stream/assistant/req-...' }
[AssistantSSE] meta event { requestId: 'req-...', language: 'en' }
[AssistantSSE] message event { type: 'GENERIC_QUERY_NARRATION', messageNum: 1, preview: 'Searching now… results in a moment.' }
[SearchWsHandler] SSE assistant message { type: 'GENERIC_QUERY_NARRATION', requestId: 'req-...', preview: 'Searching now…' }
[AssistantHandler][ROUTING] { type: 'GENERIC_QUERY_NARRATION', channel: 'line', routedTo: 'line' }
```

(Wait 2-5 seconds for results)

```
[AssistantSSE] message event { type: 'SUMMARY', messageNum: 2, preview: 'Found 5 great pizza places near you...' }
[SearchWsHandler] SSE assistant message { type: 'SUMMARY', requestId: 'req-...', preview: 'Found 5 great pizza places...' }
[AssistantHandler][ROUTING] { type: 'SUMMARY', channel: 'card', routedTo: 'card' }
[AssistantSSE] done event { messageCount: 2, requestId: 'req-...' }
[SearchWsHandler] SSE complete
```

**No WS assistant logs:**

```
✅ NO: [WS] Subscribing to assistant channel
✅ YES: [SearchWsHandler] Using SSE for assistant (WS assistant disabled)
```

#### 5. Observe UI Behavior

**Expected:**

1. **Narration appears immediately** (within 100-500ms):
   - Text: "Searching now… results in a moment." (or localized version)
   - Style: Line message or progress indicator (not a card)

2. **Results arrive via WS** (2-5 seconds):
   - WebSocket logs: `[WS] progress`, `[WS] ready: results`
   - Results cards displayed

3. **Summary appears after results ready**:
   - Text: "Found 5 great pizza places near you. Top picks: [names]..."
   - Style: Card message (main assistant UI)
   - Displayed below or alongside results

4. **Both messages visible**:
   - Narration (line) + Summary (card) both shown
   - No duplicate messages (dedup working)

---

## Verification Checklist

### SSE Connection:

- [ ] SSE connects to `/stream/assistant/:requestId` (check Network tab)
- [ ] No `Authorization` header sent (only cookie)
- [ ] Cookie `session=...` sent with request (check Request Headers)

### Event Sequence:

- [ ] `meta` event received
- [ ] First `message` event (narration) received immediately
- [ ] Second `message` event (summary) received after results ready
- [ ] `done` event received, connection closes

### Message Routing:

- [ ] Narration routed to `line` channel (check console logs)
- [ ] Summary routed to `card` channel (check console logs)
- [ ] No duplicates (dedup working)

### UI Display:

- [ ] Narration appears immediately (progress feedback)
- [ ] Summary appears after results (with restaurant names)
- [ ] Both messages visible in UI
- [ ] Results still arrive via WebSocket (unchanged)

### Fallback (Feature Flag Off):

- [ ] Set `environment.features.useSseAssistant = false`
- [ ] Reload app, run search
- [ ] WS logs: "Using WS for assistant (legacy)"
- [ ] No SSE connection in Network tab
- [ ] Assistant messages arrive via WS (legacy behavior)

---

## Troubleshooting

### "No SSE connection in Network tab"

**Cause:** Feature flag disabled or SSE service not injected

**Fix:**
- Check `environment.ts` has `useSseAssistant: true`
- Restart `ng serve`

---

### "SSE connects but no messages"

**Cause:** Backend not sending events, or job not ready

**Fix:**
- Check backend logs for `assistant_sse_started`, `assistant_sse_narration_sent`
- Ensure search request is async (`mode=async`)
- Check Redis is running (for job store)

---

### "Cookie not sent with SSE request"

**Cause:** CORS credentials not configured

**Fix:**
- Backend `.env`: Ensure `FRONTEND_ORIGINS=http://localhost:4200`
- Backend CORS: Check `Access-Control-Allow-Credentials: true`
- EventSource: Already uses `withCredentials: true`

---

### "Narration appears but no summary"

**Cause:** Results not ready within timeout (20s)

**Fix:**
- Check backend logs for `assistant_sse_timeout`
- Increase `ASSISTANT_SSE_TIMEOUT_MS` in backend `.env`
- Check search pipeline is completing (results arriving?)

---

### "Duplicate messages in UI"

**Cause:** Dedup not working, or both WS and SSE enabled

**Fix:**
- Check feature flag is `true` (only SSE for assistant)
- Check console logs: Should see "Using SSE for assistant (WS assistant disabled)"
- If both WS and SSE are active, verify feature flag logic

---

## Network Tab Inspection

### SSE Request (Chrome DevTools):

**General:**
```
Request URL: http://localhost:3000/api/v1/stream/assistant/req-abc123...
Request Method: GET
Status Code: 200 OK
```

**Request Headers:**
```
Accept: text/event-stream
Cookie: session=eyJhbGc...   ← Session cookie sent!
```

**Response Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
Access-Control-Allow-Credentials: true   ← CORS credentials enabled
```

**Response (EventStream tab):**
```
event: meta
data: {"requestId":"req-...","language":"en","startedAt":"2026-02-13T..."}

event: message
data: {"type":"GENERIC_QUERY_NARRATION","message":"Searching now… results in a moment.","question":null,"blocksSearch":false,"language":"en"}

event: message
data: {"type":"SUMMARY","message":"Found 5 great pizza places...","question":null,"blocksSearch":false,"language":"en"}

event: done
data: {}
```

---

## Rollback Plan

If issues arise, disable the feature flag:

**File:** `src/environments/environment.ts`

```typescript
features: {
  useSseAssistant: false  // Fallback to WebSocket assistant
}
```

**Result:**
- WS will handle both search and assistant channels (legacy behavior)
- SSE service not used
- No code changes required (feature flag controlled)

---

## Summary

✅ **SSE for assistant** - Enabled by default  
✅ **WS for search results** - Unchanged  
✅ **Feature flag** - Easy rollback  
✅ **Backward compatible** - Legacy WS still works  
✅ **No breaking changes** - Existing UI and state management reused  

**Test now:**
1. Run search
2. Check console for SSE logs
3. Verify narration appears immediately
4. Verify summary appears after results
5. Confirm WS still delivers results

**Next steps (after testing):**
- Monitor production SSE performance
- Remove WS assistant code (if SSE stable)
- Add SSE reconnection logic (optional enhancement)
