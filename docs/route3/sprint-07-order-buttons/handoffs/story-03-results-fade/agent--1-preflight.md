# Handoff: Agent -1 — Preflight — Story 03

**Agent:** -1 preflight  
**Story:** [STORY_03_results_fade.md](../../STORY_03_results_fade.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

UI story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **S**.

`.results-grid` lives in `search-page.component.html` inside `@if (shouldShowResults() && !facade.hasGroups() && !facade.loading())`. It has no enter animation today. Load more only raises `visibleCount`. Card click calls `selectRestaurant` and does not rebuild the grid. A fade that runs when that grid element is created will play once per new list, and will not replay when cards are appended or selected.

No Route2 rewrite. No `server/` edit. Stories 01 and 02 stay as they are.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-07-order-buttons/handoffs/story-03-results-fade/agent--1-preflight.md` | created |
| `llm-angular/.../search-page/*` | N/A (later agents) |
| `server/` | N/A |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- **UI sprint.** Code is `llm-angular` only. Do not edit `server/`. Do not add Route3 nodes.
- Files: `search-page` scss, and html/ts only if the fade must start when results arrive. Do not edit `restaurant-card` or `onProviderLinkClick`.
- Fade `.results-grid` once when a new result list appears. Do not fade again on load more, filter chips, or card selection. No other page animation.
- Grouped results do not use `.results-grid` (`hasGroups()` takes the other branch). This story does not add a fade there unless the architect finds that branch is the list users see.
- Watch `facade.loading()`: the grid is destroyed while loading is true. A new search may remount it (one fade is correct). A chip click that flips `loading()` would remount and replay the fade, which this story forbids. Architect must keep chips from replaying it.

---

## Route2 safety

- [x] Route2 stage files untouched (UI only; no `server/` work)
- [x] `ROUTE3_ENABLED` default remains false (this story does not touch the flag)

---

## Tests / verification

- [x] Command: read story, epic, sprint README, story 02 QA (pass), and the search-page results `@if` / `loadMore` / `.results-grid`
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 7 story 3`
