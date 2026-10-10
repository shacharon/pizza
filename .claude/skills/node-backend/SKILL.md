---
name: node-backend
description: Node/Express 5/TypeScript conventions and project map for the Going2Eat backend (server/). Load before designing, writing or reviewing any backend code.
---

# Node backend — Going2Eat

Full reference: `documentation/04-backend.md`, `documentation/02-system-architecture.md`. Existing rules: `.cursor/rules/backend.mdc`, `security.mdc`, `preformance.mdc`, `interfaces.mdc`.

## Where things live (`server/src/`)
- `server.ts` / `app.ts` — bootstrap and middleware. Do not import these from services.
- `routes/v1/` → `controllers/` → `services/` → adapters/clients → `infra/`.
- `services/search/route2/` — **current production search pipeline (v1). Treat as legacy: bug fixes only, no new features.**
- `graph/` — **new LangGraph pipeline (v2).** All new search work goes here.
- `lib/llm/`, `llm/` — OpenAI client, cost calculator, budget.
- `infra/websocket/`, `controllers/stream/assistant-sse/` — realtime (v1).
- `config/` — env-based config.

Commands and hard boundaries: see `CLAUDE.md`. Tests: `testing` skill. Auth, logging and PII rules: `security-privacy` skill.

## Conventions
1. **TypeScript strict, ESM.** Imports use `.js` extensions as the codebase does.
2. **Thin controllers**: validate with zod, call one application service, map to response. No business logic.
3. **Layering + DIP**: business code depends on interfaces (`solid-oop` skill); vendor SDKs only inside adapters.
4. **Composition root**: create and wire objects at startup, never at module import (import-order bugs exist today, e.g. the rate limiter reading Redis before `initializeRedis()`).
5. **Every external call** has a timeout, an `AbortSignal`, bounded retries for idempotent calls only, and a typed error.
6. **Validation at every boundary** (HTTP body/query, LLM output, provider responses) with zod.
7. **Logging**: pino, structured, with `requestId` and truncated `sessionId`; PII rules in `security-privacy` §5.
8. **Config** via `config/` only; never read `process.env` deep inside services. New env vars documented by name in `documentation/04-backend.md` §4.
9. **No unbounded in-memory maps.** Anything keyed by request/session needs a TTL or LRU bound.
10. **Auth & ownership**: `security-privacy` §1–3.

## Known traps (do not reintroduce)
- `ctx.signal` vs `ctx.abortSignal` mismatch (async search abort was a no-op).
- Duplicate publishing of terminal WS events / assistant summary.
- Hand-copied contract types drifting between front and back — put shared types in one place.

## Review checklist
- [ ] Code placed in the right layer; no `server.ts` imports from services.
- [ ] zod at every boundary; no new `any`.
- [ ] Timeouts + abort on all external calls; bounded memory.
- [ ] `tsc` clean; tests and security per their skills.
