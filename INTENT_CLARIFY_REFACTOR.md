# INTENT Clarify Refactor - Summary

## Goal
Remove message/question from INTENT LLM output and generate them deterministically at publish time, localized by assistantLanguage (Gate-propagated).

## Changes Summary

### 1. Shrunk INTENT JSON Schema (intent.prompt.ts)
- **Removed** `message` and `question` from `clarify` properties
- **Updated** `required` array to only: `["reason", "blocksSearch", "suggestedAction"]`
- **Schema hash** auto-updates via existing hash code
- **Schema remains strict**: `schemaStrict=true`

### 2. Updated Zod Schema (intent.types.ts)
- **Removed** `message` and `question` fields from `clarify` object schema
- **Added note**: "message/question generated deterministically at publish time"

### 3. Updated TypeScript Interface (types.ts)
- **Removed** `message` and `question` from `IntentResult.clarify` type
- **Added note**: "message/question generated deterministically at publish time"

### 4. Cleaned Intent Stage Injection (intent.stage.ts)
- **Removed** `clarifyMessages` constant and localized text generation
- **Simplified** deterministic clarify injection to only: `{ reason, blocksSearch, suggestedAction }`
- **Added note**: "message/question will be generated deterministically at publish time"

### 5. Created Deterministic Text Generator (clarify-text-generator.ts)
- **New file**: `assistant/clarify-text-generator.ts`
- **Function**: `buildClarifyText(reason, language)` → `{ message, question }`
- **Reuses** exact existing translations (no new phrasing)
- **Supports** all 3 reasons: `MISSING_LOCATION`, `MISSING_FOOD`, `AMBIGUOUS`
- **Supports** all 6 languages: `he`, `en`, `ar`, `ru`, `fr`, `es`

### 6. Updated CLARIFY Publisher (orchestrator.guards.ts)
- **Import** `buildClarifyText` helper
- **Generate** message/question deterministically using `buildClarifyText(reason, enforcedLanguage)`
- **Log event** changed from `intent_clarify_payload_from_intent` to `intent_clarify_deterministic`
- **No LLM dependency**: Text generated purely from reason + language

---

## File Diffs

### `intent.prompt.ts`
```typescript
// BEFORE:
clarify: {
  properties: {
    reason: { ... },
    message: { type: "string", minLength: 1, maxLength: 300 },  // ❌ REMOVED
    question: { type: "string", minLength: 1, maxLength: 150 }, // ❌ REMOVED
    blocksSearch: { ... },
    suggestedAction: { ... }
  },
  required: ["reason", "message", "question", "blocksSearch", "suggestedAction"]
}

// AFTER:
clarify: {
  properties: {
    reason: { ... },
    blocksSearch: { ... },
    suggestedAction: { ... }
  },
  required: ["reason", "blocksSearch", "suggestedAction"] // ✅ SHRUNK
}
```

### `intent.types.ts`
```typescript
// BEFORE:
clarify: z.object({
  reason: z.enum([...]),
  message: z.string().min(1).max(300),  // ❌ REMOVED
  question: z.string().min(1).max(150), // ❌ REMOVED
  blocksSearch: z.literal(true),
  suggestedAction: z.enum([...])
}).nullable()

// AFTER:
clarify: z.object({
  reason: z.enum([...]),
  blocksSearch: z.literal(true),
  suggestedAction: z.enum([...])
}).nullable() // ✅ SHRUNK
```

### `types.ts` (IntentResult)
```typescript
// BEFORE:
clarify: {
  reason: '...';
  message: string;  // ❌ REMOVED
  question: string; // ❌ REMOVED
  blocksSearch: true;
  suggestedAction: '...';
} | null;

// AFTER:
clarify: {
  reason: '...';
  blocksSearch: true;
  suggestedAction: '...';
} | null; // ✅ SHRUNK
```

### `intent.stage.ts`
```typescript
// BEFORE (lines 159-175):
const clarifyMessages: Record<string, { message: string; question: string }> = {
  he: { message: '...', question: '...' },
  en: { message: '...', question: '...' },
  ar: { message: '...', question: '...' },
  // ... etc
};
const fallback = clarifyMessages[gateAssistantLanguage] || clarifyMessages['en'];

llmResult.clarify = {
  reason: 'MISSING_LOCATION',
  message: fallback.message,  // ❌ REMOVED
  question: fallback.question, // ❌ REMOVED
  blocksSearch: true,
  suggestedAction: 'ASK_LOCATION'
};

// AFTER (lines 159-164):
// NOTE: message/question will be generated deterministically at publish time
llmResult.clarify = {
  reason: 'MISSING_LOCATION',
  blocksSearch: true,
  suggestedAction: 'ASK_LOCATION'
}; // ✅ SIMPLIFIED
```

### `clarify-text-generator.ts` (NEW FILE)
```typescript
export function buildClarifyText(
  reason: ClarifyReason,
  language: AssistantLanguage
): ClarifyText {
  // Returns { message, question } based on reason + language
  // MISSING_LOCATION: "I need your location..." + "What city...?"
  // MISSING_FOOD: "To search well I need..." + "What type of food...?"
  // AMBIGUOUS: "Your query is not clear..." + "Could you provide more details?"
}
```

### `orchestrator.guards.ts`
```typescript
// BEFORE:
publishAssistantMessage(wsManager, ctx.requestId, sessionId, {
  type: 'CLARIFY',
  message: intentDecision.clarify.message,  // ❌ FROM LLM
  question: intentDecision.clarify.question, // ❌ FROM LLM
  blocksSearch: intentDecision.clarify.blocksSearch,
  suggestedAction: intentDecision.clarify.suggestedAction,
  language: enforcedLanguage
}, ...);

// AFTER:
const { message, question } = buildClarifyText(
  intentDecision.clarify.reason,
  enforcedLanguage
); // ✅ DETERMINISTIC

publishAssistantMessage(wsManager, ctx.requestId, sessionId, {
  type: 'CLARIFY',
  message,  // ✅ GENERATED
  question, // ✅ GENERATED
  blocksSearch: intentDecision.clarify.blocksSearch,
  suggestedAction: intentDecision.clarify.suggestedAction,
  language: enforcedLanguage
}, ...);
```

---

## Behavior Validation

### Test Case 1: Arabic Query Without Location
**Query**: `"🇸🇦 مطعم قريب مني"` (no userLocation)

**Expected Flow**:
1. Gate2 detects `language="ar"`
2. Intent detects `route=NEARBY`, no location → injects `clarify: { reason: "MISSING_LOCATION", blocksSearch: true, suggestedAction: "ASK_LOCATION" }`
3. `handleIntentClarify` calls `buildClarifyText("MISSING_LOCATION", "ar")`
4. Returns Arabic text: 
   - `message`: "أحتاج موقعك للعثور على أماكن قريبة منك."
   - `question`: "في أي مدينة أنت (أو يمكنك مشاركة الموقع)?"
5. Publishes CLARIFY with `language="ar"`

**Log**: `event="intent_clarify_deterministic"` (not `intent_clarify_payload_from_intent`)

### Test Case 2: Normal TEXTSEARCH Query
**Query**: `"פיצה בתל אביב"`

**Expected Flow**:
1. Gate2 detects `language="he"`
2. Intent detects `route=TEXTSEARCH`, `cityText="תל אביב"` → `clarify=null`
3. No CLARIFY publish
4. Continues to Google search

---

## Files Changed

1. `server/src/services/search/route2/stages/intent/intent.prompt.ts` - Schema shrunk
2. `server/src/services/search/route2/stages/intent/intent.types.ts` - Zod schema updated
3. `server/src/services/search/route2/types.ts` - IntentResult type updated
4. `server/src/services/search/route2/stages/intent/intent.stage.ts` - Deterministic injection simplified
5. `server/src/services/search/route2/assistant/clarify-text-generator.ts` - **NEW** helper function
6. `server/src/services/search/route2/orchestrator.guards.ts` - Publisher uses deterministic text

**Total**: 5 files modified, 1 new file created

---

## No Breaking Changes

- **Schema remains strict**: `schemaStrict=true`
- **Behavior identical**: Same messages/questions, just generated at different stage
- **Language propagation unchanged**: Still uses `assistantLanguage` from Gate2
- **All translations preserved**: Exact same text as before

## Linter Status

✅ **No linter errors** - TypeScript build passes
