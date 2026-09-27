# Handoff: Agent 2 — Code review — Story 02

**Agent:** 2 code-review  
**Story:** [STORY_02_narrow_helper.md](../../STORY_02_narrow_helper.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

UI review only. The question block matches the architect. `showMissingLocationQuestion()` is true only when there are places, location is not `ON`, and the assist is `clarify` / `MISSING_LOCATION` / `ASK_LOCATION` with both strings set. The template prints `assist.message` and `assist.question` inside the existing results section, above `.results-container`, with `dir="rtl"`. The list stays in `.results-grid`.

Styles match the existing assistant question: message `#6b7280` at `0.9375rem`, question italic `#9ca3af` at `0.875rem`, no border or card. `shouldShowResults()`, `showAssistant()`, `isLocationRequiredClarify()`, `onLocationToggle()`, and `fadeOnAppear` are unchanged. No `server/` edits for this story.

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/domain/types/search.types.ts` | reviewed |
| `search-page.component.ts` | reviewed (`showMissingLocationQuestion` only for this story) |
| `search-page.component.html` | reviewed (question block) |
| `search-page.component.scss` | reviewed (`.missing-location-question`) |
| `search-page-missing-location-question.spec.ts` | reviewed |
| `server/` | not part of this story |

---

## Decisions (do not reverse without discussion)

- Approve. Do not send back to the developer.
- The same search-page files also contain the location-denied hint and the results fade from earlier work. Those are not story 02. Do not treat them as part of this question.

---

## Route2 safety

- [x] This story did not edit Route2 stage files
- [x] `ROUTE3_ENABLED` untouched (UI story; flag review not required)

---

## Tests / verification

- [x] Command: `npx jest --ci src/app/features/unified-search/search-page/search-page-missing-location-question.spec.ts --no-coverage`
- [x] Result: pass (4 tests)

The spec covers the question with places, a guide assist, GPS on, an empty list, and `shouldShowResults()` staying true while the question is shown. A city search and a GPS search on the live page stay with Agent 3.

---

## Open questions / next agent

None for the developer.

**Next:** `--g2e-agent 3 sprint 8 story 2`
