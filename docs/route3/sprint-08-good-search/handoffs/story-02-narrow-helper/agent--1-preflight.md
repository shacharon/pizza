# Handoff: Agent -1 — Preflight — Story 02

**Agent:** -1 preflight  
**Story:** [STORY_02_narrow_helper.md](../../STORY_02_narrow_helper.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

UI story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **S**. Depends on story 01, which is already on the API: `פיצה` with no GPS and no city returns places plus the existing `MISSING_LOCATION` assist.

The search page does not show that question today. `showAssistant()` looks at `assist.mode === 'CLARIFY'`. Story 01 sets `assist.type` to `clarify` and puts the words on `assist.message` and `assist.question`. It does not set `assist.mode`, `locationRequired`, or `blocksSearch`. `shouldShowResults()` already shows the list when there are places.

Show that server question above the list. Keep the list on screen. No new helper, panel, sentence, or chips. No `server/` edits.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-08-good-search/handoffs/story-02-narrow-helper/agent--1-preflight.md` | created |
| `llm-angular` search page | N/A (later agents) |
| `server/` | N/A |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- UI only. Do not edit `server/`. Do not add Route3 nodes. Do not change `ROUTE3_ENABLED`.
- Do not rewrite Gate2, Intent, or Google.
- Use the question already on `response.assist` from story 01. Do not write a new sentence. The text is:
  - message `כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.`
  - question `איפה תרצה לחפש? (עיר או אזור)`
  - reason `MISSING_LOCATION`, suggested action `ASK_LOCATION`
- Render it with the assistant / clarify UI that already shows a question (`assistant-summary` `.message-question`, or the same markup). Put it above the result list. `shouldShowResults()` stays true while it is visible.
- Do not treat this as `isLocationRequiredClarify()`. That path is the empty-result permission flow (`locationRequired` / `LOCATION_REQUIRED`). This response has places and must not hide, replace, or delay them.
- **Allow location** stays `onLocationToggle()` and the existing location control. Do not add a second geolocation path.
- Do not show this question when the response has no places, on a not-food gate stop, when the query has a city, or when GPS is on. Those responses do not carry this assist. Do not add chips.

---

## Route2 safety

- [x] No Route2 stage edits in this story
- [x] `ROUTE3_ENABLED` default remains false
- [x] UI story: flag-off / flag-on graph checks do not apply

---

## Tests / verification

- [x] Command: read story, sprint README, epic, story 01 QA, search page `showAssistant` / `shouldShowResults`, and `assistant-summary` question markup
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 8 story 2`
