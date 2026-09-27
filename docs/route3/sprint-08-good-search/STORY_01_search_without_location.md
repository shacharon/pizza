# Story 01 — Search without location

**Sprint 08** · **server**

## Scope

A plain-text food search with no GPS and no city must return places. It must not stop with an empty list.

Keep the question that is already asked. Same logic, same words:

- `assist.type` `clarify`
- `assist.reason` `MISSING_LOCATION`
- `assist.suggestedAction` `ASK_LOCATION`
- `assist.message`: `כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.`
- `assist.question`: `איפה תרצה לחפש? (עיר או אזור)`

That question is the helper. Do not invent a new message.

- `פיצה` with location off runs the text search for the configured region (IL) and returns places, and still includes that question.
- A city in the text (`פיצה באשקלון`) still uses that city and does not ask this question.
- GPS on still uses the device location and does not ask this question.
- A not-food query still stops at the gate. Do not search that.
- Do not add chips. Do not add a new default city name.

The block today is the text-search location guard that sets `blocksSearch: true` and returns `LOCATION_REQUIRED` with `results: []` when there is no `userLocation` and no `cityText` (`server/src/services/search/route2/guards/textsearch-location.guard.ts` and `buildDeterministicMissingLocationClarify` in `guards/shared/response-builder.ts`). Let the search run, then attach this same assist onto the response that has places. Update the guard tests that expect this case to return no places.

No `llm-angular` edits in this story.

## Acceptance criteria

- [ ] `פיצה` with no GPS and no city returns places
- [ ] That response still has the same `MISSING_LOCATION` question and message as today
- [ ] `פיצה באשקלון` still searches that city and does not include this question
- [ ] A search with GPS still uses the device location and does not include this question
- [ ] A not-food query still does not search
- [ ] Existing guard tests match this behavior

## Agents

`-1 → 0 → 1 → 2 → 3`
