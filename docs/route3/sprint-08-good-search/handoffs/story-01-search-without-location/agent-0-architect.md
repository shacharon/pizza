# Handoff: Agent 0 — Architect — Story 01

**Agent:** 0 architect  
**Story:** [STORY_01_search_without_location.md](../../STORY_01_search_without_location.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No new files. No Angular.

`פיצה` with no GPS and no city must go through the existing text search (region already on the mapping, normally `IL`) and return those places. The same location question is attached on that response. Do not return the empty clarify that stops the pipeline today.

A city in the text, GPS, a near-me query, and a not-food gate stop stay as they are.

---

## Files to add

None.

## Graph

Not Route3. No nodes, no edges.

## Stay on Route2

Keep calling the existing text-search stage, `buildFinalResponse`, and the nearby-location guard. Do not replace them. The only new data is `ctx.missingLocationQuestion` and the assist object already defined in `response-builder.ts`.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/route2.orchestrator.ts` | do not return early on a text search that only lacks a location anchor; set a flag |
| `server/src/services/search/route2/types.ts` | `missingLocationQuestion?: boolean` on `Route2Context` |
| `server/src/services/search/route2/guards/textsearch-location.guard.ts` | the no-anchor text case returns `null` (continue) |
| `server/src/services/search/route2/guards/shared/response-builder.ts` | export the existing assist fields for the success response |
| `server/src/services/search/route2/orchestrator.response.ts` | when the flag is set, put that assist on the response that already has `results` |
| Guard tests listed below | expect continue, not an empty list |
| `llm-angular/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Do not edit Gate2, Intent, Google stage files, or the nearby-location guard.
- Do not add a city name, a location bias, or chips. `mapping.region` is already the configured region. Text search already sends `regionCode` from that. Leave it.
- Do not call the clarify LLM for this case. The words must stay the two strings already in `buildDeterministicMissingLocationClarify`.
- Do not publish a terminal CLARIFY and do not set `blocksSearch`. Do not set `meta.failureReason` to `LOCATION_REQUIRED` or `meta.locationRequired` on this success response. Those flags are what today’s empty stop uses. This response is a normal text search (`failureReason: 'NONE'`) plus the assist below.
- `buildDeterministicMissingLocationClarify` must not be the HTTP response for this case. It returns `results: []`.

### When the flag is set

Set `ctx.missingLocationQuestion = true` only when all of these are true:

- intent route is `TEXTSEARCH`
- no `ctx.userLocation`
- no `intentDecision.cityText` and no `mapping.cityText`
- no `mapping.bias`
- the query is not a near-me query (`isNearMeQuery` stays on its own guard)

Then fall through into the existing Google path (`allowed` stays true). Both call sites must not return a clarify:

1. Line that calls `handleEarlyTextSearchLocationGuard` right after intent.
2. The `if (!allowed)` block that calls the missing-location guard, the early guard again, and `buildDeterministicMissingLocationClarify`.

`handleEarlyTextSearchLocationGuard` and `handleTextSearchMissingLocationGuard` return `null` for that no-anchor text case. They still return `null` when a city, GPS, bias, or near-me is present (they already do). They still ignore non-text routes.

### Assist on the success response

In `buildFinalResponse`, when `ctx.missingLocationQuestion` is true, set `assist` to:

```ts
{
  type: 'clarify',
  reason: 'MISSING_LOCATION',
  suggestedAction: 'ASK_LOCATION',
  message: 'כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.',
  question: 'איפה תרצה לחפש? (עיר או אזור)'
}
```

Export that object from `response-builder.ts` (one copy of the strings). `results` stay `finalResults`. `chips` stay `[]`.

When the flag is false, `assist` stays the current guide message.

---

## Route2 safety

- [x] Gate2, Intent, and Google stage files untouched
- [x] `ROUTE3_ENABLED` default remains false
- [x] Nearby guard and not-food gate stop unchanged

---

## Tests / verification

Update and run:

- `server/src/services/search/route2/__tests__/textsearch-location-guard.test.ts`
- `server/src/services/search/route2/__tests__/early-intent-guard.test.ts`
- `server/src/services/search/route2/__tests__/clarify-short-circuit.test.ts`
- `server/src/services/search/route2/__tests__/cheeseburger2-fix.test.ts` where it expects this no-location case to return `LOCATION_REQUIRED` and no places

Expect:

- [ ] No GPS and no city: guard returns `null` (search continues)
- [ ] City in the text, or GPS: guard returns `null`, and the success assist is not this question
- [ ] Not-food still stops at the gate (no Google)
- [ ] A success response with the flag set has places (when Google returned them) and the assist fields above, and `meta.failureReason` is `NONE`

Agent 3: one `פיצה` search with location off returns places and that assist. `פיצה באשקלון` does not include this question.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 8 story 1`
