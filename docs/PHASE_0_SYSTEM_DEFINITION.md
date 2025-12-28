# Phase 0: System Definition & Guardrails (FOUNDATION)

> **Status:** AUTHORITATIVE SYSTEM DEFINITION  
> **Created:** December 27, 2024  
> **Applies To:** All future work + retroactive validation of Phase 1

---

## Purpose of Phase 0

Phase 0 defines **what the system is and is not**.
It exists to prevent architectural drift, LLM misuse, and hidden assumptions.

**Phase 0 introduces NO new code.**
It freezes intent, contracts, and boundaries.

---

## Core Vision (Immutable)

The system is a **language-first food search assistant** built on:

- LLM for understanding and narration
- Deterministic code for truth and decisions
- Multilingual UX from day one
- Explainability over cleverness
- Precision over coverage

---

## Non-Negotiable Principles

### 1. Two-Pass LLM Architecture (ONLY)

The system is allowed exactly **two LLM calls** in the main path:

#### LLM Pass A – Intent Parsing
- **File:** `server/src/services/places/intent/places-intent.service.ts`
- **Input:** Natural language query (string)
- **Output:** Structured `PlacesIntent` → converted to `ParsedIntent`
- **Purpose:** Extract category, location, filters from user query
- **Temperature:** 0.2 (deterministic)
- **Timeout:** 8000ms

#### LLM Pass B – Assistant Narration
- **File:** `server/src/services/search/assistant/assistant-narration.service.ts`
- **Input:** System state (intent, results, chips, failureReason, liveData)
- **Output:** `AssistPayload` (message + selected chip IDs)
- **Purpose:** Generate contextual message and select actions from allowlist
- **Temperature:** 0.3 (slightly creative)
- **Timeout:** 5000ms
- **Fallback:** Deterministic i18n templates if LLM fails

❌ **No other LLM calls may influence results, ranking, filtering, or truth.**

---

### 2. Deterministic Truth

The following are **code-only** and must NEVER be inferred by an LLM:

| Component | File | Purpose |
|-----------|------|---------|
| **Open / closed / hours** | `RestaurantResult.openNow` | From Google API only |
| **Ranking & scoring** | `RankingService` | Deterministic algorithm |
| **Filtering** | `CityFilterService` | Coordinate-based filtering |
| **Grouping** | `SearchOrchestrator` | Street detection + dual search |
| **Failure reasons** | `FailureDetectorService` | Code-based rules |
| **Chip generation** | `SuggestionGenerator` | Deterministic + i18n |
| **City validation** | `GeoResolverService` | Geocoding API |
| **Distance calculation** | `CityFilterService` | Haversine formula |

**Immutable Rule:** LLM output must never contradict deterministic state.

---

### 3. Assistant Is a Helper, Not a Decider

The AI assistant operates under strict constraints:

#### ✅ The Assistant MAY:
- Explain results in natural language
- Guide the user to next best action
- Select chips **from a pre-generated allowlist**
- Handle recovery messaging (0 results, low confidence, errors)
- Reference the user's original query
- Adapt message tone to situation (guide vs recovery)

#### ❌ The Assistant MUST NOT:
- Invent results that don't exist
- Create new chips not in the allowlist
- Override or change `failureReason`
- Claim "open now" without `openNow === true`
- Change result ordering or scoring
- Add filters not in the original intent
- Hallucinate facts (hours, prices, menu items)

---

### 4. Single Source of Truth Contracts

From this point on, these are the **only** canonical types:

#### Input Contract
```typescript
// server/src/services/search/types/search-request.dto.ts
interface SearchRequest {
  query: string;              // Required
  sessionId?: string;         // Optional
  userLocation?: Coordinates; // Optional (GPS)
  filters?: SearchFilters;    // Optional (explicit)
  clearContext?: boolean;     // Optional (reset)
  debug?: boolean;            // Optional (diagnostics)
}
```

#### Semantic Contract
```typescript
// server/src/services/search/types/search.types.ts
interface ParsedIntent {
  query: string;
  location?: { city, coords, radius, cityValidation };
  searchMode: 'textsearch' | 'nearbysearch' | 'findplace';
  filters: { openNow, priceLevel, dietary, mustHave };
  language: string;           // ISO code
  
  // Semantic header (Phase 1)
  intent?: 'search_food' | 'refine' | 'check_opening_status';
  confidenceLevel?: 'high' | 'medium' | 'low';
  requiresLiveData?: boolean;
  originalQuery?: string;
  canonical?: { category, locationText };
}
```

#### Output Contract
```typescript
// server/src/services/search/types/search-response.dto.ts
interface SearchResponse {
  sessionId: string;
  query: SearchResponseQuery;
  results: RestaurantResult[];  // Flat list
  groups?: ResultGroup[];       // Optional (street queries)
  chips: RefinementChip[];
  assist: AssistPayload;        // REQUIRED (never undefined)
  proposedActions?: ProposedActions;
  clarification?: Clarification;
  diagnostics?: Diagnostics;    // Dev/debug only
  meta: SearchResponseMeta;
}
```

**All UI behavior must be driven from `SearchResponse`.**

Legacy response types (e.g., `ResponsePlan`) may exist but must not be extended or reused.

---

### 5. Language Invariants

#### Rule 1: Language is sticky
```
User query language → ParsedIntent.language → Response language
```

#### Rule 2: Output language = Input language
- `assist.message` language === `ParsedIntent.language`
- Chip labels from i18n: `i18n.t('chip.delivery', language)`
- Fallback messages from i18n: `i18n.t('fallback.noResults', language)`

#### Rule 3: Language must never "flip" mid-response
Bad example:
```
User: "פיצה בתל אביב" (Hebrew)
Assistant: "I found 10 pizza places" (English) ❌
```

Good example:
```
User: "פיצה בתל אביב" (Hebrew)
Assistant: "מצאתי 10 פיצריות בתל אביב" (Hebrew) ✅
```

#### Supported Languages
- `he` (Hebrew) - RTL
- `en` (English) - LTR
- `ar` (Arabic) - RTL
- `ru` (Russian) - LTR

#### Language Normalization
```typescript
// server/src/services/i18n/i18n.service.ts
normalizeLang(lang: string): Lang {
  if (['he', 'iw'].includes(lang)) return 'he';
  if (['ar'].includes(lang)) return 'ar';
  if (['ru'].includes(lang)) return 'ru';
  return 'en'; // Default
}
```

---

### 6. Live Data Policy (Open / Hours)

#### When Live Data is Requested
If the user query contains phrases like:
- "open now"
- "open tonight"
- "what time does it close"
- "still open"

Then:
- `ParsedIntent.requiresLiveData === true`
- `ParsedIntent.filters.openNow === true` (if explicitly about open status)

#### Truth Source
```typescript
interface RestaurantResult {
  openNow?: VerifiableBoolean; // true | false | 'UNKNOWN'
}

type VerifiableBoolean = boolean | 'UNKNOWN';
```

#### System Behavior
```
IF requiresLiveData === true:
  IF openNow === 'UNKNOWN' for top results:
    SET failureReason = 'LIVE_DATA_UNAVAILABLE'
    ASSISTANT must say: "I can't verify opening hours right now"
  
  IF openNow === true:
    ASSISTANT may say: "Open now"
  
  IF openNow === false:
    ASSISTANT may say: "Closed"
  
  IF openNow === 'UNKNOWN':
    ASSISTANT must NOT claim open/closed status
```

#### The Assistant Must Never Guess
❌ Bad:
```
User: "pizza open now in tel aviv"
Results: [{ openNow: 'UNKNOWN' }]
Assistant: "Here are 5 pizza places that are open now" ❌
```

✅ Good:
```
User: "pizza open now in tel aviv"
Results: [{ openNow: 'UNKNOWN' }]
failureReason: 'LIVE_DATA_UNAVAILABLE'
Assistant: "I found 5 pizza places, but I can't verify which are open right now. Would you like me to show the closest options?" ✅
```

---

## Definition of Done (High Level)

The system is considered "working" when:

- ✅ Every request returns a valid `SearchResponse`
- ✅ `assist` is always present (LLM or fallback)
- ✅ `meta.failureReason` is always computed
- ✅ "Open now" is never hallucinated
- ✅ Recovery & clarification paths exist
- ✅ Diagnostics exist in dev/debug mode
- ✅ Multilingual behavior is consistent
- ✅ No additional LLM calls in pipeline
- ✅ Language invariants are respected
- ✅ All chips use i18n

---

## Architectural Boundaries

### What is IN SCOPE for this system
- Food & restaurant search
- Natural language intent parsing
- City-based filtering
- Distance-based ranking
- AI-assisted guidance
- Multilingual UX
- Session context
- Refinement chips

### What is OUT OF SCOPE
- General web search
- Non-food queries
- Booking / reservations
- Menu scraping
- Price comparison
- Reviews aggregation
- Social features
- Machine learning ranking (beyond simple scoring)

---

## File Ownership Map

### LLM-Powered (2 files only)
- `server/src/services/places/intent/places-intent.service.ts` (Pass A)
- `server/src/services/search/assistant/assistant-narration.service.ts` (Pass B)

### Deterministic (Code-Only)
- `server/src/services/search/assistant/failure-detector.service.ts`
- `server/src/services/places/suggestions/suggestion-generator.ts`
- `server/src/services/search/capabilities/ranking.service.ts`
- `server/src/services/search/filters/city-filter.service.ts`
- `server/src/services/search/rse/result-state-engine.ts` (deprecated)

### Orchestration
- `server/src/services/search/orchestrator/search.orchestrator.ts` (BFF)

### Contracts
- `server/src/services/search/types/search-request.dto.ts`
- `server/src/services/search/types/search-response.dto.ts`
- `server/src/services/search/types/search.types.ts`
- `server/src/services/search/types/diagnostics.types.ts`

### i18n
- `server/src/services/i18n/i18n.service.ts`
- `server/src/services/i18n/translations/{en,he,ar,ru}.json`

---

## Gap Acknowledgement

Current code may partially violate this spec due to pre-Phase-0 work.

This is expected and acceptable.

**Any new work MUST comply with Phase 0.**
**Existing violations will be addressed in Phase 2.**

---

## Cursor Instructions (IMPORTANT)

### A. This document is now the spec
- Treat this Phase 0 document as the **constitution**
- Do not introduce optimizations or refactors that violate it
- When in doubt, refer to this document

### B. Re-evaluate previous Phase 1 work
- Review the changes already made for **Step 1**
- Identify and fix anything that:
  - Adds extra LLM usage
  - Leaks LLM into deterministic logic
  - Breaks language invariants
  - Returns incomplete or ambiguous responses
  - Bypasses SearchResponse as the single output contract

Fixes are allowed **only** if they bring the code into alignment with this spec.

### C. Future Changes
All PRs, refactors, and features must:
1. Reference Phase 0 compliance
2. Not introduce new LLM calls
3. Not break language invariants
4. Not bypass `SearchResponse` contract

---

## Explicitly Out of Scope (Phase 0)

The following are deferred to later phases:

- Ranking algorithm changes → Phase 3
- RSE redesign → Phase 3
- UX polish → Phase 5
- Multilingual expansion beyond invariants → Phase 4
- Legacy code deletion → Phase 2
- Performance optimization → Phase 6

---

## Phase Flow (Locked)

```
Phase 0 → Definition (this document)       ✅ COMPLETE
Phase 1 → Contracts + Diagnostics          ✅ IN PROGRESS
Phase 2 → Deterministic pipeline hardening 🔜 NEXT
Phase 3 → Ranking / RSE redesign           ⏸️ BLOCKED
Phase 4 → Multilingual correctness         ⏸️ BLOCKED
Phase 5 → UX completion                    ⏸️ BLOCKED
Phase 6 → QA & regression harness          ⏸️ BLOCKED
```

---

## Compliance Checklist

Use this checklist before merging any change:

- [ ] Uses only 2 LLM calls (Pass A + Pass B)?
- [ ] No LLM in ranking, filtering, or failure detection?
- [ ] Returns complete `SearchResponse` with `assist`?
- [ ] Language = `ParsedIntent.language` throughout?
- [ ] No "open now" claims without verification?
- [ ] Chips generated from i18n?
- [ ] `failureReason` computed deterministically?
- [ ] Diagnostics only in dev/debug mode?
- [ ] No new response types introduced?
- [ ] Changes documented in this file or DoD?

---

**Last Updated:** December 27, 2024  
**Next Review:** After Phase 2 completion





