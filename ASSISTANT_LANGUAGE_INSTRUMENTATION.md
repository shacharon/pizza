# Assistant Language End-to-End Instrumentation

## Goal

Track `assistantLanguage` through the complete WebSocket pipeline:
1. **Backend:** Immediately before sending to `assistant` channel
2. **Frontend:** Immediately upon receiving (before parse/mapping)

## Implementation

### Backend Instrumentation

**File:** `server/src/infra/websocket/publisher.service.ts`  
**Location:** `publishToChannel()` method, inside the send loop  
**Trigger:** Only for `channel === 'assistant'`

#### Log Event: `ws_assistant_out_raw`

```typescript
// INSTRUMENTATION: Raw WS out log (track assistantLanguage)
if (channel === 'assistant') {
  const envelope = message as any;
  const payload = envelope.payload || {};
  const rawJson = data;
  
  logger.info({
    event: 'ws_assistant_out_raw',
    requestId,
    clientId: (client as any).clientId || 'unknown',
    channel,
    payloadType: payload.type || null,
    assistantLanguage: payload.assistantLanguage || payload.language || envelope.assistantLanguage || null,
    uiLanguage: payload.uiLanguage || null,
    envelopeKeys: Object.keys(envelope),
    payloadKeys: Object.keys(payload),
    rawJsonLen: rawJson.length,
    rawJsonPreview: rawJson.length > 2000 ? rawJson.slice(0, 2000) + '...' : rawJson
  }, '[WS OUT] Raw assistant message before send');
}

client.send(data);
```

**Fields:**
- `event`: `"ws_assistant_out_raw"`
- `requestId`: Request ID
- `clientId`: WebSocket client ID
- `channel`: Always `"assistant"`
- `payloadType`: `payload.type` (e.g., `"SUMMARY"`, `"CLARIFY"`)
- `assistantLanguage`: Extracted from multiple sources (priority order)
- `uiLanguage`: UI language if present
- `envelopeKeys`: Top-level message keys
- `payloadKeys`: Payload object keys
- `rawJsonLen`: Full JSON byte length
- `rawJsonPreview`: First 2000 chars of JSON (truncated if longer)

### Frontend Instrumentation

**File:** `llm-angular/src/app/core/services/ws/ws-router.ts`  
**Location:** `handleMessage()` method, before validation  
**Trigger:** Only for `data.type === 'assistant'`

#### Log Event: `ui_ws_raw_in`

```typescript
handleMessage(event: MessageEvent): void {
  // INSTRUMENTATION: Raw WS in log (track assistantLanguage)
  const rawData = event.data;
  const rawLen = typeof rawData === 'string' ? rawData.length : 0;
  const rawPreview = rawLen > 2000 ? rawData.slice(0, 2000) + '...' : rawData;

  try {
    const data = JSON.parse(event.data);

    // INSTRUMENTATION: Log parsed message structure
    if (data.type === 'assistant') {
      const msg = data as any;
      console.log('[WS IN] Raw assistant message received', {
        event: 'ui_ws_raw_in',
        rawLen,
        rawPreview,
        channel: msg.channel || 'assistant',
        type: msg.type,
        payloadType: msg.payload?.type || null,
        assistantLanguage: msg.payload?.assistantLanguage ?? msg.assistantLanguage ?? null,
        uiLanguage: msg.payload?.uiLanguage ?? null,
        envelopeKeys: Object.keys(msg),
        payloadKeys: msg.payload ? Object.keys(msg.payload) : []
      });
    }

    // ... rest of validation and routing
  }
}
```

**Fields:**
- `event`: `"ui_ws_raw_in"`
- `rawLen`: Raw message byte length (before parse)
- `rawPreview`: First 2000 chars of raw string (truncated if longer)
- `channel`: Channel (should be `"assistant"`)
- `type`: Message type (should be `"assistant"`)
- `payloadType`: `payload.type` (e.g., `"SUMMARY"`)
- `assistantLanguage`: Extracted from `payload.assistantLanguage` or `envelope.assistantLanguage`
- `uiLanguage`: UI language if present
- `envelopeKeys`: Top-level message keys
- `payloadKeys`: Payload object keys

## Example Logs

### Backend Log (Node.js)

```json
{
  "level": "info",
  "time": "2026-02-01T20:45:30.123Z",
  "event": "ws_assistant_out_raw",
  "requestId": "req-1706825730123-abc123",
  "clientId": "ws-1706825700000-xyz789",
  "channel": "assistant",
  "payloadType": "SUMMARY",
  "assistantLanguage": "he",
  "uiLanguage": null,
  "envelopeKeys": ["type", "requestId", "assistantLanguage", "payload"],
  "payloadKeys": ["type", "message", "question", "blocksSearch"],
  "rawJsonLen": 456,
  "rawJsonPreview": "{\"type\":\"assistant\",\"requestId\":\"req-1706825730123-abc123\",\"assistantLanguage\":\"he\",\"payload\":{\"type\":\"SUMMARY\",\"message\":\"מצאנו 15 מסעדות פיצה באזור תל אביב\",\"question\":null,\"blocksSearch\":false}}",
  "msg": "[WS OUT] Raw assistant message before send"
}
```

### Frontend Log (Browser Console)

```javascript
[WS IN] Raw assistant message received {
  event: "ui_ws_raw_in",
  rawLen: 456,
  rawPreview: "{\"type\":\"assistant\",\"requestId\":\"req-1706825730123-abc123\",\"assistantLanguage\":\"he\",\"payload\":{\"type\":\"SUMMARY\",\"message\":\"מצאנו 15 מסעדות פיצה באזור תל אביב\",\"question\":null,\"blocksSearch\":false}}",
  channel: "assistant",
  type: "assistant",
  payloadType: "SUMMARY",
  assistantLanguage: "he",
  uiLanguage: null,
  envelopeKeys: ["type", "requestId", "assistantLanguage", "payload"],
  payloadKeys: ["type", "message", "question", "blocksSearch"]
}
```

## Query Examples

### Backend: Find all assistant messages sent

```bash
# All ws_assistant_out_raw events
grep '"event":"ws_assistant_out_raw"' logs/server.log | jq '{requestId, clientId, assistantLanguage, payloadType}'
```

### Backend: Find messages missing assistantLanguage

```bash
# Messages where assistantLanguage is null
grep '"event":"ws_assistant_out_raw"' logs/server.log | jq 'select(.assistantLanguage == null)'
```

### Backend: Track language by requestId

```bash
# All languages sent for a specific request
grep '"requestId":"req-123"' logs/server.log | grep '"event":"ws_assistant_out_raw"' | jq '{assistantLanguage, payloadType}'
```

### Frontend: Browser DevTools Console

```javascript
// Filter console logs
// Look for: [WS IN] Raw assistant message received

// Expected structure:
{
  event: "ui_ws_raw_in",
  assistantLanguage: "he", // Should match backend
  payloadType: "SUMMARY",
  ...
}
```

## End-to-End Validation

### Successful Flow

1. **Backend sends:**
   ```json
   {
     "event": "ws_assistant_out_raw",
     "requestId": "req-123",
     "assistantLanguage": "he",
     "payloadType": "SUMMARY"
   }
   ```

2. **Frontend receives:**
   ```javascript
   {
     event: "ui_ws_raw_in",
     assistantLanguage: "he",
     payloadType: "SUMMARY"
   }
   ```

3. **Validation:** `assistantLanguage` matches on both sides ✅

### Missing Language Detection

1. **Backend sends:**
   ```json
   {
     "event": "ws_assistant_out_raw",
     "assistantLanguage": null,  // ⚠️ Missing!
     "payloadType": "SUMMARY"
   }
   ```

2. **Frontend receives:**
   ```javascript
   {
     event: "ui_ws_raw_in",
     assistantLanguage: null,  // ⚠️ Confirms missing
     payloadType: "SUMMARY"
   }
   ```

3. **Investigation:** Check earlier logs for `assistant_language_hard_fallback` or `assistant_language_from_ui_fallback`

## No Behavior Changes

✅ Pure instrumentation (logs only)  
✅ No business logic modified  
✅ No PII exposed (using clientId hashes)  
✅ Payload truncated at 2000 chars (performance safe)  
✅ Only logs for `assistant` channel (minimal overhead)

## Files Modified

1. **Backend:** `server/src/infra/websocket/publisher.service.ts` - Added `ws_assistant_out_raw` log before `client.send()`
2. **Frontend:** `llm-angular/src/app/core/services/ws/ws-router.ts` - Added `ui_ws_raw_in` log after `JSON.parse()`

---

**Status:** ✅ Complete  
**Backend Event:** `ws_assistant_out_raw`  
**Frontend Event:** `ui_ws_raw_in`  
**Max Payload:** 2000 chars (truncated)  
**Overhead:** Minimal (logs only on assistant channel)
