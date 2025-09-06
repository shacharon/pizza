# Backend New Features (Checkpoint)

Date: <!-- update as needed -->

## Summary

This document summarizes the new backend capabilities added during the latest iteration, focused on making NLU smarter, faster, and configurable without changing code.

## 1) NLU Two-Agent Enhancements (inside `nlu.service.ts`)

- Classifier Agent
  - Purpose: Quickly classify a user message as FOOD | NOT_FOOD | AMBIGUOUS.
  - Model: Uses `NLU_CLASSIFIER_MODEL` (falls back to FAST model).
  - Path: Internal to `extractSlots` (no API changes).
- Extractor Agent
  - Purpose: If classification is AMBIGUOUS and a type was extracted, normalize/clean the food type (e.g., "pizza itlina" → "pizza").
  - Model: Uses `NLU_EXTRACTOR_MODEL` (falls back to DEFAULT model).
  - Path: Internal to `extractSlots` (no API changes).
- Type Safety
  - All slot fields remain `null`-friendly.
  - `isFood` is set downstream (no `undefined` assignments).

## 2) Config-Driven Models (no code changes required)

- New env-driven settings in `server/src/config/index.ts`:
  - `NLU_CLASSIFIER_MODEL`: optional override for the Classifier agent.
  - `NLU_EXTRACTOR_MODEL`: optional override for the Extractor agent.
- Existing fallbacks:
  - `FAST_LLM_MODEL` (default: `gpt-3.5-turbo`).
  - `DEFAULT_LLM_MODEL` (default: `gpt-4o-mini`).
- Example `.env`:
  - `NLU_CLASSIFIER_MODEL=gpt-3.5-turbo`
  - `NLU_EXTRACTOR_MODEL=gpt-4o-mini`

## 3) NLU API & Controller

- No endpoint changes (`POST /api/nlu/parse`).
- Response structure unchanged.
- Internals are smarter but remain transparent to the caller.

## 4) Notes on Type & Robustness Fixes

- `exactOptionalPropertyTypes` respected by:
  - Avoiding `isFood: undefined` writes.
  - Sanitizing partial correction results to omit `undefined` fields.
- Narrowing of language union types happens before NLU calls where required.

## 5) What’s NOT Changed (for clarity)

- `conversation.service.ts` remains agent-based as before (no orchestration change at this checkpoint).
- No changes to `phraser.service.ts` output contract.

## 6) Test Hints

- "i want pizza" (no city) → classifier: FOOD; policy may ask for city.
- "pizza itlina" → extractor should normalize to "pizza".
- "a table" → classifier: NOT_FOOD → clarify-not-food path.

## 7) Next Steps (Proposed)

- Minimal correction handling for city/type/price via LLM prompts (still KISS, no regex).
- Optional simple-mode conversation path (deterministic NLU + Policy) toggleable via config.

---

This file marks a stable checkpoint for the backend feature set. Update the date above when you add more incremental changes.
