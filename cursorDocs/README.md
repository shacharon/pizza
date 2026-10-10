# cursorDocs — Going2Eat backend (`server/`)

Written 2026-10-10 from a code review of `server/src`. The route2 flow (doc 05) was read line by line from `route2.orchestrator.ts` and its modules. Other areas use `documentation/04-backend.md`, spot-checked against the code where I touched them. Paths are relative to `server/src/` unless stated.

| File | What is inside |
|---|---|
| [01-high-level-architecture.md](01-high-level-architecture.md) | System context, runtime containers, request lifecycle, layers |
| [02-low-level-architecture.md](02-low-level-architecture.md) | Folder/module map, key classes and interfaces, state and storage, WebSocket, caches, config |
| [03-solid-services.md](03-solid-services.md) | Service inventory, SOLID scorecard with real examples, target design |
| [04-tech-stack.md](04-tech-stack.md) | Runtime, libraries, external APIs, infra |
| [05-route2-flow.md](05-route2-flow.md) | Step-by-step route2 pipeline: stages, guards, fallbacks, timings, events, bugs |
| [06-review-findings.md](06-review-findings.md) | Prioritised review findings and a suggested order of work |
| [08-llm-first-architecture-proposal.md](08-llm-first-architecture-proposal.md) | **For CTO review:** today vs options A/B/C, LLM call counts, what stays deterministic, recommendation, migration plan, risks |
| [07-as-is-hld-and-langgraph-gaps.md](07-as-is-hld-and-langgraph-gaps.md) | As-is HLD, runtime trace with functions, active vs legacy, state, tests, observability, 17 evidence-backed LangGraph gaps |

## Review verdict (short)

**What is good**
- Route2 is a clear, staged pipeline: `gate2 → intent → route-LLM → Google → post-filter → rank → enrich → respond`.
- Every stage logs start/end with timings, has a defined fallback, and honours an abort signal.
- LLM outputs go through zod and strict JSON schema. Prompts are versioned.
- Job store, LLM provider and the WebSocket parts are real interfaces or small classes.
- The Google cache layers, the per-session LLM budget and the job ownership checks are well thought out.

**What hurts**
1. The pipeline is a **procedural god-function** (`searchRoute2Internal`) with hidden dependencies: module singletons, `wsManager` imported from `server.ts`, and `any` casts. It is hard to unit test and breaks DIP.
2. **State is per process** (WS subscriptions, backlog, provider queue, rate limits, analytics), so the app cannot scale past one ECS task safely.
3. **Auth and rate-limit holes** (details in `documentation/04-backend.md` §20): `/auth/token` signs any client `sessionId`, auto-refresh signs unverified cookie claims, and `X-Forwarded-For` is trusted.
4. **Dead code and a rotted test baseline.** About 40 dead files, `npm test` fails, and there is no CI.
5. Several **semantic bugs** in the async flow (clarify ending as `DONE_STOPPED`, a dead 30 s abort, duplicate assistant messages). Details in doc 05.

Per `CLAUDE.md`: route2 gets bug fixes only, and new search work goes in `server/src/graph/` (LangGraph v2). **That folder does not exist on this branch**, so route2 is the only engine here (see doc 01 §7).
