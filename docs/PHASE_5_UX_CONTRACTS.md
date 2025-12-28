# Phase 5: UX Contracts

**Status:** Implemented  
**Compliance:** Phase 0 compliant  
**Date:** December 27, 2025

---

## Overview

Phase 5 formalizes the mode-based UX system for the unified search experience. This document defines the contracts between backend and frontend for NORMAL, RECOVERY, and CLARIFY modes.

**Core Principle:** UI behavior is driven entirely from `SearchResponse`. No hidden logic, no client-side mode inference.

---

## Mode Behavior

### NORMAL Mode

**When:** Results available, no major issues, good quality matches

**Backend Behavior:**
- `failureReason = 'NONE'`
- `mode = 'NORMAL'`
- Full chip set generated (sort, filter, map options)
- Assistant message: brief summary + next action suggestion
- Example: "Found 8 great pizza places. Want to see top-rated or closest?"

**Frontend Rendering:**
1. Show all results (EXACT then NEARBY groups if applicable)
2. Display assistant strip with message
3. Render full chip set
4. Highlight primary chip (if present)
5. No mode indicator shown

**Chips:**
- delivery, budget, topRated, openNow, map, closest
- Full set of contextual refinements

---

### RECOVERY Mode

**When:** NO_RESULTS, weak matches, or API errors

**Backend Behavior:**
- `failureReason = 'NO_RESULTS' | 'WEAK_MATCHES' | 'GOOGLE_API_ERROR' | 'TIMEOUT' | 'QUOTA_EXCEEDED' | 'LIVE_DATA_UNAVAILABLE'`
- `mode = 'RECOVERY'`
- Recovery-focused chip set
- Assistant message: explain + suggest concrete next steps
- Example: "No exact matches here, but try expanding the search radius?"

**Frontend Rendering:**
1. Show recovery mode indicator (🔄 "Recovery mode - refining search")
2. Display assistant strip with recovery message
3. Render recovery chips
4. Highlight primary recovery action
5. If results exist (weak matches), show them below

**Recovery Chips:**
- expand_radius: "Expand search" 🔍
- remove_filters: "Remove filters" 🔄 (if filters applied)
- try_nearby: "Try nearby" 📍
- sort_rating: "Top rated" ⭐
- map: "Map" 🗺️

**Max:** 5 recovery chips

---

### CLARIFY Mode

**When:** Ambiguous location, low confidence, missing info

**Backend Behavior:**
- `failureReason = 'GEOCODING_FAILED' | 'LOW_CONFIDENCE'`
- `mode = 'CLARIFY'`
- Minimal chip set (1-3 chips)
- Assistant message: ask ONE specific question
- Example: "Which Tel Aviv did you mean?" or "What kind of food are you looking for?"

**Frontend Rendering:**
1. Show clarify mode indicator (❓ "Need more info")
2. Display assistant strip with clarification question
3. Render 1-3 clarification chips
4. Highlight primary clarification option
5. Results may or may not be shown (depending on scenario)

**Clarification Chips:**
- City suggestions: "pizza in Tel Aviv" 📍, "pizza in Jerusalem" 📍, "pizza in Haifa" 📍
- Category suggestions: "Restaurant" 🍽️, "Cafe" ☕, "Any food place" 🍴
- Constraint clarification: depends on ambiguous token

**Max:** 3 clarification chips

---

## Chip Semantics

All chips are deterministic and i18n-translated. Assistant can only select from allowlist (cannot invent new chips).

| Action Type | Purpose | Examples | Used In |
|-------------|---------|----------|---------|
| `filter` | Apply or modify search constraints | expand radius, add city, remove filters, dietary, price | NORMAL, RECOVERY, CLARIFY |
| `sort` | Change result ordering | by rating, by distance, by price | NORMAL, RECOVERY |
| `map` | Location-based actions | show on map, get directions | NORMAL, RECOVERY, CLARIFY |

### Chip Structure

```typescript
interface RefinementChip {
  id: string;              // Stable ID (e.g., 'expand_radius', 'city_tel_aviv')
  emoji: string;           // Visual icon
  label: string;           // i18n-translated label
  action: 'filter' | 'sort' | 'map';
  filter?: string;         // Filter to apply (e.g., 'radius:10000', 'clear_filters')
}
```

---

## Assistant Message Rules

1. **Length:** 1-2 sentences max
2. **Language:** Must match `intent.language` (validated)
3. **Facts:** Only reference deterministic truth (no hallucinations)
4. **Actions:** Only suggest chips from allowlist
5. **Mode-specific:** Follow mode guidelines in prompt

### Message Examples

**NORMAL:**
- "Found 12 great pizza places. Want to see top-rated or closest?"
- "8 Italian restaurants nearby. Filter by price or delivery?"

**RECOVERY:**
- "No exact matches here, but try expanding the search radius?"
- "Found 3 places but they're closing soon. Want to see them anyway?"

**CLARIFY:**
- "Which Tel Aviv did you mean?"
- "Looking for restaurants with parking or a place called 'parking'?"

---

## Frontend Rendering Order

**Standard Flow:**

1. Mode indicator (if RECOVERY or CLARIFY)
2. Assistant message
3. Chips row (primary highlighted)
4. Results list
   - EXACT group (if applicable)
   - NEARBY group (if applicable)

**Early Exit Flows:**

- **Clarification needed:** Show clarification block instead of results
- **Error state:** Show error message with retry button
- **Loading:** Show loading spinner

---

## Failure Reason to Mode Mapping

| FailureReason | Mode | Expected Behavior |
|---------------|------|-------------------|
| NONE | NORMAL | Standard UX, full chip set |
| NONE + weak matches | RECOVERY | Suggest refinement, recovery chips |
| NO_RESULTS | RECOVERY | Expand/relax suggestions |
| GEOCODING_FAILED | CLARIFY | Ask for clearer location |
| LOW_CONFIDENCE | CLARIFY | Ask for clarification |
| GOOGLE_API_ERROR | RECOVERY | Retry suggestions |
| TIMEOUT | RECOVERY | Retry suggestions |
| QUOTA_EXCEEDED | RECOVERY | Wait and retry |
| LIVE_DATA_UNAVAILABLE | RECOVERY | Alternative options |
| WEAK_MATCHES | RECOVERY | Suggest refinement |

---

## Mode Computation Logic

```typescript
function computeResponseMode(
  failureReason: FailureReason,
  hasWeakMatches: boolean = false
): ResponseMode {
  // Clarification needed (user input ambiguous)
  if (failureReason === 'GEOCODING_FAILED' || failureReason === 'LOW_CONFIDENCE') {
    return 'CLARIFY';
  }
  
  // Recovery needed (system failure or no results)
  if (
    failureReason === 'NO_RESULTS' ||
    failureReason === 'GOOGLE_API_ERROR' ||
    failureReason === 'TIMEOUT' ||
    failureReason === 'QUOTA_EXCEEDED' ||
    failureReason === 'LIVE_DATA_UNAVAILABLE' ||
    failureReason === 'WEAK_MATCHES'
  ) {
    return 'RECOVERY';
  }
  
  // Phase 5: If weak matches detected, suggest recovery even if failureReason is NONE
  if (failureReason === 'NONE' && hasWeakMatches) {
    return 'RECOVERY';
  }
  
  // Normal operation
  return 'NORMAL';
}
```

---

## Translation Keys (i18n)

### Chip Labels

```json
{
  "chip": {
    "delivery": "Delivery",
    "budget": "Budget",
    "topRated": "Top rated",
    "openNow": "Open now",
    "map": "Map",
    "closest": "Closest",
    "expandSearch": "Expand search",
    "removeFilters": "Remove filters",
    "tryNearby": "Try nearby"
  }
}
```

### Clarification

```json
{
  "clarification": {
    "whichCity": "Which \"{{city}}\" did you mean?",
    "whatLookingFor": "What are you looking for with {{constraint}}?",
    "inCity": "in {{city}}"
  }
}
```

### Mode Indicators

```json
{
  "mode": {
    "recovery": "Recovery mode",
    "clarify": "Clarification needed",
    "refining": "Refining search"
  }
}
```

**Supported Languages:** English (en), Hebrew (he), Arabic (ar), Russian (ru)

---

## Phase 0 Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Two-Pass LLM Only | ✅ MAINTAINED | Only enhanced existing Pass B prompt with mode guidelines |
| Deterministic Truth | ✅ MAINTAINED | Mode computed deterministically, chips generated algorithmically |
| Assistant is Helper | ✅ MAINTAINED | Assistant only narrates and selects from allowlist |
| Single Source of Truth | ✅ MAINTAINED | All mode logic in TruthState, UI driven by SearchResponse |
| Language Invariants | ✅ MAINTAINED | All new strings i18n, language validation in assistant |
| Live Data Policy | ✅ MAINTAINED | No changes to live data handling |

**Compliance: 100%**

---

## Success Criteria

Phase 5 complete when:

1. ✅ Mode logic formalized and tested
2. ✅ Recovery chips implemented and translated
3. ✅ Clarification chips implemented and translated
4. ✅ Assistant prompts are mode-aware
5. ✅ Frontend shows mode indicators
6. ✅ Primary chip is highlighted
7. ✅ All 4 languages supported
8. ✅ No linter errors
9. ✅ Phase 0 compliance maintained
10. ✅ Documentation complete

---

## Implementation Summary

### Backend Changes

1. **truth-state.types.ts**
   - Enhanced `computeResponseMode()` to accept `hasWeakMatches` parameter
   - Added JSDoc comments documenting mode semantics

2. **suggestion.service.ts**
   - Added `mode` parameter to `generate()` method
   - Implemented `generateRecoveryChips()` for RECOVERY mode
   - Implemented `generateClarifyChips()` for CLARIFY mode
   - Renamed original logic to `generateNormalChips()`

3. **assistant-narration.service.ts**
   - Added `getModeGuidelines()` method
   - Enhanced LLM prompt with mode-specific guidelines
   - Mode-aware message generation

4. **search.orchestrator.ts**
   - Compute mode before chip generation
   - Pass mode to `suggestionService.generate()`
   - Pass weak match flag to `computeResponseMode()`

5. **i18n translations**
   - Added `chip.removeFilters`, `chip.tryNearby`
   - Added `clarification.inCity`
   - Added `mode.recovery`, `mode.clarify`, `mode.refining`
   - All 4 languages (en, he, ar, ru)

6. **search.types.ts**
   - Enhanced `RefinementChip` with JSDoc comments
   - Enhanced `AssistPayload` to include CLARIFY mode

### Frontend Changes

1. **search-page.component.ts**
   - Added `computed()` properties for mode detection
   - `currentMode`, `isRecoveryMode`, `isClarifyMode`

2. **search-page.component.html**
   - Added mode indicators after assistant strip
   - Conditional rendering based on mode

3. **search-page.component.scss**
   - Added `.mode-indicator` styles
   - Subtle, non-intrusive design
   - Recovery: amber/orange theme
   - Clarify: blue theme

4. **assistant-strip.component.scss**
   - Enhanced `.chip.primary` styling
   - Purple gradient (#667eea → #764ba2)
   - Prominent but not overwhelming
   - Scale transform for emphasis

---

## Testing Checklist

### Backend Tests

**NORMAL Mode:**
- ✅ Query: "pizza in tel aviv" (en)
- ✅ Verify: mode = NORMAL, full chip set, brief assistant message
- ✅ Verify: primaryActionId is set and valid

**RECOVERY Mode (NO_RESULTS):**
- ✅ Query: "vegan gluten-free kosher pizza in small village" (force no results)
- ✅ Verify: mode = RECOVERY, recovery chips present
- ✅ Verify: Assistant suggests expansion/relaxation

**RECOVERY Mode (Weak Matches):**
- ✅ Query with low-scoring results
- ✅ Verify: Results shown, mode = RECOVERY, refinement suggested

**CLARIFY Mode (Ambiguous City):**
- ✅ Query: "pizza in Springfield" (multiple cities)
- ✅ Verify: mode = CLARIFY, 1-3 city chips, clarification question

**CLARIFY Mode (Low Confidence):**
- ✅ Query: single ambiguous token
- ✅ Verify: mode = CLARIFY, assistant asks for more info

### Frontend Tests

- ✅ Mode indicators appear correctly
- ✅ Primary chip is highlighted
- ✅ Chips are clickable and functional
- ✅ No console errors

### Multilingual Tests

- ✅ Test RECOVERY mode in Hebrew: recovery chips translated
- ✅ Test CLARIFY mode in Arabic: clarification translated
- ✅ Test NORMAL mode in Russian: all chips translated

---

## Deferred to Phase 6

- Debug diagnostics UI drawer
- QA automation harness
- Regression test suite
- Performance profiling UI

---

## References

- [Phase 0: System Definition](./PHASE_0_SYSTEM_DEFINITION.md)
- [Phase 1: Contracts + Diagnostics](./definition-of-done.md)
- [Phase 2: TruthState Validation](./PHASE_2_VALIDATION.md)
- [Phase 3: Ranking & RSE v1](./PHASE_3_VALIDATION.md)
- [Phase 4: Multilingual Correctness](./PHASE_4_VALIDATION_REPORT.md)
- [Backend Architecture](./BACKEND_ARCHITECTURE.md)

---

**End of Phase 5 UX Contracts**





