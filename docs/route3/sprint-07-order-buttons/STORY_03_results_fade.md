# Story 03 — Results fade

**Sprint 07** · **UI**

## Scope

When a search result list appears, fade `.results-grid` in once. Do not fade again on “load more”, filter chips, or card selection. No other page animation.

File: `llm-angular/src/app/features/unified-search/search-page/` (scss, and html/ts only if the fade must start when results arrive). No `server/` edits.

## Acceptance criteria

- [ ] A new result list fades in once
- [ ] Load more, chips, and selecting a card do not replay the fade
- [ ] Order buttons from stories 01 and 02 still work

## Agents

`-1 → 0 → 1 → 2 → 3`
