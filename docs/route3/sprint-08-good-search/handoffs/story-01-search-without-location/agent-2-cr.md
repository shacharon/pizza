# Handoff: Agent 2 — Code review — Story 01

**Agent:** 2 code-review  
**Story:** [STORY_01_search_without_location.md](../../STORY_01_search_without_location.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

The slice matches the architect. A `TEXTSEARCH` with no GPS, no city, no bias, and not a near-me query sets `ctx.missingLocationQuestion` and stays allowed, so Google text search still runs. Both location guards return `null` for that case and do not call the clarify LLM. `buildFinalResponse` keeps `results` and `chips: []`, sets `meta.failureReason` to `NONE`, and puts the existing Hebrew `MISSING_LOCATION` assist on the response. It does not set `locationRequired` or `blocksSearch`.

A city, a bias, or GPS leaves the flag unset, so the assist stays the guide message. Near-me still hits its own stop. Gate2, Intent, and Google stage files are untouched.

`DONE_CLARIFY` is still only chosen when `results.length === 0`. A response that has places stays `DONE_SUCCESS`, and the current client shows results from `hasResults()` unless `locationRequired` or `failureReason === 'LOCATION_REQUIRED'`.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/route2.orchestrator.ts` | reviewed |
| `server/src/services/search/route2/types.ts` | reviewed |
| `server/src/services/search/route2/guards/textsearch-location.guard.ts` | reviewed |
| `server/src/services/search/route2/guards/shared/response-builder.ts` | reviewed |
| `server/src/services/search/route2/orchestrator.response.ts` | reviewed |
| Guard and assist tests | reviewed |
| `llm-angular/` | not part of this story |
| `route3/` | not part of this story |

---

## Decisions (do not reverse without discussion)

- Approve. Do not send back to the developer.
- `cheeseburger2-fix.test.ts` does not exercise this branch: its mock LLM has no `completeJSON`, so gate2 fails before the location decision, and importing the orchestrator starts `app.listen`. The passing tests are the guard tests and `missing-location-assist.test.ts`.
- Unrelated `server/src` edits are still in the working tree. Leave them out of this story.

---

## Route2 safety

- [x] Gate2, Intent, and Google stage files untouched
- [x] `ROUTE3_ENABLED` untouched
- [x] Nearby guard unchanged
- [x] Flag-off path is still Route2 (no Route3 branch added)

---

## Tests / verification

- [x] Command: `node --test --import tsx` on `textsearch-location-guard.test.ts`, `early-intent-guard.test.ts`, `clarify-short-circuit.test.ts`, `missing-location-assist.test.ts`
- [x] Result: pass (26 tests)

A live `פיצה` search, and `פיצה באשקלון` without this question, stay with Agent 3.

---

## Open questions / next agent

None for the developer.

**Next:** `--g2e-agent 3 sprint 8 story 1`
