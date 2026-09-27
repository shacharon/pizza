# Handoff: Agent 1 — Developer — Story 02

**Agent:** 1 developer  
**Story:** [STORY_02_near_me_stays_near.md](../../STORY_02_near_me_stays_near.md)  
**Sprint:** sprint-09-gate-and-near-me  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

A NEARBY food word still goes to Text Search with the word in `textQuery`. The body now uses `locationRestriction.rectangle` from `circleToTextSearchRectangle` instead of `locationBias`. A generic restaurant word stays on Nearby Search with a circle and distance rank.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/google-maps/nearby-food-query.ts` | rectangle helper; food-word body has no `locationBias` |
| `server/src/services/search/route2/stages/google-maps/__tests__/nearby-food-query.test.ts` | rectangle assertions for `אסייתית`, `Italian`, and US `pizza` |
| `nearby-search.handler.ts` | N/A |
| `text-search.handler.ts` | N/A |
| `llm-angular/` | N/A |

---

## Decisions (do not reverse without discussion)

- `circleToTextSearchRectangle` uses 111320 meters per degree and `max(cos(lat), 0.01)` for longitude.
- `nearbyFoodTextQuery` is unchanged. `Italian` on `IL` stays `Italian`. US `pizza` stays `pizza restaurant`.
- No second Google call when the fence is empty.

---

## Route2 safety

- [x] Gate2, Intent, and city Text Search untouched
- [x] `ROUTE3_ENABLED` untouched
- [x] Generic nearby circle still `searchNearby` with `rankPreference` `DISTANCE`

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/stages/google-maps/__tests__/nearby-food-query.test.ts`
- [x] Result: pass (6 tests)

The running API must restart before a live `Italian next to me` search uses the rectangle. That live check is Agent 3.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 9 story 2`
