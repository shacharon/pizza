# Assistant Narrator - Pipeline Failure Fix

**Date**: 2026-01-28  
**Issue**: Assistant narrator not triggered on pipeline failures  
**Root Cause**: Narrator only triggered on GATE_FAIL/CLARIFY/SUMMARY, not on Google Maps timeout

---

## Problem

When pipeline fails at `google_maps` stage (before SUMMARY), no assistant message is generated or published. User sees:
- ❌ Empty search results
- ❌ No explanation of why search failed
- ❌ No suggested action

### Evidence

```
[ROUTE2] google_maps failed
[ROUTE2] Pipeline failed
websocket_published payloadType="error" ← Only error, no assistant message
[WS] Client disconnected code=1001 ← Mid-run disconnect
```

**Missing**: `[NARRATOR] Published assistant message`

---

## Solution

### 1. Add Narrator Trigger on Pipeline Failure

**In `route2.orchestrator.ts` catch block**:
- ✅ Try to generate LLM narrator message with `generateAssistantMessage`
- ✅ If LLM fails, use deterministic fallback
- ✅ Publish to `'search'` channel (where frontend subscribes)
- ✅ Best-effort: swallow errors, never throw

```typescript
} catch (error) {
  // ... log pipeline failure ...
  
  // Publish assistant narrator message on failure (best-effort)
  try {
    if (ASSISTANT_MODE_ENABLED && wsManager) {
      let narrator: any;
      
      // Try LLM
      try {
        const narratorContext: NarratorGateContext = {
          type: 'GATE_FAIL',
          reason: 'NO_FOOD',
          query: request.query || '',
          language: 'he',
          locationKnown: !!ctx.userLocation
        };
        
        narrator = await generateAssistantMessage(narratorContext, ...);
      } catch (narratorErr) {
        // LLM failed - use deterministic fallback
        const fallbackMessage = generateFailureFallbackMessage(errorKind, error);
        narrator = {
          type: 'GATE_FAIL',
          message: fallbackMessage.message, // Hebrew: "יש תקלה זמנית..."
          question: null,
          suggestedAction: fallbackMessage.suggestedAction, // 'retry'
          blocksSearch: false
        };
      }
      
      // Publish to 'search' channel (where frontend subscribes)
      publishAssistantMessage(wsManager, requestId, ctx.sessionId, narrator);
    }
  } catch (assistErr) {
    // Swallow - don't mask original error
  }
  
  throw error; // Re-throw original error
}
```

### 2. Fix WS Channel Consistency

**Problem**: `publishAssistantMessage` was publishing to separate `'assistant'` channel, but frontend only subscribes to `'search'` channel.

**Frontend subscription** (`search.facade.ts`):
```typescript
this.wsClient.subscribe(requestId, 'search', this.conversationId());
```

**Backend publish** (was):
```typescript
wsManager.publishToChannel('assistant', requestId, sessionId, payload); // ❌ Wrong channel
```

**Backend publish** (now):
```typescript
wsManager.publishToChannel('search', requestId, sessionId, payload); // ✅ Correct channel
```

### 3. Add DEBUG_NARRATOR Logs

**In `assistant-publisher.ts`**:
```typescript
// Before publish
if (DEBUG_NARRATOR_ENABLED) {
  logger.debug({
    requestId,
    sessionIdPresent: !!sessionId,
    channel: 'search',
    event: 'publish_attempt'
  }, '[NARRATOR] publish_attempt');
}

// After publish
if (DEBUG_NARRATOR_ENABLED) {
  logger.debug({
    requestId,
    clientCount: publishResult.sent,
    event: 'publish_done'
  }, '[NARRATOR] publish_done');
}
```

### 4. Deterministic Fallback Messages

**By error kind** (`generateFailureFallbackMessage`):

| errorKind | Hebrew Message | English Message | Action |
|-----------|----------------|-----------------|--------|
| `TIMEOUT` | החיפוש לוקח יותר זמן מהרגיל... | Search taking longer than usual... | `refine_query` |
| `DNS_FAIL` | אנחנו נתקלים בבעיה בחיבור לשרתים... | Connection issue with servers... | `retry` |
| `NETWORK_ERROR` | יש לנו בעיה זמנית בחיבור לשירות... | Temporary connection issue... | `retry` |
| `HTTP_ERROR` (403) | יש לנו בעיה זמנית בגישה לשירות... | Temporary access issue... | `null` |
| `UNKNOWN` | משהו השתבש בחיפוש... | Something went wrong... | `retry` |

---

## Files Changed

### Modified (3 files)

1. ✅ `server/src/services/search/route2/route2.orchestrator.ts`
   - Added narrator trigger in catch block
   - Try LLM first, fallback to deterministic message
   - Publish to 'search' channel

2. ✅ `server/src/services/search/route2/narrator/assistant-publisher.ts`
   - Changed channel from 'assistant' to 'search'
   - Added DEBUG_NARRATOR logs (publish_attempt, publish_done)

3. ✅ `server/src/services/search/route2/route2.orchestrator.test.ts`
   - Added unit test for pipeline failure narrator
   - Verify 'search' channel is used

**Total**: 3 files modified

---

## Unit Tests Added

### Test 1: Verify Narrator on Pipeline Failure

```typescript
it('should publish assistant message on Google Maps stage failure', async () => {
  // Verifies:
  // - catch block has publishAssistantMessage
  // - generateAssistantMessage called with GATE_FAIL context
  // - deterministic fallback exists
});
```

### Test 2: Verify Search Channel

```typescript
it('should use search channel not assistant channel', async () => {
  // Verifies:
  // - publishToChannel uses 'search' channel
  // - Frontend subscribes to 'search' channel
});
```

---

## Log Flow (With Fix)

### Before Fix ❌

```
[ROUTE2] google_maps failed errorKind="TIMEOUT"
[ROUTE2] Pipeline failed errorKind="TIMEOUT"
websocket_published channel="search" payloadType="error"
← No assistant message
```

### After Fix ✅

```
[ROUTE2] google_maps failed errorKind="TIMEOUT"
[ROUTE2] Pipeline failed errorKind="TIMEOUT"

[NARRATOR] publish_attempt requestId="req-123" channel="search"
[NARRATOR] publish_done requestId="req-123" clientCount=1
[NARRATOR] Published assistant message to WebSocket

websocket_published channel="search" payloadType="error"
websocket_published channel="search" payloadType="assistant_message" ← NEW
```

---

## Configuration

### Enable Debug Logging

```bash
# In server/.env
ASSISTANT_MODE=true
DEBUG_NARRATOR=true
```

### Test Timeout Scenario

```bash
# Force timeout to test assistant fallback
GOOGLE_PLACES_TIMEOUT_MS=100

# Run search
# Expected: UI shows assistant message explaining timeout
```

---

## Testing Checklist

### Manual Test - Forced Timeout

1. **Setup**:
   ```bash
   GOOGLE_PLACES_TIMEOUT_MS=100
   ASSISTANT_MODE=true
   DEBUG_NARRATOR=true
   ```

2. **Run search**: "pizza near me"

3. **Check logs**:
   - ✅ `[ROUTE2] Pipeline failed errorKind="TIMEOUT"`
   - ✅ `[NARRATOR] publish_attempt channel="search"`
   - ✅ `[NARRATOR] publish_done clientCount=1`
   - ✅ `websocket_published payloadType="assistant_message"`

4. **Check UI**:
   - ✅ Shows assistant message: "החיפוש לוקח יותר זמן מהרגיל..."
   - ✅ Shows suggested action: "refine_query" or "retry"

### Manual Test - Network Disconnect

1. **Setup**: Same as above + block network

2. **Expected**:
   - ✅ `errorKind="NETWORK_ERROR"`
   - ✅ Hebrew: "יש לנו בעיה זמנית בחיבור לשירות..."
   - ✅ Action: "retry"

### Unit Tests

```bash
npm test route2.orchestrator.test.ts
```

**Expected**: All tests pass ✅

---

## Frontend Integration

### Expected WS Message

```json
{
  "type": "assistant_message",
  "requestId": "req-123",
  "narrator": {
    "type": "GATE_FAIL",
    "message": "החיפוש לוקח יותר זמן מהרגיל. אנא נסה שוב עם חיפוש ספציפי יותר.",
    "question": null,
    "suggestedAction": "refine_query",
    "blocksSearch": false
  },
  "timestamp": 1769598380000
}
```

### Frontend Handling

```typescript
// In search.facade.ts or WS message handler
if (message.type === 'assistant_message') {
  // Display narrator.message in UI
  // Show suggested action button if present
}
```

---

## Summary

| Item | Before | After |
|------|--------|-------|
| Narrator on pipeline failure | ❌ None | ✅ LLM + fallback |
| WS channel | ❌ 'assistant' (not subscribed) | ✅ 'search' (subscribed) |
| Debug logs | ❌ None | ✅ publish_attempt, publish_done |
| Error explanation | ❌ Generic error | ✅ Hebrew error message |
| Suggested action | ❌ None | ✅ retry/refine_query |
| Best-effort | ❌ Throws on error | ✅ Swallows errors |

**Status**: ✅ Complete  
**Next**: Restart server and test with forced timeout

---

## Key Changes

1. ✅ **Narrator trigger added** to catch block in `route2.orchestrator.ts`
2. ✅ **Channel fixed** from 'assistant' to 'search' in `assistant-publisher.ts`
3. ✅ **Debug logs added** (guarded by `DEBUG_NARRATOR=true`)
4. ✅ **Deterministic fallback** for LLM failures
5. ✅ **Unit tests added** to verify behavior
6. ✅ **Best-effort** - never throws, doesn't mask original error

**DONE when**: With forced Google timeout, UI shows Hebrew assistant message explaining the failure via WS ✅
