# Handoff: Agent 2 — Code Review — Story 01

**Agent:** 2 code review  
**Story:** [STORY_01_cap_model_strings.md](../../STORY_01_cap_model_strings.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

The story cut is in place. After a successful text-search parse, `textQuery` is passed through `capModelString` at 80 characters, and only then does the existing city append run. Both intent success returns cap `cityText` at 40. `createFallbackResult` and `buildDeterministicMapping` do not call the cap. Schemas still have no max on those two fields. `geocodeQuery` is still `max(120)`. Nearby `keyword` is still `max(80)`.

Search still calls `searchRoute2` from the controller. There is no `ROUTE3_ENABLED` flag and no graph.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/route-llm/cap-model-string.ts` | created; matches the architect function |
| `server/src/services/search/route2/stages/route-llm/cap-model-string.test.ts` | created |
| `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts` | one cap line before the city append |
| `server/src/services/search/route2/stages/intent/intent.stage.ts` | cap on both success `cityText` returns |
| `server/src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts` | long query is shortened, then `Gedera` is appended |

---

## Decisions (do not reverse without discussion)

- Approve the cap. Do not add a schema max on `textQuery` or `cityText`.
- The same working tree also has `truncateWordsForLlm` on the user prompt in Gate2, intent, and the three mappers. That was already uncommitted before this story. This review does not approve it. Story 2 owns that 25-word cut.
- `schemas.test.ts` still fails `validates happy path with textSearchWithBias` because `afterGeocode` is `nearbySearch` | `textSearch`. That file was not edited. `rejects geocodeQuery too long` passes. Not a reject for this story.

---

## Route2 safety

- [x] Gate2 routing, Intent route selection, and the Google client untouched by this story
- [x] `ROUTE3_ENABLED` does not exist; `search.controller.ts` still calls `searchRoute2`
- [x] No new graph, prompt, or agent loop
- [x] Landmark 120 and nearby keyword 80 stay reject-on-overflow
- [x] Fallbacks still belong to the existing stages

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/stages/route-llm/cap-model-string.test.ts src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts src/services/search/route2/stages/route-llm/schemas.test.ts` from `server/`
- [x] Result: 42 pass, 1 pre-existing schema fail (`textSearchWithBias`)
- [x] `pizza on Allenby` stays unchanged at cap 80
- [x] A long spaced string and a single long token are cut for both 80 and 40
- [x] Mapper result is the capped query plus `Gedera`

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 3 sprint 10 story 1`
