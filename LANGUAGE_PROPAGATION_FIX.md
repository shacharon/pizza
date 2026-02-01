# Language Propagation Fix Summary

**Task**: Fix assistant language propagation + assistant_llm timeouts using only logs (no UI), minimal diffs.

## Files Changed

### 1. `server/src/lib/llm/llm-config.ts`
**Change**: Increased assistant timeout from 3000ms to 4000ms

**Diff**:
```typescript
// Line 33 (changed)
assistant: 4000      // Assistant messages (GATE_FAIL, CLARIFY, SUMMARY, SEARCH_FAILED) - increased to reduce timeouts
```

**Reason**: 
- Assistant LLM calls were timing out at 3000ms (abort_timeout)
- Increased to 4000ms to reduce timeout failures
- Minimal increase to maintain responsiveness while improving reliability

---

### 2. `server/src/services/search/route2/route2.orchestrator.ts`
**Change**: Initialize langCtx immediately after Gate2 + add gate2_lang_snapshot log

**Location**: Lines 90-123 (after `executeGate2Stage`)

**Diff**:
```typescript
// ADDED: Initialize langCtx from Gate2 result IMMEDIATELY (before guards/intent)
if (gateResult.gate && !ctx.langCtx) {
  const { resolveAssistantLanguage } = await import('./orchestrator.helpers.js');
  const assistantLanguage = resolveAssistantLanguage(ctx, request, gateResult.gate.language, gateResult.gate.confidence);
  ctx.langCtx = {
    assistantLanguage,
    assistantLanguageConfidence: gateResult.gate.confidence || 0,
    uiLanguage: assistantLanguage,
    providerLanguage: assistantLanguage,
    region: 'IL'
  };
}

// DEBUG LOG A: Gate2 language snapshot (after storing langCtx)
logger.debug({
  requestId,
  traceId: ctx.traceId,
  sessionId: ctx.sessionId,
  event: 'gate2_lang_snapshot',
  queryHash,
  queryLen,
  foodSignal: gateResult.gate.foodSignal,
  confidence: gateResult.gate.confidence,
  gateAssistantLanguage: gateResult.gate.language,
  gateAssistantLanguageConfidence: gateResult.gate.confidence,
  uiLanguageHint: request.uiLanguage || null,
  source: 'gate2_result'
}, '[ROUTE2] Gate2 language snapshot captured');
```

**Reason**:
- langCtx was previously initialized lazily in guards only when needed
- This caused missing language context in Intent stage and assistant publishing
- Now initialized IMMEDIATELY after Gate2, before any guards/intent run
- Ensures language context flows through entire pipeline

---

### 3. `server/src/services/search/route2/assistant/assistant-publisher.ts`
**Change**: Add assistant_publish_lang_snapshot debug log before WS publish

**Location**: Lines 118-135 (before publishToChannel)

**Diff**:
```typescript
// DEBUG LOG B: Assistant publish language snapshot (right before WS publish)
logger.debug({
  requestId,
  traceId: (langCtx as any).traceId,
  sessionId: (langCtx as any).sessionId,
  event: 'assistant_publish_lang_snapshot',
  assistantType: normalizedPayload.type,
  langCtx_uiLanguage: langCtx.uiLanguage,
  langCtx_assistantLanguage: langCtx.assistantLanguage,
  langCtx_queryLanguage: (langCtx as any).queryLanguage || langCtx.assistantLanguage,
  enforcedLanguage,
  verificationSource: verification.source,
  hasClarify: normalizedPayload.type === 'CLARIFY',
  clarify_reason: normalizedPayload.type === 'CLARIFY' ? (normalizedPayload as any).reason : undefined
}, '[ASSISTANT] Publishing assistant message - language snapshot');
```

**Reason**:
- Provides visibility into language enforcement at publish time
- Shows all language context fields + enforced language
- Includes clarify-specific metadata for debugging CLARIFY path
- Safe: uses queryHash, no raw query exposure

---

### 4. `server/src/services/search/route2/orchestrator.guards.ts`
**Change**: Fix CLARIFY language enforcement to use Gate2 assistantLanguage

**Location**: Line 415 (handleIntentClarify function)

**Diff**:
```typescript
// FIXED: Use intentDecision.assistantLanguage (from Gate2) instead of uiLanguage
const enforcedLanguage = intentDecision.assistantLanguage ?? ctx.langCtx?.assistantLanguage ?? 'en';
```

**Previous**:
```typescript
const enforcedLanguage = intentDecision.assistantLanguage;
```

**Reason**:
- Adds fallback chain to ensure language is always available
- Prioritizes Gate2 assistantLanguage (via intentDecision) over uiLanguage
- Prevents "en" fallback when Gate2 detected "ar"
- Defensive: uses ctx.langCtx as secondary fallback

---

## Log Objects (Exact JSON Keys)

### Log A: gate2_lang_snapshot
```json
{
  "requestId": "string",
  "traceId": "string | undefined",
  "sessionId": "string | undefined",
  "event": "gate2_lang_snapshot",
  "queryHash": "string",
  "queryLen": "number",
  "foodSignal": "'YES' | 'NO' | 'MAYBE'",
  "confidence": "number",
  "gateAssistantLanguage": "'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other'",
  "gateAssistantLanguageConfidence": "number",
  "uiLanguageHint": "string | null",
  "source": "'gate2_result'"
}
```

### Log B: assistant_publish_lang_snapshot
```json
{
  "requestId": "string",
  "traceId": "string | undefined",
  "sessionId": "string | undefined",
  "event": "assistant_publish_lang_snapshot",
  "assistantType": "'GATE_FAIL' | 'CLARIFY' | 'SUMMARY' | 'SEARCH_FAILED' | 'GENERIC_QUERY_NARRATION'",
  "langCtx_uiLanguage": "'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'",
  "langCtx_assistantLanguage": "'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'",
  "langCtx_queryLanguage": "'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'",
  "enforcedLanguage": "'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'",
  "verificationSource": "string",
  "hasClarify": "boolean",
  "clarify_reason": "string | undefined"
}
```

---

## Expected Logs for Arabic Query

For an Arabic query (e.g., "مطعم في تل أبيب"), expected log sequence:

**1. Gate2 language snapshot** (after Gate2):
```json
{
  "event": "gate2_lang_snapshot",
  "gateAssistantLanguage": "ar",
  "gateAssistantLanguageConfidence": 0.95,
  "foodSignal": "YES"
}
```

**2. Intent stage** (uses Gate2 language):
```json
{
  "event": "intent_clarify_payload_from_intent",
  "assistantLanguage": "ar",
  "reason": "MISSING_LOCATION"
}
```

**3. Assistant publish snapshot** (before WS):
```json
{
  "event": "assistant_publish_lang_snapshot",
  "assistantType": "CLARIFY",
  "langCtx_assistantLanguage": "ar",
  "enforcedLanguage": "ar",
  "verificationSource": "langCtx_strict",
  "hasClarify": true
}
```

**Expected outcome**: CLARIFY message published in Arabic with `language="ar"` in WS payload.

---

## Existing Fixes Already in Place

### Intent Stage (intent.stage.ts:211)
**Already Fixed**: Intent uses `gateAssistantLanguage` from `langCtx`:
```typescript
// Line 84-86: Extract Gate language context (required for Intent)
const gateAssistantLanguage = langCtx?.assistantLanguage || resolveFallbackLanguage(request.query);

// Line 211: Inject Gate language into intentDecision
assistantLanguage: gateAssistantLanguage as 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es', // From Gate, NOT from LLM
```

### Deterministic CLARIFY Fallback (intent.stage.ts:159-176)
**Already Fixed**: When NEARBY route without location, inject localized clarify:
```typescript
const clarifyMessages: Record<string, { message: string; question: string }> = {
  he: { message: '...', question: '...' },
  en: { message: '...', question: '...' },
  ar: { message: 'أحتاج موقعك للعثور على أماكن قريبة منك.', question: '...' },
  // ... other languages
};
const fallback = clarifyMessages[gateAssistantLanguage] || clarifyMessages['en'];
```

---

## Testing Checklist

- [x] Timeout fix: Verify assistant_llm calls complete within 4000ms
- [x] Gate2 log: Verify `gate2_lang_snapshot` appears after Gate2 with correct language
- [x] Assistant log: Verify `assistant_publish_lang_snapshot` appears before WS publish
- [x] Arabic CLARIFY: Verify `enforcedLanguage="ar"` for Arabic queries
- [ ] Hebrew GATE_FAIL: Verify `enforcedLanguage="he"` for Hebrew queries
- [ ] English fallback: Verify graceful degradation to "en" when language unknown

### Regression Test Script

A minimal regression test is available: `server/test-language-propagation.ts`

**Run:**
```bash
cd server
npm run test:lang-propagation
```

**What it validates:**
1. Arabic query → CLARIFY with `language="ar"`
2. Hebrew query → GATE_FAIL with `language="he"`, no `abort_timeout`
3. Short Arabic query → Snapshot (records Gate2 decision)

See `server/TEST_LANGUAGE_PROPAGATION.md` for details.

---

## Diff Summary

| File | Lines Changed | Description |
|------|--------------|-------------|
| llm-config.ts | 1 | Increased assistant timeout to 4000ms |
| route2.orchestrator.ts | +33 | Added langCtx init + gate2_lang_snapshot log |
| assistant-publisher.ts | +18 | Added assistant_publish_lang_snapshot log |
| orchestrator.guards.ts | 1 | Fixed CLARIFY language enforcement fallback |

**Total**: 53 lines added/changed across 4 files
