# Handoff: Agent 0 — Architect — Story 03

**Agent:** 0 architect  
**Story:** [STORY_03_results_fade.md](../../STORY_03_results_fade.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

UI design only. Fade `.results-grid` in once when a new result list is shown. A CSS animation on the grid by itself would also run after a chip click, because `onChipClick` can call `search()` and `facade.loading()` destroys the grid. Gate the animation with a class that a new search turns on and a chip click turns off.

No restaurant-card edits. No `server/` edits. No grouped-results fade (that branch has no `.results-grid`).

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.scss` | one keyframes block and `.results-grid--enter` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.html` | class binding on `.results-grid` |
| `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts` | `fadeOnAppear` signal; set it in `onSearch`, `onRecentSearchClick`, and `onChipClick` |
| `restaurant-card/*` | N/A |
| `server/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Opacity only. No translate, scale, or animation on any other element.
- One play, about `0.4s` ease-out. No iteration, no delay before the list is usable (the list is in the DOM for the whole fade).
- Do not put the animation on `.results-grid` unconditionally. Chip search sets `loading()`, the `@if` drops the grid, and a bare animation would replay when the grid returns.
- Do not fade the grouped-results branch.
- Do not change `loadMore` or `onCardClick`. They do not recreate `.results-grid`.
- `prefers-reduced-motion: reduce` skips the animation (opacity stays 1).

### TypeScript

```ts
readonly fadeOnAppear = signal(true);

onSearch(query: string): void {
  this.fadeOnAppear.set(true);
  this.facade.search(query);
  this.visibleCount.set(10);
}

onRecentSearchClick(query: string): void {
  this.fadeOnAppear.set(true);
  this.facade.onSelectRecent(query);
}

onChipClick(chipId: string): void {
  this.fadeOnAppear.set(false);
  this.facade.onChipClick(chipId);
}
```

`true` at start so the first list fades in. A later search or recent-search click sets it true again. A chip click sets it false before that search returns.

### Markup

On the existing grid only:

```html
<div class="results-grid" [class.results-grid--enter]="fadeOnAppear()">
```

### Styles

```scss
.results-grid--enter {
  animation: results-fade-in 0.4s ease-out;
}

@keyframes results-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .results-grid--enter {
    animation: none;
  }
}
```

Leave the existing `.results-grid` grid rules as they are.

---

## Route2 safety

- [x] Route2 stage files untouched
- [x] `ROUTE3_ENABLED` default remains false

---

## Tests / verification

Agent 1 may add a small search-page spec:

- [ ] `onSearch` sets `fadeOnAppear` true
- [ ] `onChipClick` sets `fadeOnAppear` false
- [ ] `loadMore` and `onCardClick` leave `fadeOnAppear` unchanged

QA (agent 3) in the browser:

- [ ] A new search fades the result list in once
- [ ] Load more does not fade the list again
- [ ] A filter chip does not fade the list again
- [ ] Selecting a card does not fade the list again
- [ ] Order on Wolt / 10bis / Mishloha still open, and the press gray from story 02 is still there

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 7 story 3`
