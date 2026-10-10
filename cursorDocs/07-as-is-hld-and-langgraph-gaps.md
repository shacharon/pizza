# 07 — As-is architecture and LangChain/LangGraph migration gaps

Analysis only. No code was changed and nothing was installed. Evidence is cited as `file: function`, paths relative to `server/src/`. The only command that ran was the read-only spec `schemas.test.ts`. I did not run the rest of the test suite. Items I did not verify myself are marked *(claudeDocs)*.

## 1. Active vs legacy

| Path | Status | Evidence |
|---|---|---|
| `POST /api/v1/search` → `searchRoute2` | **Active, only engine** | `controllers/search/search.controller.ts: router.post('/')`, `services/search/route2/route2.orchestrator.ts: searchRoute2` |
| `services/search/route2/**` | Active (labelled "legacy" by `CLAUDE.md`, but nothing replaces it) | |
| `server/src/graph/` (LangGraph v2) | **Does not exist** on this branch | `Test-Path server/src/graph` = False; no `@langchain/langgraph` in `server/package.json` |
| `langchain`, `@langchain/openai` | Installed, **never imported** | `package.json`; `src/llm/langchain/` is empty |
| `AnthropicProvider` | Placeholder, throws | `llm/anthropic.provider.ts` (lines 9, 17, 25); reachable through `llm/factory.ts: createLLMProvider` |
| `route2/stages/google-maps.stage.new.ts`, `shared-filters.tighten.ts`, `enrichment/wolt|tenbis|mishloha/*` matchers, `provider-verifier-utils.ts`, `search-async/` | Dead or test-only *(documentation/04-backend.md and claudeDocs)* | |
| `/api` legacy mount | Live, past its sunset date | `app.ts` |

## 2. Is this an "agent"? No loops, no tools

| Question | Answer | Evidence |
|---|---|---|
| Agent loop (LLM decides next action) | **None.** The control flow is a fixed workflow written in code. | `route2.orchestrator.ts: searchRoute2Internal` is straight-line `await`s with early returns |
| Tool calling | **None.** No `tools`, `tool_calls` or function calling anywhere. LLM calls only use Structured Outputs. | `llm/openai.provider.ts: completeJSON` (`response_format: json_schema, strict`); grep for `bindTools`/`tool_call` has no hits |
| Planner/executor | Weak form: the route-LLM mapper "plans" the Google call. | `stages/route-llm/route-llm.dispatcher.ts: executeRouteLLM` |
| Loops that exist | Pagination and radius tiers, SSE polling, provider retries. None are LLM-driven. | `google-maps/text-search.handler.ts` (`while (nextPageToken …)`, `while (filteredResults.length < MIN_RESULTS …)`), `nearby-search.handler.ts`, `assistant-sse/result-waiter.ts` (`while (Date.now() < pollDeadline)`), `provider-worker.ts` |
| Reflection / self-correction | None. | |
| Human-in-the-loop | A CLARIFY ends the run. The user sends a new query. **It does not resume the same search.** *(claudeDocs B14)* | `orchestrator.guards.ts`, `publishClarifyAndReturn` |

**Consequence for migration:** this is a *workflow*, not an agent. A LangGraph port is a graph of fixed nodes with conditional edges. It needs no agent loop to be equivalent.

## 3. As-is HLD

```mermaid
flowchart TB
  subgraph Client
    FE[Angular 19]
  end
  subgraph API[Express 5 - one process]
    MW[middleware: rate limit, auth session/JWT, auto-refresh cookie, requestContext]
    SC[search.controller<br/>validate, ctx, job, 202]
    AE[search.async-execution<br/>executeBackgroundSearch]
    subgraph R2[route2 - searchRoute2 w/ 45s withTimeout]
      G2[gate2.stage]-->IN[intent.stage]-->GU[guards + nearme]-->RL[route-llm dispatcher<br/>3 mappers]
      RL-->FAN{fan-out}
      FAN-->BF[base-filters-llm]
      FAN-->PC[post-constraints.stage]
      FAN-->ES[early SUMMARY LLM]
      FAN-->GM[google-maps.stage<br/>text / nearby / landmark]
      BF & PC & GM-->BAR[barrier]
      BAR-->PF[post-filters]-->RK[ranking]-->EN[provider enrichment<br/>cache + enqueue]-->RS[buildFinalResponse]
    end
    WSM[WebSocketManager<br/>in-process]
    SSE[assistant-sse]
    JS[(ISearchJobStore<br/>Redis | memory)]
    Q[ProviderJobQueue + ProviderWorker<br/>in-process]
  end
  FE-- REST --> MW --> SC
  SC-- async --> AE --> R2
  SC-- sync --> R2
  R2-- publish --> WSM --> FE
  AE --> JS
  SSE -- polls --> JS
  R2 --> OAI[(OpenAI via LLMProvider)]
  GM --> GP[(Google Places + cache L0/L1/L2 Redis)]
  EN --> Q --> BR[(Brave / Google CSE)] --> WSM
```

## 4. Runtime flow with exact functions

| # | Step | Function (file) | State read / written | Guardrail / failure behaviour | Exit |
|---|---|---|---|---|---|
| 1 | Validate and authenticate | `validateSearchRequest` (`search.validation.ts`), `getAuthenticatedSession` (`search.security.ts`) | builds `Route2Context` | 400 on invalid body; 500 `CONFIG_ERROR` if `!ROUTE2_ENABLED \|\| !llm`; 401 in prod if async has no session | |
| 2 | Job creation (async) | `searchJobStore.createJob`, `wsManager.activatePendingSubscriptions` | job in Redis/memory | Failure is non-fatal (logged), search continues | 202 |
| 3 | Run | `executeBackgroundSearch` (`search.async-execution.ts`) | job status 10 → 50 | A 30 s `AbortController` is put on `ctx.signal`, which nothing reads | |
| 4 | Timeout wrapper | `searchRoute2` → `withTimeout(…, PIPELINE_TIMEOUT_MS)` (`route2.config.ts`) | `ctx.abortSignal` set in `searchRoute2Internal` | 45 s. `abort('route2_timeout')` is not passed to LLM calls | `TimeoutError` |
| 5 | Pre-stage | `sanitizeQuery`, `initSearchAudit`, `detectQueryLanguage`, `resolveUserRegionCode` | `ctx.query`, `queryLanguage`, `userRegionCode`, `searchAudit` | Region failure is swallowed (`OTHER`) | |
| 6 | Gate | `executeGate2Stage` (`stages/gate2.stage.ts`) | `ctx.timings.gate2Ms` | Deterministic pre-check `getGate2QueryValidityPreDecision`; one retry on timeout (100–200 ms jitter); failure → error result → orchestrator **throws** | STOP / CLARIFY return |
| 7 | Gate guards | `handleGateStop`, `handleGateClarify` (`orchestrator.guards.ts`) | none | Publish terminal events only if `!shouldAbort(ctx)` | return |
| 8 | Intent | `executeIntentStage` (`stages/intent/intent.stage.ts`) | audit fields | Any failure → `TEXTSEARCH` fallback; NEARBY without GPS → TEXTSEARCH | |
| 9 | Location and near-me | `handleEarlyTextSearchLocationGuard`, `checkGenericFoodQuery`, `handleNearMeLocationCheck`, `applyNearMeRouteOverride` | `ctx.isGenericQuery` (via `as any`) | Near-me without GPS → CLARIFY | return |
| 10 | Early context | `deriveEarlyRoutingContext` (`orchestrator.early-context.ts`) | none | Only warns if it later differs from final filters | |
| 11 | Map to provider call | `executeRouteLLM` → `executeTextSearchMapper` / `executeNearbyMapper` / `executeLandmarkMapper` | none | Retry once on timeout only. Text: deterministic fallback. Nearby: default radius. **Landmark: throws** | |
| 12 | Post-mapping guards | `handleNearbyLocationGuard`, anchor block in the orchestrator, `handleTextSearchMissingLocationGuard`, `buildDeterministicMissingLocationClarify` | `ctx.missingLocationQuestion` | CLARIFY or continue | return |
| 13 | Fan-out | `fireParallelTasks` (`orchestrator.parallel-tasks.ts`), early summary via `generateAndPublishAssistantPromise`, `executeGoogleMapsStage` | none | Base filters and post-constraints fall back to defaults. Early summary swallowed. **Google throws** | |
| 14 | Barrier | `resolveAndStoreFilters` → `resolveFilters` (`shared/filters-resolver.ts`) | `ctx.sharedFilters.{preGoogle, final}` | | |
| 15 | Post-filter | `applyPostFiltersToResults` → `applyPostFilters` (`post-filters/post-results.filter.ts`) | none | Deterministic. `queryAsksNotKosher` override | |
| 16 | Rank | `resolveRankingWeights`, `applyBaselineRanking` (`ranking/*`) | assigns `score`, `rank` | Never removes results | |
| 17 | Enrich | `enrichWith{Wolt,Tenbis,Mishloha}Links` → `enrichWithProviderLinks` (`enrichment/provider/provider-enrichment.service.ts`) | Redis `provider:*`, lock `SET NX`, in-process queue | Cache-first. Redis errors are non-fatal. Awaited before the response | |
| 18 | Place details policy | `decidePlaceDetailsEnrichment` (`enrichment/place-details-policy.ts`) | log only | No API call is made | |
| 19 | Respond | `buildFinalResponse` (`orchestrator.response.ts`) | WS publish | Assistant text: SSE flag → skip; non-SATURATED → deterministic text; SATURATED → **awaited** `generateAndPublishMessageOnly` | `SearchResponse` |
| 20 | Error path | `handlePipelineError` (`orchestrator.error.ts`), `classifyPipelineError` (`pipeline-error-kinds.ts`) | none | Publishes `SEARCH_FAILED` then **rethrows** | |
| 21 | Job terminal | `executeBackgroundSearch` result block | `setResult`, `setStatus` | Maps to DONE_SUCCESS / CLARIFY / STOPPED / FAILED. Non-fatal Redis writes | WS `ready`/`clarify`/`error` |
| 22 | Background | `ProviderWorker` (`enrichment/provider/provider-worker.ts`) | Redis cache, WS `RESULT_PATCH` | Brave → CSE, retries, cache FOUND 14 d / NOT_FOUND 7 d | |

## 5. State

| State | Where | Lifetime | Problem for a graph |
|---|---|---|---|
| Pipeline state | `Route2Context` (`types.ts`) mutated in place by stages (`ctx.timings`, `ctx.sharedFilters`, `ctx.userRegionCode`, `ctx.missingLocationQuestion`, `(ctx as any).isGenericQuery`) | One request, memory only | Implicit, untyped writes. No reducers. Not serializable (holds `llmProvider`, `abortSignal`). |
| Stage outputs | Local variables in `searchRoute2Internal` (`gateResult`, `intentDecision`, `mapping`, `googleResult`, `postConstraints`, `finalResults`) | One call stack | Not persisted, so **no resume after a crash or a clarify**. |
| Job | `ISearchJobStore` (`job-store/*`): status, progress, result, owner | 24 h Redis / 10 min memory | Stores only the final result and status, not intermediate state. |
| Event replay | `InMemoryRequestStore`, `BacklogManager` | Minutes, per process | Not a checkpoint. |
| LLM budget | `lib/llm/session-model-budget.ts` | 48 h Redis key | Counted inside the provider call path. |
| Conversation memory | **None.** Each search is independent. | | |

## 6. LLM layer, guardrails, retries

| Concern | As-is | Evidence |
|---|---|---|
| Provider abstraction | Own `LLMProvider` interface, not LangChain | `llm/types.ts: LLMProvider`, `llm/openai.provider.ts: OpenAiProvider` |
| Structured output | OpenAI strict JSON schema, then `schema.parse()`. Two schemas per contract (zod + hand-written JSON). | `completeJSON`, `static-schemas.ts`, `GATE2_JSON_SCHEMA`. **Drift is real: B1.** |
| Prompt versions | Constants per stage | `GATE2_PROMPT_VERSION = 'gate2_v9'`, `intent_v4`, `post_constraints_v2` |
| Prompt-injection mitigation | Query framed as data and truncated | `lib/llm: frameSearchAsData`, `truncateWordsForLlm` (used in `gate2.stage.ts`) |
| Retry | Provider: `retryWithBackoff` on 429/5xx only; abort and parse errors fail fast (`isRetryable`). Stages add their own one-shot retry on timeout (gate2, mappers). | `openai.provider.ts`, `gate2.stage.ts`, `landmark.mapper.ts` |
| Timeouts | Per purpose via `resolveLLM`; some hard-coded 4500 ms | `lib/llm/llm-resolver.ts: resolveLLM` |
| Cancellation | Each LLM call makes its own `AbortController` from the timeout. **`ctx.abortSignal` is not passed**, since the `completeJSON` options type has no `signal`. | `llm/types.ts`, `openai.provider.ts` (`new AbortController()`) |
| Budget | 40 model calls per session per day, `ModelBudgetExceededError` → HTTP 429 | `session-model-budget.ts`, `search.controller.ts` catch |
| Output guardrails (assistant) | `enforceInvariants`, format validation, deterministic multilingual fallbacks | `assistant/validation-rules.ts`, `fallback-messages.ts` |
| Rule-based overrides of the LLM | Profanity regex, near-me substring list, list-shape regex | `gate2-query-validity.ts`, `utils/near-me-detector.ts`, `post-filters/list-shape.ts` *(claudeDocs B9 for the false positives)* |

## 7. Domain services and integrations

| Area | Units | Integration |
|---|---|---|
| Understanding | `gate2.stage`, `intent.stage`, `route-llm/*`, `base-filters-llm`, `post-constraints.stage` | OpenAI |
| Retrieval | `google-maps/{text-search,nearby-search,landmark-plan}.handler`, `cache-manager` → `GoogleCacheService`, `geocoding-service` | Google Places (New), Geocoding, Redis |
| Filtering | `filters-resolver`, `post-results.filter`, `dietary-hints`, `list-shape`, `constraints-registry` | none (pure) |
| Ranking | `ranking-weight-resolver`, `ranking-apply`, `score-normalizer`, `distance-calculator` | none (pure) |
| Verification | Provider links: `provider-strategies/*` (host/path allowlist, name match), `ProviderDeepLinkResolver`, `ProviderWorker`. Per-provider `*.verifier.ts` in `provider-strategies` are effectively no-ops *(claudeDocs)* | Brave, Google CSE, Redis |
| Post-processing | `buildFinalResponse`, `sanitizePhotoUrls` (controller), photo proxy | Google Photos |
| Narration | `assistant/*`, `assistant-sse/*` | OpenAI, WS, SSE |

## 8. Tests

| Layer | What exists | Evidence |
|---|---|---|
| Unit, pure logic | Ranking, post-filters, gate validity, field mask, geocoding, result mapper, assistant validation, enrichment matchers | colocated `*.test.ts` under `route2/` (about 65 files) |
| Orchestrator-level | `route2.orchestrator.test.ts`, `orchestrator-open-now.test.ts`, `google-parallel-optimization.test.ts`, `assistant-non-blocking.test.ts`, `__tests__/clarify-short-circuit.test.ts`, `textsearch-location-guard.test.ts`, `search-audit.test.ts`; `tests/route2-global-timeout.test.ts` | `searchRoute2` has a `deps.wsManager` seam for these |
| Schema contract | `stages/route-llm/schemas.test.ts` | **Currently fails** on `textSearchWithBias` (ran it: 1 test fails) |
| Missing | Landmark mapper and nearby mapper flows, intent stage with a fake LLM, an end-to-end test with mocked OpenAI and Google, async-execution terminal-status mapping, the WS event sequence | no matching files |
| Baseline | `npm test` points at removed modules; no CI | `package.json: scripts.test`, no `.github/workflows` |

## 9. Observability and failure handling

| Mechanism | Evidence |
|---|---|
| One `search_audit` line per request with gate, intent, region, outcome kind (`results`, `clarify`, `not_food`, `no_results`, `error`, `timeout`) | `search-audit.ts: logSearchAudit`, `classifySearchOutcome` |
| Stage timing | `lib/telemetry/stage-timer.ts: startStage, endStage`, `ctx.timings` (only some stages fill it) |
| LLM call trace and cost | `lib/telemetry/providerTrace.ts: traceProviderCall`, `llm/cost-calculator.ts`, optional DynamoDB audit |
| Error taxonomy | `pipeline-error-kinds.ts: classifyPipelineError`, `PipelineErrorKind` |
| Request correlation | `requestId`, `traceId` through `requestContextMiddleware` and ctx |
| Enrichment metrics | `enrichment/metrics-collector.ts` (finalized before the jobs actually run *(claudeDocs C11)*) |
| Gaps | No metrics endpoint or counters (only logs). Sync search 500 is not logged (`search.controller.ts` catch). No tracing spans. Fake progress event (`route_llm 50%` is published before the pipeline runs) *(claudeDocs)*. Duplicate terminal events (`orchestrator.search-terminal.ts` + `search.async-execution.ts`). |

## 10. Evidence-backed gaps for a LangChain/LangGraph migration

Each gap is a fact about today's code that a graph port will have to deal with. These are not proposals.

| # | Gap | Evidence | Why it matters for a graph |
|---|---|---|---|
| G1 | **No typed state.** Mutable `Route2Context` plus untyped writes and `as any` casts. | `types.ts: Route2Context`; `(ctx as any).isGenericQuery`, `(mapping as any).bias`, `earlyFiltersForRouting as any` in `route2.orchestrator.ts` | LangGraph state needs a declared schema and reducers. The parallel branches here write different fields, so there is nothing to reduce today. |
| G2 | **Control flow is hidden in early `return`s** (about 10 exits, each also publishing a terminal event). | `route2.orchestrator.ts: searchRoute2Internal`, `publishClarifyAndReturn`, `handleGateStop` | Those exits are the conditional edges. They currently mix routing decisions with side effects (WS publish, assistant LLM call), which a graph keeps in separate nodes. |
| G3 | **Clarify is not resumable.** It ends the run and creates a new search. | `orchestrator.guards.ts`; `search.async-execution.ts` terminal mapping; claudeDocs B14 | `interrupt` + a checkpointer is the natural fit, but there is no thread or checkpoint concept, and the job store holds only the final result. |
| G4 | **No checkpoint-capable store.** Intermediate results live on the call stack. | `ISearchJobStore` methods (`createJob`, `setStatus`, `setResult`, `setError`) | A checkpointer needs serializable state. The ctx holds a provider instance and an `AbortSignal`. |
| G5 | **Two sources of truth per LLM schema**, already drifted (B1). | `schemas.ts:63` vs `static-schemas.ts:63`; zod v4 breaks `zod-to-json-schema` (comment in `gate2.stage.ts`) | LangChain `withStructuredOutput` expects one zod schema. The zod-v4 incompatibility must be resolved first. |
| G6 | **Custom provider, not LangChain.** `langchain` and `@langchain/openai` are dependencies but unused. | `llm/openai.provider.ts`, `package.json` | A port means either an adapter that makes `LLMProvider` a LangChain `Runnable`, or replacing it. The provider carries budget, tracing and cost, which would have to move. |
| G7 | **Retries and budget live in the provider; stages add their own retry.** | `openai.provider.ts: retryWithBackoff`; `gate2.stage.ts` and `*.mapper.ts` timeout retries | LangGraph has per-node retry policies. Two retry layers would multiply attempts, and a retried call currently does not count against the budget *(documentation/04-backend.md)*. |
| G8 | **No cancellation propagation into LLM calls.** | `llm/types.ts: LLMProvider.completeJSON` options lack `signal`; `openai.provider.ts` creates its own controller | Graph run cancellation (`signal`) would not stop in-flight model calls. |
| G9 | **Parallel fan-out and barrier are hand-written** with swallowed failures and a manual `finally` drain. | `orchestrator.parallel-tasks.ts: fireParallelTasks, drainParallelPromises`; barrier order in the orchestrator | Maps to parallel edges and a join. The "fail soft to defaults" behaviour is per-branch and must be kept explicitly. Google failing is fatal while the two LLM branches are not. |
| G10 | **Side-effect publishing is inside the stages.** WS and assistant messages are sent from stages and guards, through the `wsManager` singleton. | `orchestrator.response.ts`, `orchestrator.search-terminal.ts`, `guards/shared/assistant-helper.ts`; `server.ts` import | Graph streaming (`stream` modes) would replace some of this, but the current WS contract (`SEARCH_RESULTS`, `RESULT_PATCH`, `assistant`, `ready`) would have to be mapped one to one. Duplicated terminal events (R3) make that mapping ambiguous. |
| G11 | **Results-before-words rule is broken** (awaited MESSAGE_ONLY, and an early summary that may arrive late). | `orchestrator.response.ts`, `route2.orchestrator.ts` | A graph needs these as non-blocking branches. Today the behaviour is only partly non-blocking. |
| G12 | **Background work is outside any run.** The provider queue and worker are in-process and publish `RESULT_PATCH` after the run is "done". | `provider-job-queue.instance.ts`, `provider-worker.ts` | Not representable inside one graph run. Needs a separate flow or a durable queue. Also blocks multi-instance scaling. |
| G13 | **Rule-based code overrides the LLM** in routing decisions. | `gate2-query-validity.ts`, `near-me-detector.ts`, `list-shape.ts`; `CLAUDE.md` says "LLM-first, no rule-based fast path" | A port must decide per rule whether it stays as a deterministic node. |
| G14 | **Inconsistent stage failure contracts**: result with `error` (gate2), throw (landmark, Google), silent fallback (intent, filters). | `gate2.stage.ts`, `landmark.mapper.ts`, `intent.stage.ts`, `orchestrator.parallel-tasks.ts` | Each needs an explicit error edge in a graph. |
| G15 | **No composition root.** Dependencies come from module singletons. | `server.ts: wsManager`, `searchJobStore` Proxy, `getMetricsCollector`, `createLLMProvider` cache | Nodes need injected dependencies to be testable. Today stages are exported functions that import their dependencies. |
| G16 | **Test seams are thin.** Only `deps.wsManager` is injectable. No fake LLM in stage tests for intent or the mappers. | `SearchRoute2Deps`; missing tests listed in §8 | Behaviour-preserving migration needs characterization tests first, and the baseline is red. |
| G17 | **Observability is log-only and keyed to the current stage names.** | `search-audit.ts`, `stage-timer.ts` | Node names, `search_audit` fields and `ctx.timings` would need to stay stable or dashboards break. |

## 11. What would be safe to keep as-is in a port (observation, not a proposal)

Pure, side-effect-free modules already have clean signatures and tests: `post-filters/*`, `ranking/*`, `shared/filters-resolver.ts`, `constraints/*`, `google-maps/*` (handlers and cache), `assistant/validation-rules.ts` and `fallback-messages.ts`, and the provider strategies. The risk is concentrated in the orchestrator, the guards, the assistant publishing and the async job and WS layer.
