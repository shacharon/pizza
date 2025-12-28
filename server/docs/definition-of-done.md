# Definition of Done — Unified Search API

> **Version:** 1.0  
> **Last Updated:** December 27, 2024  
> **Applies To:** `POST /api/search` (Unified Search BFF)

---

## Purpose

This document defines the acceptance criteria for every search request. These rules ensure:
- **Correctness**: No hallucinated facts (especially live data like "open now")
- **Contract stability**: Every response follows the same structure
- **Language support**: Multilingual by default
- **Graceful degradation**: LLM failures don't break the system

---

## Acceptance Criteria

### 1. Correctness

#### Live Data Verification
- **Rule:** If user asks about open/closed/hours OR `ParsedIntent.requiresLiveData === true`:
  - The system **MUST NOT** claim "open now" unless `RestaurantResult.openNow === true`.
  - If `openNow === 'UNKNOWN'` for top results → set `failureReason = 'LIVE_DATA_UNAVAILABLE'`.
  - If `openNow === false` → system may say "closed" (verified data).

#### Intent Confidence
- **Rule:** If `confidence < 0.4`:
  - Set `failureReason = 'LOW_CONFIDENCE'`.
  - Assist message should acknowledge uncertainty: "I'm not sure I understood correctly..."

#### Geocoding
- **Rule:** If `intent.location?.cityValidation === 'FAILED'`:
  - Set `failureReason = 'GEOCODING_FAILED'`.
  - Assist message should offer clarification or nearby alternatives.

---

### 2. Contract Stability

#### Every Response Must Include:
```typescript
{
  sessionId: string;           // ✅ Always present
  query: SearchResponseQuery;  // ✅ Always present
  results: RestaurantResult[]; // ✅ Always present (empty array if 0)
  chips: RefinementChip[];     // ✅ Always present (empty array if 0)
  assist: AssistPayload;       // ✅ REQUIRED (never undefined)
  meta: SearchResponseMeta;    // ✅ Always present
  
  // Optional fields:
  groups?: ResultGroup[];      // Only if street grouping enabled
  clarification?: Clarification;
  diagnostics?: Diagnostics;   // Only in dev mode or debug=true
}
```

#### Assist Must Always Exist
- **Rule:** Every response path MUST generate an `assist` payload.
  - If LLM Pass B succeeds → use LLM-generated message.
  - If LLM Pass B fails → use i18n fallback template.
  - No response may have `assist: undefined`.

#### FailureReason Must Be Set
- **Rule:** `meta.failureReason` must be computed deterministically by `FailureDetectorService`.
  - `'NONE'` = everything worked perfectly.
  - Other values = explain what went wrong (e.g., `'NO_RESULTS'`, `'GOOGLE_API_ERROR'`).

---

### 3. Language Support

#### Assist Message Language
- **Rule:** `assist.message` MUST be in `intent.language`.
  - LLM Pass B generates messages in the detected language.
  - Fallback templates use `i18n.t(key, intent.language)`.

#### Chip Labels
- **Rule:** All chip labels MUST come from i18n.
  - No hardcoded Hebrew/English strings in deterministic code.
  - Supported languages: `he`, `en`, `ar`, `ru` (extensible).

---

### 4. LLM Usage

#### Only Two LLM Calls Allowed
- **Pass A:** `places/intent/places-intent.service.ts` (intent parsing)
- **Pass B:** `search/assistant/assistant-narration.service.ts` (assistant message)

#### Deterministic Truth
The following MUST be 100% code-based (no LLM):
- Ranking (`RankingService`)
- City filtering (`CityFilterService`)
- Failure detection (`FailureDetectorService`)
- Chip generation (`SuggestionGenerator`)
- Opening status (`RestaurantResult.openNow` from Google API only)

---

### 5. Diagnostics (Dev/Debug Only)

#### When to Include
- **Dev mode:** Always include `diagnostics` if `NODE_ENV !== 'production'`.
- **Debug flag:** Include if request has `debug=true` flag.
- **Production:** Never include unless explicitly requested.

#### What to Include
```typescript
{
  timings: {
    intentMs: number;     // Time for LLM Pass A
    geocodeMs: number;    // Time for location resolution
    providerMs: number;   // Time for Google Places API
    rankingMs: number;    // Time for ranking/filtering
    assistantMs: number;  // Time for LLM Pass B
    totalMs: number;      // End-to-end time
  },
  counts: {
    results: number;      // Total results returned
    chips: number;        // Total chips generated
    exact?: number;       // On-street matches (if street query)
    nearby?: number;      // Nearby matches (if street query)
  },
  top: {
    placeIds: string[];   // IDs of top 3 results (for debugging)
  },
  flags: {
    usedLLMIntent: boolean;      // Did Pass A succeed?
    usedLLMAssistant: boolean;   // Did Pass B succeed?
    usedTranslation: boolean;    // Did we translate the query?
    liveDataRequested: boolean;  // Did user ask for hours/open status?
  }
}
```

---

## Enforcement

### Pre-Release Checklist
Before deploying any changes to `/api/search`:
- [ ] All responses include `assist` (check early exit paths).
- [ ] `failureReason` is computed for every response.
- [ ] No hardcoded language strings outside i18n.
- [ ] No new LLM calls added (only Pass A + Pass B).
- [ ] Diagnostics only in dev/debug mode.

### Testing Requirements
- **Unit tests:** `FailureDetectorService`, `AssistantNarrationService` fallback.
- **Integration tests:** All response paths return valid `SearchResponse`.
- **E2E tests:** Live data rules, language switching.

---

## Deprecated Patterns

### ❌ Do NOT use:
- `ResponsePlan` (legacy, being phased out)
- Inline `language === 'he' ? ... : ...` checks (use i18n)
- Optional `assist` (must always exist)

---

**Last Reviewed:** December 27, 2024  
**Next Review:** After Milestone B (Ranking + RSE redesign)





