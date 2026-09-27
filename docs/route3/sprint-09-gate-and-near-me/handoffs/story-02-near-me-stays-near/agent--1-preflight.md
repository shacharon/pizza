# Handoff: Agent -1 — Preflight — Story 02

**Agent:** -1 preflight  
**Story:** [STORY_02_near_me_stays_near.md](../../STORY_02_near_me_stays_near.md)  
**Sprint:** sprint-09-gate-and-near-me  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

Server story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **S**.

`buildNearbyGoogleCall` in `nearby-food-query.ts` already splits two ways. A generic word (`restaurant`, `מסעדה`, `food`) uses Nearby Search with `locationRestriction` as a circle and `rankPreference: DISTANCE`. A real food word uses Text Search with `locationBias` as a circle, so Google may return places outside that circle.

This story may change the food-word Text Search call so the same circle becomes a hard rectangle (`locationRestriction`), and keep the food word in `textQuery`. Do not rewrite Gate2, Intent, or the generic Nearby Search branch. Do not add a second Google call that fills an empty fence from another city.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-09-gate-and-near-me/handoffs/story-02-near-me-stays-near/agent--1-preflight.md` | created |
| `server/src/services/search/route2/stages/google-maps/nearby-food-query.ts` | N/A (later agents) |
| `server/src/services/search/route2/stages/google-maps/__tests__/nearby-food-query.test.ts` | N/A (later agents) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- Allowed edit: `nearby-food-query.ts` and `nearby-food-query.test.ts` only.
- Do not edit Gate2 or Intent.
- A NEARBY food word (`Italian`, `pizza`, `sushi`, `אסייתית`) stays on Text Search. The body uses `locationRestriction` (a rectangle built from `location` and `radiusMeters`), not `locationBias`. The food word stays in `textQuery`.
- A generic `restaurant` / `מסעדה` stays on Nearby Search: hard circle, `includedTypes: ['restaurant']`, `rankPreference: DISTANCE`.
- An empty Google list stays empty. `nearby-search.handler.ts` already returns `results: []` when Google returns nothing. Do not add a Tel Aviv or city fallback.
- A city query such as `pizza in Tel Aviv` is text search, not this NEARBY builder. Leave that path alone.
- Story 01 (food typo prompt) is done. Do not edit it here.

---

## Route2 safety

- [x] Gate2 and Intent stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] The NEARBY food-word Google body in `nearby-food-query.ts` is the exception this story allows

---

## Tests / verification

- [x] Command: read story, sprint README, `nearby-food-query.ts`, its test, and the empty-result path in `nearby-search.handler.ts`
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 9 story 2`
