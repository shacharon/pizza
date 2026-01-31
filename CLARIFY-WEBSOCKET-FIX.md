# CLARIFY WebSocket Fix - Implementation Summary

## Goal

Fix the CLARIFY WebSocket path without changing architecture.

## Problem

The code in `orchestrator.guards.ts` was calling `wsManager.publishAssistant()` method which didn't exist on the WebSocketManager class. This caused a runtime error when trying to publish CLARIFY messages via WebSocket.

## Solution

### 1. Added `publishAssistant` method to WebSocketManager

**File**: `server/src/infra/websocket/websocket-manager.ts`

Added a thin wrapper method that:

- Accepts a requestId and payload object
- Constructs a proper WSServerMessage with type 'assistant'
- Delegates to existing `publishToChannel('assistant', ...)` method
- Returns PublishSummary for tracking

```typescript
publishAssistant(
  requestId: string,
  payload: {
    type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY' | 'SEARCH_FAILED' | 'GENERIC_QUERY_NARRATION' | 'NUDGE_REFINE';
    message?: string;
    question?: string | null;
    blocksSearch?: boolean;
    suggestedAction?: string;
    uiLanguage?: 'he' | 'en';
  }
): PublishSummary
```

### 2. Fixed the call in orchestrator.guards.ts

**File**: `server/src/services/search/route2/orchestrator.guards.ts`

Updated the call to properly pass the message payload:

```typescript
wsManager.publishAssistant(ctx.requestId, {
  type: "CLARIFY",
  message: intentDecision.reason || "Please provide more information",
  question: null,
  blocksSearch: true,
});
```

### 3. Fixed missing import in orchestrator.nearme.ts

**File**: `server/src/services/search/route2/orchestrator.nearme.ts`

- Added missing import: `import { buildEarlyExitResponse } from './orchestrator.response.js';`
- Added helper function `narrowLanguageForResponse` to convert Gate2Language to 'he' | 'en'
- Fixed type mismatch by using the narrow function

### 4. Updated test mocks

**File**: `server/src/services/search/route2/__tests__/near-me-hotfix.test.ts`

Added `publishAssistant: jest.fn()` to the wsManager mock to prevent test failures.

## Architecture Compliance

✅ No changes to types, schemas, or other logic
✅ Thin wrapper over existing WS publish method
✅ Uses correct channel: "assistant"
✅ Uses correct payloadType: "assistant"
✅ Proper export/binding ensured
✅ Method exists at runtime

## Testing

### Expected Behavior

**Test Query**: "restaurants near me" without location

**Expected Result**:

1. Intent stage detects CLARIFY route
2. handleIntentClarify is called
3. wsManager.publishAssistant is invoked with CLARIFY payload
4. Message is published to 'assistant' channel via WebSocket
5. No crash occurs
6. HTTP response includes CLARIFY assist message

### Verification Steps

1. TypeScript compilation passes (no type errors)
2. Method exists on WebSocketManager at runtime
3. publishAssistant returns PublishSummary structure
4. Message is properly formatted as WSServerMessage
5. Channel routing works correctly ('assistant' channel)

## Files Modified

1. `server/src/infra/websocket/websocket-manager.ts` - Added publishAssistant method
2. `server/src/services/search/route2/orchestrator.guards.ts` - Fixed method call
3. `server/src/services/search/route2/orchestrator.nearme.ts` - Added missing import and helper
4. `server/src/services/search/route2/__tests__/near-me-hotfix.test.ts` - Updated mock

## Status

✅ Implementation complete
✅ TypeScript compilation passes
✅ No architectural changes
✅ Ready for testing
