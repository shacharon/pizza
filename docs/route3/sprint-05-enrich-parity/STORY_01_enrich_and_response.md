# Story 01 — Enrich and final response

**Sprint 05**

## Scope

- Nodes or one node calling existing Wolt / 10bis / Mishloha enrich + `buildFinalResponse`
- WS publish: reuse existing helpers; do not import `wsManager` from `server.ts` if a publisher port already exists — if not, same pattern as Route2 (do not expand that debt)

## Acceptance criteria

- [ ] `SearchResponse` matches Route2 fields
- [ ] Enrichment modules untouched
- [ ] Pipeline timeout: reuse `withTimeout` / `route2Config.PIPELINE_TIMEOUT_MS`

## Agents

`-1 → 0 → 1 → 2 → 3`
