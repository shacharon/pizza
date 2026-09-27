# Story 01 — LCEL adapter for Gate2 JSON (optional)

**Sprint 06**

## Why

Show LCEL (`prompt → ChatOpenAI.withStructuredOutput`) as the **inside** of one hop. Graph stays LangGraph.

## Scope

- New helper used **only** when a second flag is on (e.g. `GATE2_LCEL=true`)
- Same `GATE2` prompt + JSON schema
- Prefer **not** editing `gate2.stage.ts`: wrap `completeJSON` at provider/call-site if possible. If Gate2 must switch, it is a 5-line branch — CR must confirm that is the minimum.

## Acceptance criteria

- [ ] Graph sprints still pass with LCEL off
- [ ] LCEL on: Gate2 still returns `{ foodSignal, confidence }`
- [ ] No LangGraph tools

## Agents

`-1 → 0 → 1 → 2 → 3`
