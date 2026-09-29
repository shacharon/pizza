# Handoff: Agent 1 — Developer — Story 01

**Agent:** 1 developer  
**Story:** [STORY_01_cap_model_strings.md](../../STORY_01_cap_model_strings.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

A successful model `textQuery` is cut to 80 characters on a word boundary before the city is appended. A successful model `cityText` is cut to 40 characters on both intent success returns. Landmark `geocodeQuery` still rejects past 120. Nearby `keyword` still rejects past 80. The text-search fallback and the intent error fallback are unchanged.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/route-llm/cap-model-string.ts` | created |
| `server/src/services/search/route2/stages/route-llm/cap-model-string.test.ts` | created |
| `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts` | cap `textQuery` on the success path, before the city append |
| `server/src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts` | long `textQuery` case; existing calls now pass `finalFilters` |
| `server/src/services/search/route2/stages/intent/intent.stage.ts` | cap `cityText` on both success returns |
| `nearby.mapper.ts`, `landmark.mapper.ts`, schemas | N/A |
| `llm-angular/`, `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- `capModelString` matches the architect function. Caps are 80 and 40.
- No Zod `.max` and no JSON Schema `maxLength` on `textQuery` or `cityText`.
- `intent.stage.ts` imports only `capModelString` and `MODEL_CITY_TEXT_MAX_CHARS` from `../route-llm/cap-model-string.ts`.
- The two older mapper tests omitted `finalFilters`, so they never reached the mapper. They now pass the same filter object the new test uses. Their bias check expects `undefined`, which is what `applyLocationBias` already returns.

---

## Route2 safety

- [x] Gate2, Intent route selection, and the Google client untouched
- [x] `ROUTE3_ENABLED` is not set in this server; nothing turned a graph on
- [x] Landmark 120 and nearby keyword 80 rejects untouched
- [x] `buildDeterministicMapping` and `createFallbackResult` untouched

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/stages/route-llm/cap-model-string.test.ts src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts src/services/search/route2/stages/route-llm/schemas.test.ts` from `server/`
- [x] Result: `cap-model-string` 6 pass, text-search mapper 3 pass, `rejects geocodeQuery too long` pass
- [ ] `schemas.test.ts` still fails `validates happy path with textSearchWithBias`. The schema enum is `nearbySearch` | `textSearch`. That file was not edited. Pre-existing.

---

## Open questions / next agent

None for this story. The `textSearchWithBias` schema test is outside the allowed files.

**Next:** `--g2e-agent 2 sprint 10 story 1`
