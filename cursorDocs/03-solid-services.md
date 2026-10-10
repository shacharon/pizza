# 03 — Services and SOLID review

Scope: the backend, with most of the weight on route2. Paths are relative to `server/src/`. The project rules (`importnent.mdc`, `CLAUDE.md`) ask for SOLID/OOP with a composition root and constructor injection. This file measures the code against that.

## 1. Service inventory

### 1.1 Edge and application services
| Unit | Kind | Responsibility | Depends on (how) |
|---|---|---|---|
| `controllers/search/search.controller.ts` | Router (functions) | Validate, auth, build `Route2Context`, sync or async | `createLLMProvider()` (call), `searchJobStore` (singleton), `wsManager` (imported from `server.ts`), `searchRoute2` (function) |
| `search.async-execution.ts` | Function | Background run, status and WS terminal events | `searchJobStore`, `publishSearchEvent` (singleton publisher), `searchRoute2` |
| `search.security.ts`, `search.validation.ts` | Functions | IDOR check, zod validation | `searchJobStore` |
| `controllers/stream/assistant-sse/*` | **Classes** (`SseWriter`, `SseStateMachine`, `ResultWaiter`, `PollingStrategy`, `OwnershipValidator`, `AssistantContextBuilder`, `AssistantSseOrchestrator`) | SSE narration | Mostly constructor-based. This is the best-structured controller area. |
| `controllers/auth/*` | Functions | Token, bootstrap, session, ws-ticket | `getConfig()` at import time |
| `controllers/photos`, `restaurants`, `analytics` | Functions | Photo proxy, details, event ring buffer | Direct `fetch` and module state |
| `services/restaurant-details/place-details.service.ts` | Function module | Google place details | Google cache |
| `services/feedback/send-feedback-email.ts` | Function | SES mail | Hard-coded config |

### 1.2 Route2 pipeline units
| Unit | Kind | Responsibility |
|---|---|---|
| `route2.orchestrator.ts` | **One large function** | Coordinates every stage and guard |
| `orchestrator.{guards,nearme,early-context,filters,response,error,parallel-tasks,helpers,search-terminal}.ts` | Function modules | Extracted pieces of the orchestrator (SRP by file) |
| `stages/gate2`, `intent`, `route-llm/*`, `post-constraints`, `google-maps/*` | Function modules | One stage each |
| `shared/base-filters-llm.ts`, `filters-resolver.ts`, `price-*` | Function modules | Filter extraction and resolution |
| `post-filters/*` | Pure functions | Deterministic filtering |
| `ranking/*` | Functions plus `ScoreNormalizer`, `DistanceCalculator` classes | Weights, scoring |
| `assistant/*` | Function modules (`assistant-llm.service.ts` is a function module despite its name) | Narration |
| `enrichment/provider/*` | Function modules plus `ProviderWorker` and `ProviderJobQueue` classes | Deep-link discovery |
| `enrichment/{brave,google-cse}-*` | Clients (`BraveSearchClient`, `GoogleCSEClient`) and adapters | Web search |

### 1.3 Infrastructure
| Unit | Kind |
|---|---|
| `llm/` `LLMProvider` interface, `OpenAiProvider`, `AnthropicProvider` (stub), `createLLMProvider` factory | Interface plus implementations |
| `services/search/job-store/` `ISearchJobStore`, `RedisSearchJobStore`, `InMemorySearchJobStore`, lazy `Proxy` singleton | Interface plus 2 implementations |
| `infra/state/` `IRequestStateStore`, `InMemoryRequestStore` | Interface plus implementation |
| `infra/websocket/*` | Classes (`WebSocketManager` facade over `SubscriptionManager`, `PendingSubscriptionsManager`, `BacklogManager`, `PublishManager`, `RateLimiter`, `LifecycleHandler`) |
| `lib/cache/googleCacheService.ts` | Class |
| `lib/session/redis-session.store.ts` | Class |
| `lib/redis/redis-client.ts` | Function and module singleton |
| `lib/llm/session-model-budget.ts` | Functions and module state |

## 2. SOLID scorecard

| Principle | Grade | Good | Bad |
|---|---|---|---|
| **S** Single responsibility | **B-** | The orchestrator was split into `orchestrator.*.ts` modules. Stages are small and focused. WS manager is split into 6 collaborators. Post-filters and ranking are pure. | `searchRoute2Internal` still knows every step: logging, audit, guards, region, anchor rules, early summary, enrichment and the place-details plan. Controllers mix HTTP, job creation and WS activation. `text-search.handler.ts` and `assistant-sse.orchestrator.ts` are very large. |
| **O** Open/closed | **B** | `executeRouteLLM` and `executeGoogleMapsStage` use exhaustive `switch` with `never` checks, so adding a route breaks compilation until it is handled. Provider strategies are separate files. Constraints registry. | Adding a provider means touching `provider.contracts`, `provider-strategies/index.ts` (a `switch`), a wrapper file, and a feature flag. Adding a stage means editing the orchestrator body. |
| **L** Liskov | **A-** | `ISearchJobStore` Redis and in-memory behave the same. `LLMProvider` OpenAI and the Anthropic stub share a type. | `AnthropicProvider` implements the interface but **throws on every method** (`llm/anthropic.provider.ts:9,17,25`). `createLLMProvider()` returns it whenever `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` is set (`llm/factory.ts`), so that config turns every search into a failure. |
| **I** Interface segregation | **C+** | Narrow ports exist (`SearchAdapter`, `ProviderVerifier`, `SelectUrlFn`). | `Route2Context` is a fat grab-bag every stage receives, and most stages use 3–4 fields. `LLMProvider` mixes JSON, text and streaming. `search.types.ts` still declares V1-era interfaces (`IIntentService`, `IGeoResolverService`, …) that route2 does not implement. |
| **D** Dependency inversion | **D+** | The LLM is injected through `ctx.llmProvider`. `SearchRoute2Deps` is a seam for the WS manager. The WS manager takes its stores in the constructor. | Orchestrator, controller, worker and the WS publishers import the concrete `wsManager` from `server.ts`. `searchJobStore`, the metrics collector, the Google cache, the Redis client and `logger` are all module singletons. Stages import `resolveLLM` and the config directly. There is **no composition root**. |

OOP score: most of route2 is function modules plus a context bag. That is workable, but it means dependencies are hidden. The WS and SSE areas show the target style, with small classes that take their collaborators in the constructor.

## 3. Concrete smells (with locations)

1. **Service locator via context.** `ctx.llmProvider` and `(ctx as any).isGenericQuery` hide inputs and outputs. Stages' real dependencies cannot be read from their signatures.
2. **Circular import and singleton WS.** `server.ts` → `app.ts` → routes → controller → `server.ts`. Five files import `wsManager` from `server.ts`: the search controller, the orchestrator, the provider worker, and the two WS publishers.
3. **Hard-coded policy inside stages:** timeouts (4500 ms), model selection and retry loops appear to be repeated per stage instead of shared. `lib/reliability/retry-handler.ts` exists, but gate2 and the mappers add their own one-shot retry on top (per `documentation/04-backend.md`; I did not re-read every mapper).
4. **Duplicate implementations:** `getClientIp` (2), geocoding (2), `ASSISTANT_PROMPT_VERSION` (2).
5. **Static schemas next to zod schemas** (two sources of truth for every LLM contract).
6. **Mixed return conventions:** stages return a result with an optional `error` (gate2), throw (landmark mapper, Google), or fall back silently (intent, filters). The orchestrator must know which is which.
7. **Name vs reality:** `assistant-llm.service.ts` and `provider-enrichment.service.ts` are function modules, not services. `orchestrator.*` files are helpers, not orchestrators.

## 4. Target design (incremental, no rewrite)

The rules say to respect legacy code and avoid sweeping refactors. This is a path that can be done in small steps, and each step can be tested separately.

### 4.1 Ports (interfaces) at the boundaries
```ts
interface SearchEventPublisher { publish(channel, requestId, sessionId, event): void }   // wraps WebSocketManager
interface JobStore            { /* ISearchJobStore, exists */ }
interface PlacesClient        { search(mapping: RouteLLMMapping, ctx): Promise<GoogleMapsResult> }
interface LlmGateway          { json<T>(purpose, messages, schema, opts): Promise<T> }   // wraps resolveLLM + budget
interface AssistantPort       { narrate(context, ctx): Promise<void> }
interface ProviderLinkService { enrich(provider, results, ctx): Promise<void> }
```

### 4.2 Stages as objects with one shape
```ts
interface PipelineStage<I, O> { readonly name: string; run(input: I, ctx: StageContext): Promise<O> }
class Gate2Stage      implements PipelineStage<GateInput, Gate2Result>   { constructor(llm: LlmGateway) {} }
class IntentStage     implements PipelineStage<IntentInput, IntentResult> { constructor(llm: LlmGateway) {} }
class RouteMapper     implements ...  // strategy per route, registered in a Map<MappingRoute, RouteMapperStrategy>
class GoogleMapsStage implements ...  // strategy per providerMethod
```
- The orchestrator becomes a `SearchPipeline` class that takes the stages and ports in its constructor and only sequences them. Guards become `Guard` objects returning `Continue | Clarify | Stop`, a discriminated union instead of "response or null".
- `Route2Context` is split into `RequestIdentity` (immutable), `RequestInputs` and a typed `PipelineState` that each stage extends.

### 4.3 Composition root
One `src/compositionRoot.ts` creates the Redis client, `LLMProvider`, budget, job store, WS manager, Google cache and stages, then passes them to `createApp(deps)`. Controllers become factories (`createSearchRouter({ jobStore, pipeline, events })`). `server.ts` imports nothing back from controllers, which removes the circular import and allows tests without booting the server.

### 4.4 Order of work (smallest first)
1. Add `SearchEventPublisher` and pass it through `SearchRoute2Deps` (already half there). Update the controller and the worker to use it, and remove `wsManager` imports from non-boot code.
2. Replace `any` on the context with a typed `isGenericQuery` and `sessionService` removal.
3. Extract the "TEXTSEARCH anchor" block into a guard function that returns a typed decision.
4. Unify retry and timeout in one helper that every LLM stage calls.
5. Introduce `PipelineStage` for Gate2 and Intent first (the simplest stages), then the rest.
6. Remove `AnthropicProvider` (or implement it) and `search.types.ts` leftovers.

Items 1–4 are bug-fix-sized and fit the "route2: bug fixes only" rule. Items 5–6 are better placed in the graph engine from the start rather than retrofitted into route2.
