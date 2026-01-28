# Assistant Narrator Module

LLM-based assistant message generator for UX-facing communications in the Route2 search pipeline.

## Overview

The Assistant Narrator generates contextual, user-friendly messages at three key pipeline trigger points:

1. **GATE_FAIL** - When `foodSignal=NO` or `UNCERTAIN` (onboarding)
2. **CLARIFY** - When location/food missing or query ambiguous (blocks search)
3. **SUMMARY** - At pipeline end (success or zero results)

## Hard Rules

- ✅ Assistant does NOT decide routing or trigger Google/LLM stages
- ✅ Assistant only phrases messages
- ✅ CLARIFY always STOP (`blocksSearch=true`)
- ✅ Output MUST be JSON validated with Zod
- ✅ On error/timeout → deterministic fallback (no crash)
- ✅ Max 240 chars, max 2 sentences for `message`
- ✅ `question` only allowed when `type=CLARIFY`

## JSON Schema

```typescript
{
  type: "GATE_FAIL" | "CLARIFY" | "SUMMARY",
  message: string,          // Max 240 chars, max 2 sentences
  question: string | null,  // Only when type=CLARIFY
  suggestedAction: "NONE" | "ASK_LOCATION" | "ASK_FOOD" | "RELAX_OPENNOW" | "EXPAND_RADIUS" | "ADD_FILTER",
  blocksSearch: boolean     // Always true for CLARIFY
}
```

## Feature Flag

The narrator is gated by the `ASSISTANT_MODE` environment variable:

```bash
ASSISTANT_MODE=true  # Enable LLM-based narrator
ASSISTANT_MODE=false # Use deterministic fallbacks only (default)
```

**Default: DISABLED** (opt-in feature)

## Usage

### 1. Generate Assistant Message

```typescript
import { generateAssistantMessage } from './narrator/assistant-narrator.js';

const narratorContext: NarratorGateContext = {
  type: 'GATE_FAIL',
  reason: 'NO_FOOD',
  query: 'weather',
  language: 'he',
  locationKnown: false
};

const narrator = await generateAssistantMessage(
  narratorContext,
  llmProvider,
  requestId,
  { timeout: 3000 }
);

// narrator = {
//   type: 'GATE_FAIL',
//   message: 'זה לא נראה כמו חיפוש אוכל...',
//   question: null,
//   suggestedAction: 'ASK_FOOD',
//   blocksSearch: true
// }
```

### 2. Publish to WebSocket

```typescript
import { publishAssistantMessage } from './narrator/assistant-publisher.js';

publishAssistantMessage(wsManager, requestId, sessionId, narrator);
```

### 3. Fallback Handling

On LLM error/timeout, deterministic fallbacks are used automatically:

```typescript
import { getFallbackMessage } from './narrator/narrator.types.js';

const fallback = getFallbackMessage(narratorContext);
// Always returns valid, safe message in user's language
```

## Integration Points

### Route2 Orchestrator

The narrator is integrated at 3 points in `route2.orchestrator.ts`:

#### 1. GATE_FAIL (lines ~130-170)

```typescript
if (gateResult.gate.route === 'STOP') {
  // foodSignal = NO or UNCERTAIN
  const narrator = await generateAssistantMessage({
    type: 'GATE_FAIL',
    reason: 'NO_FOOD',
    query: request.query,
    language: gateResult.gate.language,
    locationKnown: !!ctx.userLocation
  }, ...);
  
  publishAssistantMessage(wsManager, requestId, sessionId, narrator);
}
```

#### 2. CLARIFY (lines ~178-223, ~350-398, ~464-507)

```typescript
if (gateResult.gate.route === 'ASK_CLARIFY') {
  const narrator = await generateAssistantMessage({
    type: 'CLARIFY',
    reason: 'AMBIGUOUS',
    query: request.query,
    language: gateResult.gate.language,
    locationKnown: !!ctx.userLocation
  }, ...);
  
  publishClarifyMessage(wsManager, requestId, sessionId, narrator);
}
```

#### 3. SUMMARY (lines ~665-703)

```typescript
// After post-filter, before response build
const narrator = await generateAssistantMessage({
  type: 'SUMMARY',
  query: request.query,
  language: detectedLanguage,
  resultCount: finalResults.length,
  top3Names: ['Pizza Hut', 'Dominos', ...],
  openNowCount: 5,
  avgRating: 4.2,
  appliedFilters: ['open_now']
}, ...);

publishSummaryMessage(wsManager, requestId, sessionId, narrator);
```

## Files

```
narrator/
├── assistant-narrator.ts    # Main LLM call + validation
├── assistant-publisher.ts   # WebSocket publishing
├── narrator.types.ts        # Zod schema + fallbacks
├── narrator.prompt.ts       # LLM prompt templates
├── narrator.test.ts         # Unit tests
├── index.ts                 # Module exports
└── README.md                # This file
```

## Testing

Run unit tests:

```bash
npm test narrator.test.ts
```

Tests cover:
- Schema validation
- Fallback messages (all languages)
- Output constraint enforcement
- Message truncation
- Zod strict mode

## Error Handling

### Graceful Degradation

1. **LLM timeout** (3s default) → fallback message
2. **LLM error** → fallback message
3. **Invalid JSON** → fallback message (Zod validation)
4. **Schema violation** → fallback message
5. **WebSocket publish fail** → logged, does not crash pipeline

### Constraint Enforcement

Post-LLM validation fixes common violations:

```typescript
import { validateNarratorOutput } from './assistant-narrator.js';

const validated = validateNarratorOutput(llmOutput);
// - Enforces CLARIFY → blocksSearch=true
// - Removes question for non-CLARIFY types
// - Adds question for CLARIFY if missing
// - Truncates messages > 240 chars
```

## Performance

- **Timeout**: 3s default (non-blocking)
- **Model**: `gpt-4o-mini` (fast, cheap)
- **Token usage**: ~200 input, ~80 output per call
- **Latency**: ~500-800ms typical

## Observability

All narrator calls are logged with:

```typescript
{
  requestId: string,
  stage: 'assistant_narrator',
  event: 'narrator_llm_start' | 'narrator_llm_success' | 'narrator_llm_failed',
  type: 'GATE_FAIL' | 'CLARIFY' | 'SUMMARY',
  durationMs: number,
  usage: { prompt_tokens, completion_tokens },
  model: string
}
```

## Future Enhancements

- [ ] Add A/B testing for LLM vs fallback messages
- [ ] Add tone/style customization (formal/casual)
- [ ] Add multi-turn conversation context
- [ ] Add user preference learning (personalization)
- [ ] Add streaming support for SUMMARY messages

## References

- Zod validation: https://zod.dev/
- WebSocket protocol: `server/src/infra/websocket/websocket-protocol.ts`
- Route2 orchestrator: `server/src/services/search/route2/route2.orchestrator.ts`
- Feature flags: `server/src/config/narrator.flags.ts`
