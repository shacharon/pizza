# Story 01 — Flag and Route3 folder

**Sprint 01**

## Why

Need a switch that does not change Route2 behavior.

## Scope

- `ROUTE3_ENABLED` (default false) next to `ROUTE2_ENABLED`
- `server/src/services/search/route3/` with `index.ts` exporting `searchRoute3`
- Search controller: if Route3 flag **and** llm → `searchRoute3`, else existing Route2
- Log `pipelineVersion: 'route3'` vs `'route2'`

## Out of scope

Graph nodes. Stage calls. Angular.

## Acceptance criteria

- [ ] Unset / false: same as today (Route2)
- [ ] True: enters `searchRoute3` (may still no-op or throw “not implemented” only if Story 02 not done — prefer Story 01 returning a clear `CONFIG`/`NOT_IMPLEMENTED` only in tests, not silent Route2)
- [ ] No edits under `route2/stages/`

## Agents

`-1 → 0 → 1 → 2 → 3`
