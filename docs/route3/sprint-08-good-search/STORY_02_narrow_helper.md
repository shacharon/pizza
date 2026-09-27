# Story 02 — Same question, with the list

**Sprint 08** · **UI**

Needs story 01.

## Scope

Show the question the server already asks. Do not write a new helper, a new panel, or chips.

The question is the existing clarify assist:

- message: `כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.`
- question: `איפה תרצה לחפש? (עיר או אזור)`
- reason `MISSING_LOCATION`, suggested action `ASK_LOCATION`

Render it with the assistant / clarify UI that already shows that question. Place it above the result list. The list stays on screen under it.

- **Allow location** stays the existing location toggle. Do not add a second geolocation path.
- Do not hide, replace, or delay the results because this question is present.
- Do not show the question when the query already has a city, when GPS is on, when there are no results, or on a not-food stop.

Files: `llm-angular` search page, only so this existing question stays visible together with `shouldShowResults`. No `server/` edits.

## Acceptance criteria

- [ ] `פיצה` with location off shows places and the existing location question together
- [ ] The question text is the one the server sent, not a new sentence
- [ ] **Allow location** uses the existing toggle
- [ ] `פיצה באשקלון` shows places and does not show this question
- [ ] With GPS on, the question is absent
- [ ] The result list is visible while the question is visible

## Agents

`-1 → 0 → 1 → 2 → 3`
