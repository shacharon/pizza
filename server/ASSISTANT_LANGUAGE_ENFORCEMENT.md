# assistantLanguage Enforcement

## Overview

This document describes the backend enforcement of `assistantLanguage` across the entire search flow.

## Rules

1. **assistantLanguage is decided ONCE** (Gate2 or Intent) and becomes authoritative for the request
2. **assistantLanguage MUST be stored** in `ctx.langCtx.assistantLanguage` (request-scoped)
3. **Every WebSocket assistant message MUST include**:
   - `requestId`
   - `assistantLanguage`
   - `type`
   - `payload.message` (optional `payload.question`)
4. **Never publish assistant text** without `assistantLanguage`
5. **If assistantLanguage is missing** at publish time:
   - Set `assistantLanguage = 'en'`
   - Log WARN with `requestId` + stage
6. **DO NOT guess language** from text
7. **DO NOT derive language** from UI
8. **DO NOT change assistantLanguage** mid-flow

## Implementation

### 1. WS Message Type (Source of Truth)

```typescript
// websocket-protocol.ts
export interface WSServerAssistant {
  type: "assistant";
  requestId: string;
  assistantLanguage: "he" | "en" | "ar" | "ru" | "fr" | "es"; // REQUIRED
  payload: {
    type:
      | "GATE_FAIL"
      | "CLARIFY"
      | "SUMMARY"
      | "SEARCH_FAILED"
      | "GENERIC_QUERY_NARRATION"
      | "NUDGE_REFINE";
    message: string;
    question: string | null;
    blocksSearch: boolean;
    suggestedAction?: "REFINE_QUERY";
  };
}
```

### 2. Unified Publisher Function

**ALL assistant publishes** go through `publishAssistantMessage()`:

```typescript
// assistant-publisher.ts
export function publishAssistantMessage(
  wsManager: WebSocketManager,
  requestId: string,
  sessionId: string | undefined,
  assistant: AssistantOutput | AssistantPayload,
  langCtx: LangCtx | undefined,
  uiLanguageFallback?: "he" | "en"
): void {
  // Resolve assistantLanguage from hierarchy:
  // Priority 1: langCtx.assistantLanguage (authoritative)
  // Priority 2: payload.language (legacy)
  // Priority 3: uiLanguageFallback (request context)
  // Priority 4: Hard fallback to 'en'

  const assistantLanguage = resolveAssistantLanguage(
    requestId,
    langCtx,
    assistant,
    uiLanguageFallback,
    stage
  );

  // Publish WS message with assistantLanguage at top level
  const message = {
    type: "assistant",
    requestId,
    assistantLanguage, // Required field
    payload: {
      type: assistant.type,
      message: assistant.message,
      question: assistant.question,
      blocksSearch: assistant.blocksSearch,
    },
  };

  wsManager.publishToChannel("assistant", requestId, sessionId, message);
}
```

### 3. Context Initialization

`langCtx` is set in orchestrator immediately after Gate2:

```typescript
// route2.orchestrator.ts (line 90-105)
const gateResult = await executeGate2Stage(request, ctx);

// CRITICAL: Initialize langCtx IMMEDIATELY (before any guards/publishes)
if (gateResult.gate && !ctx.langCtx) {
  const assistantLanguage = resolveAssistantLanguage(
    ctx,
    request,
    gateResult.gate.language,
    gateResult.gate.confidence
  );

  ctx.langCtx = {
    assistantLanguage,
    assistantLanguageConfidence: gateResult.gate.confidence || 0,
    uiLanguage: assistantLanguage,
    providerLanguage: assistantLanguage,
    region: "IL",
  };

  logger.info(
    {
      requestId,
      event: "langCtx_initialized",
      source: "gate2",
      assistantLanguage,
      confidence: gateResult.gate.confidence,
    },
    "[ROUTE2] langCtx initialized from Gate2"
  );
}
```

### 4. Assistant Publish Call Sites

**All call sites** use unified publisher:

```typescript
// orchestrator.guards.ts - Gate2 stop/clarify
publishAssistantMessage(
  wsManager,
  requestId,
  sessionId,
  assistant,
  ctx.langCtx, // Always present (set by orchestrator)
  request.uiLanguage
);

// assistant-integration.ts - Summary/Search failed
publishAssistantMessage(
  wsManager,
  requestId,
  sessionId,
  assistant,
  langCtxSnapshot, // Captured before async call
  uiLanguageSnapshot
);
```

## Data Flow

```
Gate2 Result
    ↓
    language: 'fr'
    confidence: 0.85
    ↓
Orchestrator (line 90-105)
    ↓
    ctx.langCtx = {
      assistantLanguage: 'fr',
      assistantLanguageConfidence: 0.85,
      uiLanguage: 'fr',
      providerLanguage: 'fr',
      region: 'IL'
    }
    ↓
Guard/Stage calls publishAssistantMessage()
    ↓
    publishAssistantMessage(wsManager, requestId, sessionId, assistant, ctx.langCtx, fallback)
    ↓
Publisher resolves language
    ↓
    assistantLanguage = langCtx.assistantLanguage // 'fr'
    ↓
WS Message
    ↓
    {
      type: 'assistant',
      requestId: 'req-123',
      assistantLanguage: 'fr', ← Required field
      payload: {
        type: 'GATE_FAIL',
        message: 'Message in French',
        question: null,
        blocksSearch: true
      }
    }
```

## Fallback Hierarchy

If `langCtx` is missing at publish time (defensive):

1. **langCtx.assistantLanguage** (authoritative) → Use this
2. **payload.language** (legacy path) → Use + WARN
3. **uiLanguageFallback** (request context) → Use + WARN
4. **Hard fallback 'en'** → Use + WARN

All fallbacks log WARN with:

- `requestId`
- `stage` (where missing)
- `reason` (why fallback triggered)

## Tests

### Unit Tests

```typescript
// assistant-publisher-enforcement.test.ts
describe("Assistant Publisher - Language Enforcement", () => {
  it("should fail if any assistant publish is missing assistantLanguage", () => {
    // Publishes message
    // Asserts message.assistantLanguage is present
  });

  it("should use langCtx.assistantLanguage as source of truth", () => {
    // langCtx.assistantLanguage = 'fr'
    // payload.language = 'en'
    // Asserts message.assistantLanguage === 'fr'
  });

  it("should assert assistantLanguage is identical across all assistant events for the same requestId", () => {
    // Publishes GATE_FAIL, CLARIFY, SUMMARY with same langCtx
    // Asserts all have identical assistantLanguage
  });

  it("should correctly handle all 6 supported languages", () => {
    // Tests: he, en, ar, ru, fr, es
  });
});
```

**Test Results:** ✅ All 12 tests passing

### Integration Test

Run existing tests to ensure no regressions:

```bash
cd server
npm test
```

## Changes Made

### Core Files

1. **`websocket-protocol.ts`**

   - Moved `assistantLanguage` from `payload.uiLanguage` to top-level `assistantLanguage`
   - Made `assistantLanguage` REQUIRED on `WSServerAssistant`

2. **`assistant-publisher.ts`**

   - Added `resolveAssistantLanguage()` with 4-tier fallback hierarchy
   - Updated `publishAssistantMessage()` to resolve and enforce `assistantLanguage`
   - All publishes now include `assistantLanguage` at top level
   - Logs WARN when fallback is used

3. **`route2.orchestrator.ts`**

   - Ensured `langCtx` initialization happens immediately after Gate2
   - Added info log when `langCtx` is initialized

4. **`types.ts`**

   - Updated `Route2Context.langCtx` documentation
   - Clarified that `assistantLanguage` MUST be present before any WS publish

5. **`assistant-publisher-enforcement.test.ts`** (NEW)
   - Unit tests for language enforcement
   - Tests fallback hierarchy
   - Tests consistency across multiple publishes
   - Tests all 6 supported languages

## Verification

### Logs to Monitor

1. **langCtx initialization:**

```json
{
  "requestId": "req-123",
  "event": "langCtx_initialized",
  "source": "gate2",
  "assistantLanguage": "fr",
  "confidence": 0.85
}
```

2. **Assistant publish (success):**

```json
{
  "requestId": "req-123",
  "event": "assistant_ws_publish",
  "assistantLanguage": "fr",
  "assistantType": "GATE_FAIL"
}
```

3. **Fallback warning (if langCtx missing):**

```json
{
  "requestId": "req-789",
  "event": "assistant_language_hard_fallback",
  "stage": "assistant_type:SUMMARY",
  "fallbackLanguage": "en",
  "reason": "all_sources_missing"
}
```

### Query Tests

Test with different languages:

1. Query: "pizza" (English)

   - `assistantLanguage` should be `'en'`

2. Query: "פיצה" (Hebrew)

   - `assistantLanguage` should be `'he'`

3. Query: "pizza" with `uiLanguage: 'fr'` in request

   - `assistantLanguage` should be detected by Gate2 (likely `'en'` or `'fr'`)

4. Multiple queries in same session
   - Each has own `assistantLanguage` based on its Gate2/Intent result
   - **NOT** carried over from previous query

## Contract

### Frontend Contract

Frontend receives:

```typescript
{
  type: 'assistant',
  requestId: 'req-123',
  assistantLanguage: 'fr', // Use this for UI language switching
  payload: {
    type: 'GATE_FAIL',
    message: 'Message in French',
    question: null,
    blocksSearch: true
  }
}
```

Frontend MUST:

- Use `assistantLanguage` field (not `payload.language`)
- Switch UI language to match `assistantLanguage`
- Render `payload.message` in UI

### Backend Contract

Backend MUST:

- Set `ctx.langCtx.assistantLanguage` immediately after Gate2
- Pass `langCtx` to `publishAssistantMessage()` for ALL assistant publishes
- Never modify `assistantLanguage` after it's set
- Log WARN if `langCtx` is missing at publish time

## Status

✅ **Implementation Complete**
✅ **Tests Passing** (12/12)
✅ **Backward Compatible** (fallback to `'en'` if missing)
✅ **Enforced** (all publishes go through unified function)

---

**Last Updated:** 2026-02-01  
**Version:** 1.0.0
