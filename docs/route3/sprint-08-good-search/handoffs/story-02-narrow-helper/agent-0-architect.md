# Handoff: Agent 0 — Architect — Story 02

**Agent:** 0 architect  
**Story:** [STORY_02_narrow_helper.md](../../STORY_02_narrow_helper.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

UI only. Not Route3. No new files. No `server/` edits.

Story 01 already returns places and this assist when the query has no city and no GPS:

- `assist.type` `clarify`
- `assist.reason` `MISSING_LOCATION`
- `assist.suggestedAction` `ASK_LOCATION`
- `assist.message` `כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.`
- `assist.question` `איפה תרצה לחפש? (עיר או אזור)`

The search page stores that object on `response.assist` and does not read `question`. `showAssistant()` only opens for `assist.mode === 'CLARIFY'`, which this response does not set. Show `message` and `question` above the result cards, with the list still visible. Do not write a new sentence.

---

## Files to add

None.

## Graph

Not Route3. No nodes, no edges.

## Stay on Route2

No Route2 imports. The page only reads the search response it already stores.

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/domain/types/search.types.ts` | optional `question`, `reason`, `suggestedAction` on `AssistPayload` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts` | `showMissingLocationQuestion` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.html` | that block above `.results-container` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.scss` | same text treatment as `.message-text` / `.message-question` |
| `llm-angular/src/app/features/unified-search/search-page/search-page-missing-location-question.spec.ts` | created |
| `server/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Do not edit `server/`. Do not change `shouldShowResults()`, `showAssistant()`, `isLocationRequiredClarify()`, `onLocationToggle()`, or `fadeOnAppear`.
- Do not treat this as the empty-result location flow. Do not set card state to `CLARIFY`. Do not call `requestLocation()` from this block.
- **Allow location** stays the existing control in `.location-status` (`onLocationToggle()`). Do not add a button, a second geolocation path, or chips.
- Do not show the “Need more info” mode line for this case. `isClarifyMode()` stays false because `assist.mode` is unset.

### When the question is visible

`showMissingLocationQuestion()` is true only when all of these hold:

- `response.results.length > 0`
- `locationState()` is not `ON`
- `assist.type === 'clarify'`
- `assist.reason === 'MISSING_LOCATION'`
- `assist.suggestedAction === 'ASK_LOCATION'`
- `assist.message` and `assist.question` are non-empty

Render both strings from the response. Do not hardcode a replacement sentence in the template. `dir="rtl"`.

Place the block inside the existing `@if (shouldShowResults() && !facade.hasGroups() && !facade.loading())` section, after `.results-header`, before `.results-container`. The cards stay in `.results-grid` under it.

### When it stays hidden

- No places, a gate stop, or `loading()`: the results section is already hidden, and the computed also requires places.
- A city in the text, or GPS: the server does not send this assist. GPS also hides it when `locationState()` is `ON`.
- A guide assist, including an empty guide message, does not match.

### Look

Match the existing assistant question, not a new panel:

- message: color `#6b7280`, font-size `0.9375rem`, line-height `1.5`, weight `400`
- question: italic, color `#9ca3af`, font-size `0.875rem`
- no border, no background card, no icon row

---

## Route2 safety

- [x] No Route2 edits
- [x] `ROUTE3_ENABLED` default remains false (not touched)

---

## Tests / verification

Jest spec on the search page. `SearchFacade` is provided on the component, so override it the same way as `search-page-results-fade.spec.ts`.

- [ ] `MISSING_LOCATION` assist plus places, location off: the question computed is true, and the rendered text is the server `message` and `question`
- [ ] Guide assist (city) with places: computed is false, and the question text is not in the document
- [ ] Same assist with `locationState` `ON`: computed is false
- [ ] Assist present and `results` empty: computed is false, and `shouldShowResults()` is false
- [ ] When the question computed is true, `shouldShowResults()` is still true

Agent 3: `פיצה` with location off shows places and both server strings above the list. `פיצה באשקלון` and a GPS search show places without those strings. The existing location control is the one that requests location.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 8 story 2`
