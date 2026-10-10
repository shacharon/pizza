# 05 — Services, responsibilities and SOLID assessment

## Main services / classes

| Area | Unit | Kind | Responsibility | DI |
|---|---|---|---|---|
| Boot | `server.ts` | module | Env, Redis boot, session store, app, WS, process handlers | n/a (exports singletons `wsManager`, `requestStateStore`) |
| HTTP | `createApp()` (`app.ts`) | function | Middleware chain + routers | none |
| Search | `search.controller.ts`, `executeBackgroundSearch` | functions | Validate, create job, 202, run pipeline, write job status | imports singletons |
| Pipeline | `searchRoute2` + `orchestrator.*.ts` | functions | Stage coordination | only `deps.wsManager` (for tests) |
| Stages | `executeGate2Stage`, `executeIntentStage`, `executeRouteLLM`, `executeGoogleMapsStage`, `executePostConstraintsStage`, `resolveBaseFiltersLLM` | functions | One LLM/API step each | `ctx.llmProvider` passed via context; env read inline |
| Filters / ranking | `applyPostFilters`, `resolveFilters`, `resolveRankingWeights`, `applyBaselineRanking` | pure-ish functions | Post-filter, weight, sort | none needed (good) |
| Jobs | `ISearchJobStore` → `RedisSearchJobStore` / in-memory | interface + classes | Job status/result/owner | constructor (Redis), exposed through a Proxy singleton |
| Realtime | `WebSocketManager` → `SubscriptionManager`, `PublishManager`, `LifecycleHandler`, `PendingSubscriptionsManager`, `BacklogManager`, `RateLimiter` | classes | WS auth, subscribe, publish, backlog | constructor ✔ |
| SSE | `AssistantSseOrchestrator` + `SseWriter`, `SseStateMachine`, `OwnershipValidator`, `PollingStrategy`, `ResultWaiter`, `AssistantContextBuilder` | classes | Assistant stream | constructor ✔ (still uses `getExistingRedisClient()` inside; 882 lines) |
| LLM | `LLMProvider` interface → `OpenAiProvider` (586 lines), `AnthropicProvider` (stub that throws) | interface + classes | completeJSON / complete / stream | factory with module cache |
| LLM config | `llm-resolver`, `session-model-budget`, `cost-calculator` | functions | Model per purpose, budget, cost | env at import |
| Assistant | `generateAssistantMessage`, `assistant-integration`, `assistant-publisher`, `prompt-builder`, `validation-rules`, `fallback-messages` | functions + module Map | AI text | none |
| Enrichment | `ProviderDeepLinkResolver`, `BraveSearchClient/Adapter`, `GoogleCSEClient`, `ProviderWorker`, `ProviderJobQueue`, provider strategies | classes | Order-link lookup | constructor ✔, but wired by module factories |
| Cache | `GoogleCacheService`, `cache-manager` | class + module | L0/L1/L2 Google cache | init as an import side effect |
| Sessions | `RedisSessionStore`, `session-cookie.service` | class + functions | Session cookie, store | constructor ✔ |

## SOLID scorecard

| Principle | Verdict | Evidence |
|---|---|---|
| **S** single responsibility | Mixed | Good: route2 orchestrator split into `orchestrator.*.ts`; WS and SSE decomposed. Bad: `assistant-sse.orchestrator.ts` (882), `openai.provider.ts` (586, 3 near-duplicate call paths), `text-search.handler.ts` (675), `websocket-manager.ts` (564), `config/env.ts` (parse + validate + log), `server.ts`. `assistant-integration` mixes transport choice, generation, timeout policy and error classification. |
| **O** open/closed | Weak | Adding a route means editing the dispatcher, Google stage, zod schemas, static JSON schemas and guards. Search engine choice is a hard if/else (Brave vs CSE), with no `SearchEngine` interface. |
| **L** Liskov | Broken in one place | `AnthropicProvider` implements `LLMProvider` but throws on every method. `LLM_PROVIDER=anthropic` turns every search into a 500. |
| **I** interface segregation | OK | `ISearchJobStore` and `LLMProvider` are reasonably small. `Route2Context` is a catch-all bag (`sessionService: any`, ad-hoc fields like `isGenericQuery` set via `as any`). |
| **D** dependency inversion | Weak | No composition root. Service locators everywhere: `wsManager` imported from `server.ts` (import cycle through controller → route2 → worker), `getExistingRedisClient()`, `getConfig()` at module load (not memoised, logs twice per call), `getProviderJobQueue()`, `getMetricsCollector()`. About 130 `process.env` names read ad hoc, with no zod env schema. |

## Duplication hot spots
- The LLM call + retry + token-usage block is copied in gate2 and the 3 mappers, each with a different timeout/model/backoff.
- Every LLM output schema exists twice (zod + hand-written JSON schema). They have already drifted, which causes the LANDMARK bug.
- base_filters and post_constraints both extract open-state and price, with different regexes and opposite priority rules.
- Geocoding is implemented twice. The Israel bounding box is defined twice. The client-IP helper exists 3×. JWT verify exists 3×. Cookie write exists 3× with different `Secure` logic.
- Assistant context/output types are defined 4× with drift.

## Dead code (safe-delete candidates, verify first)
- route2: `google-maps.stage.new.ts`, `shared-filters.tighten.ts`, `utils/location-resolver.ts`, price extractor/filter/consistency/range-mapper, `Intent2*` types, `computeResultScore`, `concurrency-manager.ts`, `google-cse.adapter.ts`, `wolt/*` matcher/verifier/canonicalizer/stubs, `tenbis/*`, `mishloha-verifier`, `provider-verifier-utils.ts` (665), `shadow-compare.ts` usage, empty `narrator/`.
- platform: `search-async/`, `lib/concurrency/*`, `lib/readiness/`, `lib/metrics/performance-metrics.ts`, `lib/reliability/retry-policy.ts`, `lib/config/config-validator.ts`, `lib/auth/jwt-verifier.ts`, `middleware/auth-session.middleware.ts`, `search.idempotency-key.generator.ts`, empty `domain/ realtime/ schemas/`, `src/controllers.zip`, ~10 `.md` summary files inside source folders.

## Direction for v2 (`server/src/graph/`)
1. One composition root that builds Redis, config (zod-validated env), LLM provider, Google client, cache, publisher and job store, then injects them.
2. One `StructuredLlmCall` helper: zod is the single source of truth (derive the JSON schema with `zod-to-json-schema`), with timeout + AbortSignal + typed errors + budget in one place.
3. A `ResultPublisher` interface (WS / SSE / Redis pub-sub) instead of importing `wsManager`.
4. Graph nodes = the current stages; `Route2Context` becomes typed graph state.
