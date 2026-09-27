# Handoff: Agent 1 — Developer — Story 01

**Agent:** 1 developer  
**Story:** [STORY_01_search_without_location.md](../../STORY_01_search_without_location.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

A text search with no GPS and no city no longer returns the empty `LOCATION_REQUIRED` list. The pipeline continues into the existing Google text search. The success response keeps those places and sets `assist` to the same `MISSING_LOCATION` question that the empty clarify used.

A city, a bias, GPS, a near-me query, and a not-food gate stop are unchanged. No Angular edits.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/route2.orchestrator.ts` | no-anchor text search sets `ctx.missingLocationQuestion` and stays allowed |
| `server/src/services/search/route2/types.ts` | `missingLocationQuestion?: boolean` |
| `server/src/services/search/route2/guards/textsearch-location.guard.ts` | both guards return `null` for the no-anchor text case |
| `server/src/services/search/route2/guards/shared/response-builder.ts` | `MISSING_LOCATION_CLARIFY_ASSIST` and `assistForSearchResponse` |
| `server/src/services/search/route2/orchestrator.response.ts` | success `assist` uses that object when the flag is set; `failureReason` stays `NONE` |
| `server/src/services/search/route2/__tests__/textsearch-location-guard.test.ts` | no-anchor case expects `null` |
| `server/src/services/search/route2/__tests__/early-intent-guard.test.ts` | no-anchor case expects `null` |
| `server/src/services/search/route2/__tests__/clarify-short-circuit.test.ts` | no-anchor case expects `null` |
| `server/src/services/search/route2/__tests__/missing-location-assist.test.ts` | exact Hebrew strings; guide assist when the flag is off |
| `server/src/services/search/route2/__tests__/cheeseburger2-fix.test.ts` | expectations updated; this file does not reach the new branch (see tests) |
| `llm-angular/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- The flag is set only for `TEXTSEARCH` with no `userLocation`, no `cityText`, no `mapping.bias`, and not `isNearMeQuery`.
- Guards do not call the clarify LLM for this case.
- Success `meta.failureReason` stays `NONE`. `locationRequired` and `blocksSearch` are not set. `chips` stay `[]`.
- `buildDeterministicMissingLocationClarify` still returns `results: []`. The orchestrator does not return it for this case. The near-me stop block can still reach it.

---

## Route2 safety

- [x] Gate2, Intent, and Google stage files untouched
- [x] `ROUTE3_ENABLED` default remains false (not touched)
- [x] Nearby guard unchanged

---

## Tests / verification

- [x] Command: `node --test --import tsx` on `textsearch-location-guard.test.ts`, `early-intent-guard.test.ts`, `clarify-short-circuit.test.ts`, `missing-location-assist.test.ts`
- [x] Result: pass (26 tests)

`cheeseburger2-fix.test.ts` assertions now expect the search to continue and the question to be attached. Running it imports `server.ts`, which calls `app.listen`, and the mock LLM only implements `call` while gate2 calls `completeJSON`. The cases die as `GATE_TIMEOUT` before the location decision. That process was stopped so it would not keep port 3099 open.

A live `פיצה` search is Agent 3.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 8 story 1`
