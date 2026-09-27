# Story 02 — Flag-on parity gate

**Sprint 05**

## Why

Route3 is only a coordinator if behavior matches.

## Scope

- Characterization tests: same fixtures Route2 uses (gate stop, clarify, one TEXTSEARCH happy path) with LLM/Google mocked
- Document known gaps (parallel filters, debug stop, assistant timing)
- QA: one real `POST /search` flag off vs on if keys exist — compare shape not ranking noise

## Acceptance criteria

- [ ] Mocked STOP / CLARIFY / CONTINUE+results do not diverge on contract fields
- [ ] Gaps listed, not silently different
- [ ] Default flag still off

## Agents

`-1 → 0 → 1 → 2 → 3`
