# 07 — As-Is "agent" architecture (evidence-backed)

Scope: `server/src` on branch `refactor/phase-1-hygiene`, 2026-10-10. Read-only analysis; no code changed.
Paths are relative to `server/src/`, and `route2/` = `services/search/route2/`.

---

## 0. Verdict: it is a pipeline, not an agent

| Question | Answer | Evidence |
|---|---|---|
| Agent loop (LLM picks the next step)? | **None** | Grep for `bindTools\|AgentExecutor\|StateGraph\|Runnable\|tool_calls\|function_call\|tool_choice` over `src/` finds nothing |
| Tools / function calling? | **None** | Every LLM call is `completeJSON` (structured output), `complete` (text) or `completeStream` — `llm/openai.provider.ts:72,453,522` |
| LangChain / LangGraph used? | **No.** `langchain` + `@langchain/openai` are in `package.json`, but nothing imports them. `llm/langchain/` and `services/llm/` are empty. `graph/` does not exist | package.json, empty dirs |
| Agent feature flags? | Declared, never read: `CONVERSATION_ENGINE`, `FOOD_GRAPH_ENABLED`, `FEATURE_AGENT_LOOP` (`config/index.ts:59-63`), `SEARCH_PIPELINE_V2` (`config/search-pipeline-flags.ts`) | no importers |
| Loops that exist | Google page loop (`text-search.handler.ts:368`, `nearby-search.handler.ts:108`), radius widening (`text-search.handler.ts:406`), SSE job polling (`assistant-sse/result-waiter.ts:40 waitForResults`) | — |
| Branching | Hard-coded `if`s in `searchRoute2Internal` on the LLM's **classification output** (gate route, intent route) | `route2.orchestrator.ts:203-372` |

So the "LLM-first" part is **LLM-as-classifier/extractor inside a fixed DAG**. The model never chooses actions, tools or termination.

---

## 1. Runtime flow: API entry → final response (production = async)

The frontend always calls `POST /api/v1/search?mode=async` (`llm-angular/src/app/api/search.api.ts:37`). The server default is `sync` (`search.controller.ts`, `req.query.mode || 'sync'`).

```
[HTTP] app.ts createApp()
  rateLimit(global 300/min) → timeouts → helmet → compression → json(1mb)
  → requestContextMiddleware (traceId) → httpLoggingMiddleware → CORS
  → autoRefreshExpiredCookie (/api/v1 only) → routes/v1/index.ts createV1Router()
      router.use('/search', authSessionOrJwt, searchRateLimiter(30/min ip+session), searchRouter)

[CONTROLLER] controllers/search/search.controller.ts  router.post('/')
  1 requestId = `req-${Date.now()}-${Math.random()}`
  2 validateSearchRequest(req)            (search.validation.ts → searchRequestSchema, query 1-500 chars)
  3 createLLMProvider()                   (llm/factory.ts) ; ROUTE2_ENABLED (config/route2.flags.ts) else 500 CONFIG_ERROR
  4 getAuthenticatedSession(req), getClientIp(req)
  5 build Route2Context {requestId,startTime,llmProvider,userLocation,traceId,sessionId,clientIp}
  6 async: prod & no session → 401
           searchJobStore.createJob(...)  (job-store/index.ts Proxy → Redis|InMemory; errors swallowed)
           wsManager.activatePendingSubscriptions(requestId, session)
           res 202 {requestId, resultUrl, contractsVersion}
           void executeBackgroundSearch(...)

[BACKGROUND] controllers/search/search.async-execution.ts executeBackgroundSearch()
  setStatus RUNNING 10 → publishSearchEvent progress 'accepted'
  setStatus RUNNING 50 → publishSearchEvent progress 'route_llm'   (before any work runs)
  response = searchRoute2(queryData, {...ctx, signal})              (ctx.signal is never read)
  classify: results>0 → DONE_SUCCESS/ready ; source=gate_stop|failureReason=LOW_CONFIDENCE → DONE_STOPPED ;
            assist.type=clarify → DONE_CLARIFY ; else DONE_SUCCESS(0)
  setResult + setStatus ; publishSearchEvent ready|clarify|ready(stop)
  catch: ModelBudgetExceededError → MODEL_BUDGET_EXCEEDED | aborted → TIMEOUT | else SEARCH_FAILED (raw err.message)

[PIPELINE] route2/route2.orchestrator.ts searchRoute2() → withTimeout(45s, abortRef) → searchRoute2Internal()
  a  sanitizeQuery (lib/telemetry/query-sanitizer.ts), initSearchAudit (route2/search-audit.ts)
  b  detectQueryLanguage (utils/query-language-detector.ts)           deterministic
  c  resolveUserRegionCode (utils/region-resolver.ts)                  IL|OTHER, failure → 'OTHER'
  d  executeGate2Stage (stages/gate2.stage.ts)                         LLM #1  [+ regex pre-check gate2-query-validity.ts]
       gateResult.error → throw ; handleGateStop → GATE_STOP ; handleGateClarify → CLARIFY
  e  executeIntentStage (stages/intent/intent.stage.ts)                LLM #2
       handleEarlyTextSearchLocationGuard (always null) ; checkGenericFoodQuery
       handleNearMeLocationCheck (orchestrator.nearme.ts) → CLARIFY ; applyNearMeRouteOverride
  f  deriveEarlyRoutingContext (orchestrator.early-context.ts)        region/lang without waiting for filters
  g  executeRouteLLM (stages/route-llm/route-llm.dispatcher.ts)        LLM #3 (one of text/nearby/landmark mapper)
       handleNearbyLocationGuard → CLARIFY ; TEXTSEARCH anchor eval → maybe missingLocationQuestion
  h  fireParallelTasks (orchestrator.parallel-tasks.ts)               LLM #4 resolveBaseFiltersLLM, LLM #5 executePostConstraintsStage
     early SUMMARY: generateAndPublishAssistantPromise (assistant/assistant-integration.ts) LLM #6, 1.5s race, not awaited
     googlePromise = executeGoogleMapsStage (stages/google-maps.stage.ts)
  i  BARRIER: await baseFilters → resolveAndStoreFilters (orchestrator.filters.ts → shared/filters-resolver.ts)
              await google ; await postConstraints
  j  applyPostFiltersToResults → post-filters/post-results.filter.ts applyPostFilters
  k  resolveRankingWeights (ranking/ranking-weight-resolver.ts) → applyBaselineRanking (ranking/ranking-apply.ts)
     logRankingObservability (ranking/ranking-observability.ts)
  l  enrichWithWoltLinks / TenbisLinks / MishlohaLinks (enrichment/provider/*.ts → provider-enrichment.service.ts)
     → cache hit | PENDING + ProviderJobQueue → ProviderWorker → later WS RESULT_PATCH
  m  decidePlaceDetailsEnrichment (enrichment/place-details-policy.ts)  log only
  n  buildFinalResponse (orchestrator.response.ts)
       FEATURE_SSE_ASSISTANT=true → skip WS assistant ; else deterministic SUMMARY or LLM #7 MESSAGE_ONLY (awaited)
       WS search: status completed + SEARCH_RESULTS
  catch → handlePipelineError (orchestrator.error.ts) → classifyPipelineError → WS SEARCH_FAILED → rethrow
  finally → drainParallelPromises ; logSearchAudit (in searchRoute2)

[ASSISTANT via SSE] GET /api/v1/stream/assistant/:requestId (frontend useSseAssistant: true in all envs)
  controllers/stream/assistant-sse/assistant-sse.router.ts → AssistantSseOrchestrator
  meta → narration template → waitForResults (poll job store 400ms) → Redis lock → generateAssistantMessage
  (LLM #8) or streamAssistantMessage (CLARIFY/STOP, no validation) → done
```

---

## 2. LLM call inventory (all fixed steps, none agentic)

| # | File : function | Purpose | Mode | Schema | Retry (stage) | On failure |
|---|---|---|---|---|---|---|
| 1 | `stages/gate2.stage.ts` `executeGate2Stage` | gate | JSON | `Gate2LLMSchema` + `GATE2_JSON_SCHEMA` | 1× on timeout | error → orchestrator **throws** |
| 2 | `stages/intent/intent.stage.ts` `executeIntentStage` | intent | JSON | `IntentLLMSchema` / `INTENT_JSON_SCHEMA` | — | `createFallbackResult` → TEXTSEARCH |
| 3a | `route-llm/textsearch.mapper.ts` `executeTextSearchMapper` | routeMapper | JSON | `TextSearchLLMResponseSchema` | 1× | `buildDeterministicMapping` |
| 3b | `route-llm/nearby.mapper.ts` `executeNearbyMapper` | (default model) | JSON | `NearbyMappingSchema` | 1× | throws → pipeline fail |
| 3c | `route-llm/landmark.mapper.ts` `executeLandmarkMapper` | routeMapper | JSON | `LandmarkMappingSchema` (**drifted from JSON schema**) | 1× | throws → pipeline fail |
| 4 | `shared/base-filters-llm.ts` `resolveBaseFiltersLLM` | baseFilters | JSON | `PreGoogleBaseFiltersSchema` | — | defaults |
| 5 | `stages/post-constraints/post-constraints.stage.ts` `executePostConstraintsStage` | (default model) | JSON | `PostConstraintsSchema` | — | defaults |
| 6 | `assistant/assistant-llm.service.ts` `generateAssistantMessage` | assistant | JSON | `AssistantOutputSchema` | — | deterministic fallback (never throws) |
| 7 | same, `generateMessageOnlyText` | assistant | text | — | — | fallback |
| 8 | same, `streamAssistantMessage` | assistant | stream | — | — | none (SSE only) |
| — | `services/assistant/assistant-llm-rewriter.service.ts` `rewriteAssistantMessage` | hard-coded model | text | — | — | **dead** (only importer `infra/websocket/assistant-ws.publisher.ts` has no importers) |

Provider-level retry: `OpenAiProvider.completeJSON` runs `retryWithBackoff` on 429/5xx/transport errors, **in addition to** the stage-level timeout retry. Retries are nested and not coordinated.

LLM calls per successful search: 5 on the result path (1-2-3 sequential, 4-5 parallel), plus 1-2 assistant calls, plus 1 SSE assistant call.

---

## 3. Active vs legacy paths

| Status | Items |
|---|---|
| **Active** | async search path above; `route2/*` stages, guards, shared, ranking, assistant, enrichment provider path, `search-audit.ts`; `job-store/*`; `infra/websocket/*`; `controllers/stream/assistant-sse/*`; `lib/llm/*`; `llm/openai.provider.ts` |
| **Active but unused by the UI** | sync mode (`search.controller.ts`); legacy `/api` mount of the same router (`app.ts:258-273`, sunset date passed) |
| **Feature-flagged** | `FEATURE_SSE_ASSISTANT` (WS assistant on/off; the SSE endpoint is always mounted). `ENABLE_{WOLT,TENBIS,MISHLOHA}_ENRICHMENT` (`provider.contracts.ts:282 isProviderEnrichmentEnabled`). `ENABLE_REDIS_JOBSTORE`. `ENABLE_GOOGLE_CACHE` (`cache-manager.ts:64`). `ROUTE2_ENABLED`. `PLACE_DETAILS_ENRICHMENT_ENABLED` (decision only). `ASSISTANT_REFACTOR_SHADOW`. `ENABLE_PROVIDER_AUDIT`. `RANKING_DEBUG`. `LLM_PROVIDER` (`anthropic` = stub that throws) |
| **Unreachable** | debug stop (`orchestrator.helpers.ts:13 shouldDebugStop`; nothing sets `ctx.debug`, and request `debug` is not mapped); `handleEarlyTextSearchLocationGuard` / `handleTextSearchMissingLocationGuard` (always null); the orchestrator `!allowed` branch (`route2.orchestrator.ts:352-372`); `guards/nearby-location.guard.ts` NEARBY path (intent rewrites NEARBY without GPS first) |
| **Dead (no importer / test-only)** | `stages/google-maps.stage.new.ts`; `infra/websocket/assistant-ws.publisher.ts` + `services/assistant/*` rewriter; `search-async/`; `services/search/config/{performance,ranking,search,cache}.config.ts` (holds `INTENT_FAST_PATH`, so there is no live parsed-query cache); `services/search/utils/{language-detector,opening-hours-summary,query-composer}`; `types/search.schemas.ts`; config agent flags; more in `05-solid-services.md` |
| **Half-dead** | `InMemoryRequestStore` (`server.ts:49`) used for WS replay, but never written |

---

## 4. State

### 4.1 `Route2Context` (`route2/types.ts`): the de-facto graph state, mutable and untyped in places

| Field | Writer | Readers | Note |
|---|---|---|---|
| requestId, startTime, traceId, sessionId, clientIp, llmProvider, userLocation | controller | all | `llmProvider` is a dependency carried inside the state |
| abortSignal | `searchRoute2Internal:91` | `shouldAbort`, Google, enrichment | **not passed to LLM calls** |
| signal (not in type) | `executeBackgroundSearch` via cast | nobody | dead 30s timeout |
| query, queryLanguage | orchestrator 109/112 | assistant | |
| userRegionCode/Source | orchestrator 132-148 | early ctx, filters | |
| timings | orchestrator 156 (only `googleMapsMs`) | search-audit | plus stage-timer writes |
| sharedFilters | `orchestrator.filters.ts:38` | response, assistant | |
| missingLocationQuestion | orchestrator 323 | response | |
| searchAudit | `search-audit.ts initSearchAudit` | `logSearchAudit` | |
| isGenericQuery | **`as any`** in `guards/nearby-location.guard.ts:112` | `orchestrator.response.ts:138` | |
| debug, jobCreatedAt, queryRegionCode, regionCodeFinal, sessionService:any | never written | — | dead fields |

Intermediate stage outputs (`gateResult`, `intentDecision`, `mapping`, filters, Google results) are **local variables** in `searchRoute2Internal`. They are not in a state object, so they can't be checkpointed or resumed.

### 4.2 Persistent / shared state

| Store | Key / shape | TTL | Owner |
|---|---|---|---|
| Job | `search:job:{requestId}` → `SearchJob {status, progress, result, error, owner*, query (raw), traceId, queryDetectedLanguage}` | 24h | `job-store/redis-search-job.store.ts` |
| LLM budget | `llm-budget:{session\|nosession}:{day}` | 48h | `lib/llm/session-model-budget.ts` |
| Session | `session:{id}` | 7d sliding | `lib/session/redis-session.store.ts` |
| WS ticket | `ws_ticket:{id}` | 60s | ws-ticket controller / `auth-verifier.ts` |
| Rate limit | `{prefix}:{ip}[:session]` | 60s | `middleware/rate-limit.middleware.ts` |
| Assistant lock | `assistant:lock:{requestId}` | 30s | `assistant-sse.orchestrator.ts` |
| Google cache | `g:search:*`, `g:textsearch:*`, `g:place:*` | 900/300/120s | `lib/cache/googleCacheService.ts` |
| Provider links | `provider:{p}:{placeId}` (+ `:lock:` 60s) | 14d / 7d | `enrichment/provider/provider-worker.ts` |

There is **no conversation/thread state**. Clarify ends the job; the next user message is a brand-new search with no memory of the previous one (`clearContext` and `filters` in the request schema are accepted and ignored).

---

## 5. Guardrails

| Guardrail | File : function | Fail mode |
|---|---|---|
| Request schema (query 1-500, lat/lng, enums) | `search.validation.ts validateSearchRequest` | closed (400) |
| Prompt word cap (25 words) | `lib/llm/truncate-llm-words.ts truncateWordsForLlm` | silent truncate |
| Injection framing | same file, `frameSearchAsData` | advisory |
| Profanity / validity regex | `stages/gate2/gate2-query-validity.ts getGate2QueryValidityPreDecision`, `shouldOverrideFoodToClarify` | closed (STOP/CLARIFY, sometimes **without an LLM call**, which goes against LLM-first) |
| Output schema | `OpenAiProvider.completeJSON` (strict json_schema + zod parse) | closed per call → stage fallback |
| Assistant invariants | `assistant/validation-rules.ts enforceInvariants`, `validateAndEnforceCorrectness`; `cap-assistant-text.ts` | fallback text; a language mismatch is only logged |
| LLM budget 40/session/day | `session-model-budget.ts consumeSessionModelCall` | closed at gate2, swallowed elsewhere; one shared `nosession` bucket |
| Rate limits | `rate-limit.middleware.ts createRateLimiter` | in-memory in practice; IP is spoofable |
| Region allow-list | `utils/region-code-validator.ts sanitizeRegionCode` | open → IL |
| Ownership | `search.security.ts validateJobOwnership` (closed), `subscription-manager.ts` (closed), `assistant-sse/ownership-validator.ts` (**open**), `GET /search/:id` (**none**) | mixed |
| Pipeline timeout 45s | `route2.config.ts`, `lib/reliability/timeout-guard.ts withTimeout` | stops waiting; LLM calls are not cancelled |

---

## 6. Exit conditions

| # | Exit (in `searchRoute2Internal`) | Response `meta.source / failureReason` | WS (search channel) | Job status (`executeBackgroundSearch`) |
|---|---|---|---|---|
| 1 | gate2 error → throw | — | `SEARCH_FAILED` | DONE_FAILED, `error` |
| 2 | `handleGateStop` | `route2_gate_stop` / LOW_CONFIDENCE | `GATE_STOP` | DONE_STOPPED, `ready(stop)` |
| 3 | `handleGateClarify` | `route2_gate_clarify` / LOW_CONFIDENCE | `CLARIFY` | **DONE_STOPPED** ✗ (should be CLARIFY) |
| 4 | `handleNearMeLocationCheck` | `route2_near_me_clarify` / LOCATION_REQUIRED | `CLARIFY` | DONE_CLARIFY, `clarify` |
| 5 | `handleNearbyLocationGuard` | `route2_guard_clarify` / LOW_CONFIDENCE | `CLARIFY` | **DONE_STOPPED** ✗ |
| 6 | `!allowed` deterministic clarify (unreachable) | LOCATION_REQUIRED | `CLARIFY` | DONE_CLARIFY |
| 7 | success `buildFinalResponse` | `route2` / NONE | `status completed`, `SEARCH_RESULTS` | DONE_SUCCESS, `ready(results)` |
| 8 | any exception (mappers, Google, budget) | — | `SEARCH_FAILED` | DONE_FAILED (`MODEL_BUDGET_EXCEEDED` / `TIMEOUT` / `SEARCH_FAILED`; classified code discarded, raw message leaked) |
| 9 | 45s `withTimeout` | — | none (aborted) | DONE_FAILED `TIMEOUT`; the internal run keeps going |

Evidence for ✗: `guards/gate-clarify.guard.ts:68-69` and `guards/nearby-location.guard.ts:70-71` set `failureReason:'LOW_CONFIDENCE'`, which `search.async-execution.ts` checks **before** `assist.type==='clarify'`.

---

## 7. Tests, observability, failure handling
See `08-tests-observability-failures.md`.
