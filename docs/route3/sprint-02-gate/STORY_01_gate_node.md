# Story 01 — Gate node

**Sprint 02**

## Why

First real “thought” on the graph: food / not food / uncertain.

## Scope

- Node `gate` calls `executeGate2Stage(request, ctx)` only
- Region/language helpers may run as a prior node or stay inside the same pre-gate as Route2 (reuse `resolveUserRegionCode`, `detectQueryLanguage`) — do not duplicate logic
- After this story, CONTINUE may still **delegate remainder to `searchRoute2` internals only if architect can do so without editing Route2**. If not, CONTINUE no-ops until Sprint 03 and flag-on is “gate-only debug” — **must be stated in architect handoff**. Prefer: after gate CONTINUE, still call remaining Route2 path via a temporary `continueFromAfterGate` **only if it already exists**. Do **not** extract/split `route2.orchestrator.ts` in this story.

**Practical POC:** graph = pre → gate → (terminals in story 02) → else `searchRoute2` full pipeline is wrong (double gate). So this story must either:

- A) Graph runs gate, then a `legacyRest` node that is **not** full `searchRoute2` (blocked), or  
- B) This story is **gate + terminals only**; CONTINUE returns a documented incomplete response **only behind a debug flag**, or  
- C) Architect names an existing export to resume after gate.

**Decision for implementers:** use **B for tests**, and in the same sprint Story 02 terminals. Production flag-on wait until Sprint 03+ if CONTINUE cannot resume. Do not double-run Gate2.

## Acceptance criteria

- [ ] `executeGate2Stage` invoked from a LangGraph node
- [ ] Gate2 stage file not modified
- [ ] Tests mock `executeGate2Stage` and assert the node writes gate onto state

## Agents

`-1 → 0 → 1 → 2 → 3`
