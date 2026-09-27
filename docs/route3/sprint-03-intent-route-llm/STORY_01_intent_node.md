# Story 01 — Intent node

**Sprint 03**

## Scope

- Node calls `executeIntentStage`
- Reuse near-me overrides / location guards by **importing** existing orchestrator modules (`orchestrator.nearme`, `orchestrator.guards`) — do not copy-paste
- Intent stage file unchanged

## Acceptance criteria

- [ ] TEXTSEARCH / NEARBY / LANDMARK from real intent function lands on state
- [ ] Timeout fallback behavior is still Intent’s, not LangGraph’s
- [ ] Tests with mocked intent

## Agents

`-1 → 0 → 1 → 2 → 3`
