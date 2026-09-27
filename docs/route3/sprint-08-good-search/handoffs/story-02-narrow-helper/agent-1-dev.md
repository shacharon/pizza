# Handoff: Agent 1 — Developer — Story 02

**Agent:** 1 developer  
**Story:** [STORY_02_narrow_helper.md](../../STORY_02_narrow_helper.md)  
**Sprint:** sprint-08-good-search  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

The search page shows the location question already on `response.assist` above the place cards. The list stays on screen. The existing **Enable location for better results** control is unchanged.

A guide assist, GPS on, and an empty result list do not show that question. No `server/` edits.

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/domain/types/search.types.ts` | optional `question`, `reason`, `suggestedAction` on `AssistPayload` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts` | `showMissingLocationQuestion` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.html` | question block above `.results-container` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.scss` | message and question text treatment |
| `llm-angular/src/app/features/unified-search/search-page/search-page-missing-location-question.spec.ts` | created |
| `server/` | N/A |

---

## Decisions (do not reverse without discussion)

- Both strings are bound from `response.assist`. They are not hardcoded in the template.
- The block sits inside the existing results section, so `shouldShowResults()` still gates the list.
- `onLocationToggle()`, `showAssistant()`, `isLocationRequiredClarify()`, and `fadeOnAppear` are unchanged.

---

## Route2 safety

- [x] No Route2 edits
- [x] `ROUTE3_ENABLED` untouched

---

## Tests / verification

- [x] Command: `npx jest --ci src/app/features/unified-search/search-page/search-page-missing-location-question.spec.ts --no-coverage`
- [x] Result: pass (4 tests)

Browser on http://localhost:4200/search, location off: a `פיצה` search showed 20 places and both server strings above the first card (`dir=rtl`, question italic, color `#9ca3af`). The existing location control was still the one in the header.

A city search and a GPS search stay with Agent 3.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 8 story 2`
