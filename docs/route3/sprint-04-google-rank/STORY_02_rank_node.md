# Story 02 — Rank node

**Sprint 04**

## Scope

- Node calls `applyBaselineRanking` / `resolveRankingWeights` / observability logs already in Route2
- Post-filters: import `applyPostFiltersToResults` if parallel constraints exist on state; else apply defaults

## Acceptance criteria

- [ ] Same weight constants (`BASELINE_WEIGHTS`) — no new ranking formula
- [ ] Ranking modules untouched except imports

## Agents

`-1 → 0 → 1 → 2 → 3`
