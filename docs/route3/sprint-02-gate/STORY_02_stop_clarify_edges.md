# Story 02 — STOP / CLARIFY / CONTINUE edges

**Sprint 02**

## Why

The graph should branch the way Route2 `if`s do, using existing terminal helpers.

## Scope

- Conditional edges from gate: `STOP` | `ASK_CLARIFY` | `CONTINUE`
- STOP / CLARIFY nodes call existing `handleGateStop` / `handleGateClarify` (or the publish helpers Route2 already uses)
- CONTINUE: placeholder edge into Sprint 03 (intent). Until then, either skip production flag or return after-gate only in tests

## Acceptance criteria

- [ ] Mocked NO → STOP response shape matches Route2 terminal (assist / empty results)
- [ ] Mocked UNCERTAIN → CLARIFY
- [ ] Mocked YES → CONTINUE (next node stub OK)
- [ ] No new LLM prompts

## Agents

`-1 → 0 → 1 → 2 → 3`
