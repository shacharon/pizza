# Handoff: Agent -1 — Preflight — Story 01

**Agent:** -1 preflight  
**Story:** [STORY_01_search_without_location.md](../../STORY_01_search_without_location.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

Server story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **M**.

Today `פיצה` with no GPS and no city never reaches Google. `route2.orchestrator.ts` treats that as `allowed = false` and returns a clarify with `results: []` from `handleTextSearchMissingLocationGuard`, `handleEarlyTextSearchLocationGuard`, or `buildDeterministicMissingLocationClarify`. The story keeps that same question and lets the text search run for the configured region, then attaches the question onto the response that has places.

This edits the Route2 location stop. It does not rewrite Gate2, Intent, or Google stage internals. Not-food still stops at the gate. A city in the text and GPS stay as they are.

No `llm-angular` edits.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-08-good-search/handoffs/story-01-search-without-location/agent--1-preflight.md` | created |
| `server/src/services/search/route2/**` | N/A (later agents) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not a UI story. Do not edit `llm-angular` in this story.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- Do not rewrite Gate2, Intent, or Google stage files. The allowed edit is the no-location text-search stop: the `if (!allowed)` return in `route2.orchestrator.ts`, `textsearch-location.guard.ts`, and `buildDeterministicMissingLocationClarify` only as far as the story needs so the search runs and the same assist is attached.
- Keep these strings and fields. Do not invent a new message:
  - `assist.type` `clarify`
  - `assist.reason` `MISSING_LOCATION`
  - `assist.suggestedAction` `ASK_LOCATION`
  - `assist.message` `כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.`
  - `assist.question` `איפה תרצה לחפש? (עיר או אזור)`
- Do not add chips. Do not add a default city name.
- `פיצה באשקלון` still uses that city and does not ask this question. GPS on still uses the device location and does not ask it. A not-food query still does not search. The nearby-location guard stays.
- Update the guard tests that expect this case to return no places. Other tests that assert `LOCATION_REQUIRED` with an empty list for this same case will fail and belong in the same change.

---

## Route2 safety

- [x] Gate2, Intent, and Google stage files stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] The no-location text-search stop is the exception this story allows (orchestrator early return + location guard)

---

## Tests / verification

- [x] Command: read story, epic, sprint README, `textsearch-location.guard.ts`, `buildDeterministicMissingLocationClarify`, and the `if (!allowed)` block in `route2.orchestrator.ts`
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 8 story 1`
