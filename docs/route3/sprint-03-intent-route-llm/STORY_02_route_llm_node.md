# Story 02 — Route-LLM node

**Sprint 03**

## Scope

- Node calls `executeRouteLLM` (dispatcher + existing mappers)
- No mapper rewrites
- Optional: fire `fireParallelTasks` here the same way Route2 does after gate/intent — **only if it is a one-liner reuse**. If it requires orchestrator surgery, defer to Sprint 05.

## Acceptance criteria

- [ ] Mapping output on state
- [ ] Route-LLM files untouched
- [ ] Mocked dispatcher test

## Agents

`-1 → 0 → 1 → 2 → 3`
