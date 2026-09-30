# Sprint 2 - Composition root and dependency inversion

**Story ID:** FOOD-CR-P2
**Estimate:** 2 to 3 days (1 dev)
**Risk:** Medium (touches startup order and realtime publishing)
**Depends on:** Phase 0, Phase 1
**Blocks:** Phase 3 (scale-out), Phase 4 (decomposing the big files)

## User story

As a backend developer, I want services to depend on interfaces that are wired in one place at startup, so that I can unit test the search pipeline, swap implementations (for example a Redis-backed publisher), and stop services importing `server.ts`.

## Why

- `wsManager` and `requestStateStore` are exported from `server.ts` and imported by `route2.orchestrator.ts`, `search.controller.ts`, `provider-worker.ts`, `search-ws.publisher.ts` and `assistant-ws.publisher.ts`. `provider-job-queue.ts` does `await import('.../server.js')` twice. This creates a circular dependency (`services -> server -> app -> controllers -> services`) and breaks the rule `routes -> controllers -> services -> repos/clients -> infra`.
- `searchJobStore` is a `Proxy` that converts every property into an async function. It hides the `ISearchJobStore` type and any non-function property.
- About 15 files hold module-level mutable singletons (`let xInstance = null`): Redis client, session store, metrics collector, concurrency manager, LLM provider, cache service. Wiring order is implicit.
- Redis lock code (`acquireAssistantLock`, `releaseAssistantLock`) lives inside the SSE orchestrator.

## Scope

In:
- A `bootstrap/container` that builds and owns shared infrastructure.
- Interfaces for realtime publishing and idempotency locking.
- Removal of all `import ... from 'server.js'` outside the entry point.
- Removal of the `searchJobStore` Proxy.
- A lint rule that prevents regression.

Out:
- Redis pub/sub, job queue replacement, state store move (Phase 3).
- Splitting big files (Phase 4), except the lock extraction below.
- Changing any external API behavior.

## Design

```
server.ts (entry only)
  -> loadEnv()
  -> container = await buildContainer(config)
  -> app = createApp(container)
  -> container.wsManager = new WebSocketManager(httpServer, ...)
```

Interfaces (in `server/src/infra/realtime/` or `domain/`, typed with domain DTOs):

- `IRealtimePublisher`: `publishSearch(requestId, sessionId, msg)`, `publishAssistant(requestId, sessionId, msg)`, `publishProviderPatch(providerId, placeId, requestId, status, url, updatedAt)`.
- `IIdempotencyLock`: `tryAcquire(key, ttlSeconds): Promise<boolean>`, `release(key): Promise<void>`. Redis implementation plus a no-op or in-memory implementation for dev. Keeps the current fail-open behavior.
- `Container`: `{ config, logger, redis, jobStore, requestStateStore, sessionStore, realtimePublisher, idempotencyLock, metrics }`.

`WebSocketManager` implements (or is wrapped by) `IRealtimePublisher`. Consumers receive the interface by constructor or function parameter.

## Tasks

1. Create `bootstrap/container.ts` with `buildContainer(config)`. Move Redis init (retries, fail-fast in prod/staging) from `server.ts` into it without changing behavior.
2. Define `IRealtimePublisher` and `IIdempotencyLock`. Implement `WsRealtimePublisher` (wraps `WebSocketManager`) and `RedisIdempotencyLock`.
3. Replace `searchJobStore` Proxy with an eagerly resolved `ISearchJobStore` in the container. Keep `getSearchJobStore()` only if tests still need it; mark it deprecated.
4. Change `createApp()` to `createApp(container)`. Pass dependencies into controllers and routes by factory functions (`createSearchController(container)`).
5. Refactor consumers away from `server.js`, one file per commit:
   - `search.controller.ts`
   - `route2.orchestrator.ts` (receive `IRealtimePublisher` in context or parameter)
   - `provider-worker.ts`
   - `provider-job-queue.ts` (remove both dynamic imports; also replace `process.env.REDIS_URL` with the container's config/Redis)
   - `search-ws.publisher.ts`, `assistant-ws.publisher.ts`
6. Extract the lock code from `assistant-sse.orchestrator.ts` into `RedisIdempotencyLock` and inject `IIdempotencyLock` into the orchestrator constructor.
7. Convert singletons that the container now owns (`redis-session.store`, `metrics-collector`, `concurrency-manager`, `cache-manager`) to container-provided instances. Leave the rest for later if the diff grows beyond a safe size; list what remains in the PR description.
8. Add lint enforcement: `no-restricted-imports` or `dependency-cruiser` rule forbidding imports of `server.ts` from any file except tests and the entry point. Also forbid `services/**` importing `controllers/**`.
9. Update existing tests to pass fakes (`FakeRealtimePublisher`, `FakeIdempotencyLock`). Add tests that the orchestrator publishes through the interface.
10. Smoke test locally: start server, run a search, confirm WS and SSE messages arrive, confirm provider patches arrive.

## Acceptance criteria

- [ ] `rg "from '.*server\.js'" server/src` returns only the entry point (and tests, if unavoidable).
- [ ] No dynamic `import('.../server.js')` remains.
- [ ] `searchJobStore` Proxy removed; `ISearchJobStore` is used as a normal typed dependency.
- [ ] `route2.orchestrator` can be unit tested with a fake publisher and no real server or WebSocket.
- [ ] Boot order is explicit in `buildContainer`; startup behavior (Redis retries, fail-fast in prod/staging, in-memory fallback in dev) is unchanged and covered by a test or documented manual check.
- [ ] Lint rule in CI prevents reintroducing the `server.js` import.
- [ ] Typecheck, lint and tests meet or beat the Phase 0 baseline. No new `any` added.
- [ ] Manual smoke test passes: search -> WS results -> SSE assistant -> provider RESULT_PATCH.

## Definition of done

Merged in small PRs (container + interfaces first, then one consumer group per PR), each green on the Phase 0 gate, with the architecture note added to `docs/`.

## Risks and mitigation

- Startup order bugs (session store before Redis, WS manager before HTTP server). Mitigation: container builds in a fixed order, with a boot test.
- Hidden consumers of the removed Proxy. Mitigation: typecheck will flag them; search for `searchJobStore.` before removal.
- Large diff. Mitigation: one consumer per commit; keep the old exports as thin deprecated shims until the last commit.
- Behavior drift in publishing. Mitigation: the `WsRealtimePublisher` only delegates; no logic changes in this phase.
