# Handoff: Agent 3 — QA — Story 01

**Agent:** 3 QA  
**Story:** [STORY_01_cap_model_strings.md](../../STORY_01_cap_model_strings.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** pass

---

## Summary

Route2 is still the live path. `pizza on Allenby` is sent to Google unchanged (`textQuery` length 16) and returns places. A model string over 80 characters is shortened on a word boundary before the city append; that case is the mapper test, because a live model call does not emit an 80-character query on demand. `cityText` uses the same cut at 40. Landmark `geocodeQuery` still rejects 121 characters.

There is no `ROUTE3_ENABLED` flag. The API that served the searches restarted at 19:38:53, after the cap was in the mapper.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/route-llm/cap-model-string.ts` | reviewed, not edited |
| `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts` | reviewed, not edited |
| `server/src/services/search/route2/stages/intent/intent.stage.ts` | reviewed, not edited |

---

## Decisions (do not reverse without discussion)

- The long-string cut is proven by the unit tests. The live search proves a short query is not cut and that Google still runs on Route2.
- `schemas.test.ts` `textSearchWithBias` still fails. It is outside this story. `rejects geocodeQuery too long` passed.

---

## Route2 safety

- [x] Flag off: `meta.source` is `route2`, logs say `pipelineVersion: route2`
- [x] `ROUTE3_ENABLED` does not exist; search still calls `searchRoute2`
- [x] No graph flag to turn on

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/stages/route-llm/cap-model-string.test.ts src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts src/services/search/route2/stages/route-llm/schemas.test.ts` from `server/`
- [x] Result: 42 pass, 1 pre-existing schema fail
- [x] `capModelString('pizza on Allenby', 80)` is `pizza on Allenby`
- [x] A spaced string over 80 is cut at the last space inside 80; a single token over 80 is cut to 80. The same holds at 40
- [x] Mocked text-search `textQuery` over 80 is shortened, then `Gedera` is appended
- [x] `rejects geocodeQuery too long` passes (121 characters)

`POST /api/v1/auth/token`, then `POST /api/v1/search?mode=sync` on `http://localhost:3000`:

| Query | Results | Source | Mode | Google `textQuery` |
|-------|---------|--------|------|--------------------|
| `pizza on Allenby` | 8 | `route2` | `textsearch` | `pizza on Allenby` (`textQueryLen` 16). Places include Allenby 44 |
| `pizza in Alpha Beta Gamma Delta Epsilon Zeta Eta Theta` | 0 | `route2` | `textsearch` | same string, `textQueryLen` 54, under the 80 cap, so it was not cut |

- [x] A short query is unchanged and still searches
- [x] A model `textQuery` over 80 characters is shortened before it is used
- [x] A model `cityText` over 40 characters is shortened by the same function, and intent applies it on both success returns
- [x] Landmark geocode stays at most 120 characters

---

## Open questions / next agent

None. Story 01 is done.

**Next:** `--g2e-agent -1 sprint 10 story 2`
