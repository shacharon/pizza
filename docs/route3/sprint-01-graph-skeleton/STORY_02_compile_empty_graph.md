# Story 02 — Compile empty LangGraph

**Sprint 01**

## Why

Prove LangGraph is a real dependency in the search path without replacing stages.

## Scope

- Add `@langchain/langgraph` if needed (keep existing `langchain` / `@langchain/openai`)
- `StateGraph` with state: request + `Route2Context` (or a thin Route3 state wrapping them)
- Single node `passthrough` that calls existing `searchRoute2` **or** returns a stub — **architect chooses one:**
  - **Preferred for safety:** empty graph node that only tags `pipelineVersion: route3` then **delegates to `searchRoute2`** so flag-on still works while later sprints replace the delegate.
  - **Not preferred:** flag-on broken until Sprint 02.

## Acceptance criteria

- [ ] Graph compiles and invokes
- [ ] Flag on: search still returns a valid `SearchResponse` (delegate to Route2 OK)
- [ ] Flag off: never imports/runs graph in the hot path if cheap; if import is static, behavior must still be Route2
- [ ] Unit test: flag off does not require LangGraph to succeed conceptually (document if compile-time import is unavoidable)

## Agents

`-1 → 0 → 1 → 2 → 3`
