# 02 — High-level architecture (backend)

## System view

```
                         ┌───────────────────────── Express 5 app (server/src/app.ts) ──────────────────────────┐
 Angular 19 client       │ rate-limit(300/min) → timeouts → helmet → compression → json → requestContext       │
 (app.going2eat.food) ──►│ → http logging → CORS → autoRefreshExpiredCookie → /api/v1 router (+ legacy /api)    │
   HTTP  /api/v1/*       │                                                                                       │
   WS    /ws?ticket=…    │  auth  ─ /auth/token /bootstrap /session /whoami /ws-ticket                           │
   SSE   /stream/…       │  search ─ POST /search (sync|async) · GET /search/:id · GET /search/:id/result       │
                         │  stream ─ GET /stream/assistant/:requestId (SSE, behind FEATURE_SSE_ASSISTANT)       │
                         │  restaurants/:id · photos proxy · analytics · feedback · flags · healthz · debug      │
                         └──────────────┬──────────────────────────────────────────┬────────────────────────────┘
                                        │ async: 202 + background                   │
                                        ▼                                           ▼
                         ┌──────── route2 pipeline ────────┐            ┌──── WebSocketManager (in-process) ───┐
                         │ gate2 → intent → route_llm →     │──publish──►│ channels: search:<id>, assistant:<id>│
                         │ ║ base_filters ║ post_constraints │            │ subscribe w/ ownership check,        │
                         │ ║ Google Places ║ early SUMMARY   │            │ pending subs, backlog                │
                         │ → post-filter → rank → enrich →  │            └──────────────────────────────────────┘
                         │ response                         │
                         └──┬──────────┬───────────┬────────┘
                            │          │           │
                     OpenAI LLM   Google Places   Redis ◄── job store · caches · sessions · ws tickets
                     (gpt-4o-mini   (New) Text/            · LLM budget · provider-link cache+locks
                      default)      Nearby                 │
                                                           ▼
                                             ProviderJobQueue (in-process, per provider)
                                             → Brave Search / Google CSE → Wolt / 10bis / Mishloha link
                                             → Redis SETEX → WS RESULT_PATCH

 Other: DynamoDB (provider-call audit, optional) · SES (feedback email)
```

## Layers

| Layer | Folders | Role |
|---|---|---|
| Boot | `server.ts` | dotenv, Redis init with retries, session store, `createApp()`, `listen`, `WebSocketManager`, process handlers |
| HTTP | `app.ts`, `routes/v1`, `middleware/`, `controllers/` | Middleware chain, auth, rate limits, request validation (zod) |
| Realtime | `infra/websocket/`, `controllers/stream/assistant-sse/` | WS pub/sub per requestId; SSE assistant stream |
| Domain pipeline | `services/search/route2/` | The search itself (see 03) |
| Jobs | `services/search/job-store/` | `ISearchJobStore`: Redis or in-memory, behind a Proxy |
| LLM | `llm/`, `lib/llm/` | `LLMProvider` interface, OpenAI provider, per-purpose model resolver, session budget, cost |
| Cross-cutting | `lib/*` | logger, redis client, cache, reliability (timeouts), security, telemetry, session, metrics |

## Request lifecycle (async mode, the main path)
1. The client gets an identity: `/auth/bootstrap` (session cookie) or `/auth/token` (JWT).
2. The client requests `/auth/ws-ticket`, opens `/ws?ticket=…` and subscribes to `search` and `assistant` for a requestId. The subscription can be *pending* until the job exists.
3. `POST /search?mode=async` validates the body, creates the job (owner = session), activates pending subscriptions, returns 202 `{requestId, resultUrl}` and runs `executeBackgroundSearch` in the background.
4. route2 runs and publishes progress, assistant messages, `SEARCH_RESULTS`, then `ready`/`clarify`/`error`.
5. Background provider jobs later send `RESULT_PATCH` (order links) to `search:<requestId>`.
6. Fallback: the client polls `GET /search/:id/result`.

## Composition / DI style
- **No composition root.** Most wiring is module singletons and service locators: `wsManager` exported from `server.ts` (circular imports), `getExistingRedisClient()`, `getConfig()`, `createLLMProvider()`, `searchJobStore` Proxy, `getProviderJobQueue()`, `getMetricsCollector()`.
- Constructor injection exists only in parts of the code: the WebSocket sub-managers, the SSE orchestrator, the Redis job/session stores, and the enrichment clients/resolver.

## Key scaling limit
WS pub/sub and the provider job queue are **in-process**. With more than one instance (ECS tasks), a client whose socket is on instance A never receives events from a search that runs on instance B, unless the load balancer uses sticky sessions. Redis pub/sub is not used.
