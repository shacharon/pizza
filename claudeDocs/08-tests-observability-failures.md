# 08 — Tests, observability, failure handling (As-Is)

Paths relative to `server/src/`, `route2/` = `services/search/route2/`. Test run on 2026-10-10 with `node --test --import tsx <file>`, 60s timeout per file, no network.

## 1. Tests

### 1.1 Inventory
156 test files: 103 in `server/src`, 53 in `server/tests`.

| Area | Files | Fakes | Notes |
|---|---|---|---|
| route2 orchestrator + guards (`route2/__tests__/*`, `route2.orchestrator.test.ts`, `orchestrator-open-now.test.ts`, `google-parallel-optimization.test.ts`, `assistant-non-blocking.test.ts`, `search-audit.test.ts`) | 14 | Hand-written `LLMProvider` object on `ctx.llmProvider`, plus `mockWsManager` via `deps` | Two files **regex the .ts source text** instead of running code |
| gate2 / intent / route-llm | 7 | Fake provider; zod schema tests | — |
| google-maps (+ textsearch) | 11 | Pure functions; 5 are vitest "doc" tests | Fetch-based handlers are effectively untested |
| post-filters / shared filters / ranking | 14 | Pure | Best-covered area |
| assistant | 9 | Fake provider | 5 use Jest globals without imports, so they don't load |
| enrichment | 9 | `mock.fn` clients injected via constructor | — |
| LLM provider (`llm/__tests__`, `lib/llm/*.test.ts`) | 6 | — | **The real `OpenAiProvider` is never tested with a faked client** |
| controllers / WS / auth / cache / logging | ~32 | mock req/res, fake sockets | No Redis fake anywhere |
| `server/tests/` (legacy) | 53 | — | 28 import modules that no longer exist; 12 import uninstalled `@jest/globals`; some need a live server or `OPENAI_API_KEY` |

There is no shared fake library, no `fetch` stub, and no module mocking.

### 1.2 Run results: 72 files (route2 + `llm/__tests__` + `lib/llm`)
**504 pass, 74 fail. 31 files are red; 18 of them never load.**

| Cannot load (18) | Reason |
|---|---|
| `cost-calculator`, `openai.provider.retry`, `lock-service`, `text-search.handler.snapshot`, `text-search.retry`, `field-mask-builder`, `geocoding-service`, `location-bias-validator` | `vitest` is not installed |
| `near-me-hotfix`, `utils/__tests__/near-me-detector` | `@jest/globals` is not installed |
| `fallback-messages`, `language-detector`, `prompt-builder`, `validation-rules`, `brave-search.adapter`, `shadow-compare` | Jest globals undefined |
| `results-ranker-backward-compatibility` | imports the deleted `ranking/results-ranker.js` |
| `cheeseburger2-fix` | throws at import without `JWT_SECRET` |

| Loads but fails | Pass/Fail | Cause |
|---|---|---|
| `lib/llm/llm-resolver.test.ts` | 15/4 | Expects 2500ms; default is now 4000 (`llm-config.ts`) |
| `query-language-detector.test.ts` | 34/22 | 15 use `expect` without importing it; 7 real mismatches |
| `wolt-verifier.test.ts` | 10/12 | Expectations drifted |
| `route2.orchestrator.test.ts` | 4/4 | Source-regex checks are stale |
| `intent.types.test.ts` | 12/2 | Schema drift (`cityText`) |
| `route-llm/schemas.test.ts` | 33/1 | Schema drift (landmark `textSearchWithBias`, see 06 B1) |
| `tenbis-verifier`, `provider-deeplink-resolver`, `provider-verifier-utils`, `google-parallel-optimization`, `orchestrator.helpers`, `orchestrator-open-now`, `post-results-tristate` | small counts | Drift (language `other` vs `en`, unknown-hours policy, URLs) |

### 1.3 Scripts
- `npm test` lists 8 files; 6 import deleted modules (`intent`, `agent.reducer`, `places/phase1-services`, `city-filter`, `street-grouping`, `spec-compliance`).
- `test:resolvers` imports deleted modules. `test:integration` / `test:unified` need a live server.
- `npm run qa` points to `src/services/search/qa/run-qa.ts`, **which does not exist**.
- **No script runs any route2 test.**

### 1.4 Evals
**None.** There is no golden query set, no labelled dataset and no LLM-quality measurement.

## 2. Observability

| Signal | Where | What you get | Gap |
|---|---|---|---|
| Logs | `lib/logger/structured-logger.ts`, `config/logging.config.ts` | pino JSON; redaction list `LOG_REDACT_FIELDS` | Redaction is **top-level keys only** |
| Stage timing | `lib/telemetry/stage-timer.ts startStage/endStage` | `ctx.timings.*Ms`; stage logs | Stage logs are off in prod unless `LOG_PIPELINE_STAGES=true` (`lib/logging/pipeline-stage-log.ts`) |
| Search audit | `route2/search-audit.ts initSearchAudit/logSearchAudit` | One `search_audit` per search: outcome kind, gate/intent decisions, region, resultCount, durations, timings | **No traceId**; logs a query preview (≤200 chars), sessionId and clientIp (privacy) |
| LLM calls | `llm/openai.provider.ts` + `lib/telemetry/providerTrace.ts traceProviderCall` | `provider_call`: model, tokens, cost, latency, success; `llm_gate_timing` per attempt | `provider_call` has **no requestId or stage**; no per-search cost total; prompts/outputs not logged, so a decision can't be replayed |
| Ranking | `ranking/ranking-observability.ts logRankingObservability` | weights, signals, top-N before/after | good |
| Enrichment | `enrichment/metrics-collector.ts` | logs only | finalized before the jobs run |
| Metrics | `lib/metrics/performance-metrics.ts` | — | **unused** |
| Audit store | `lib/audit/providerAudit.store.ts recordProviderCall` | DynamoDB rows per provider call keyed by traceId (prod flag) | best-effort; `console.*` |
| Tracing | — | — | **No OTel, LangSmith, Sentry, X-Ray or Prometheus** |

**Reconstructable for one search:** outcome, timings, gate/intent decisions, mapping method, Google count, ranking top, per-call tokens and cost (with a manual join).
**Not reconstructable:** the exact Google request, LLM prompts and outputs, which results were dropped by which filter and why, total cost per search, a single correlation key (requestId and traceId are each only partly present).

## 3. Failure handling

### 3.1 Retries
| Where | Attempts / backoff | On |
|---|---|---|
| `OpenAiProvider.completeJSON` → `lib/reliability/retry-handler.ts retryWithBackoff` | 3, `[0,250,750]` | 429 / ≥500 |
| `complete`, `completeStream` | none | — |
| gate2 + text/landmark/nearby mappers (stage level) | +1, 100-200ms jitter | timeout/abort text match |
| Google searchText (`text-search.handler.ts:576`) | 3, `[0,500,1000]` | 429/5xx; `searchNearby` has none |
| bias-removal retry (`text-search.handler.ts:58-84`) | +1 | ≤1 result (dead: bias is always undefined) |
| `ProviderWorker.processJobInternal` | 3, 1s·2ⁿ | non-4xx (effectively dead: the resolver swallows errors) |
| Brave / CSE `searchWithRetry` | 3, 2ⁿ·1s | 429/≥500 |
| ioredis `retryStrategy` | gives up after 3 reconnects | — |

Stage retries multiply with provider retries: one gate2 call can reach **6 HTTP attempts**, and each stage retry spends **another budget unit**.

### 3.2 Timeouts
| Value | Where | Cancels work? |
|---|---|---|
| 45s pipeline | `route2.config.ts`, `searchRoute2` `withTimeout` | aborts Google and enrichment only, **not LLM calls** |
| 30s | `search.async-execution.ts` | **no** (writes to the unread `ctx.signal`; only relabels errors) |
| 4000ms per purpose | `lib/llm/llm-config.ts` via `resolveLLM` | yes (the provider's own controller) |
| 4500ms hard-coded | `post-constraints.stage.ts`, `nearby.mapper.ts` | yes |
| 1.5s / 1.0s assistant | `route2.config.ts` SUMMARY_EARLY / MESSAGE_ONLY | **no** (race only) |
| 8s Google | handlers, `geocoding-service.ts` | yes (+ `ctx.abortSignal`) |
| 10s cache race | handlers | **no**, and it re-fetches |
| 30s job / 20s resolve / 5s HTTP | enrichment | job and resolve: no; HTTP: yes |
| `INTENT_*_TIMEOUT_MS` | `config/intent-flags.ts` | unused (legacy) |

### 3.3 Fallbacks
Gate fails hard. Intent → TEXTSEARCH. base_filters / post_constraints → nulls. Text mapper → deterministic mapping. Nearby/landmark → throw (nearby has a regex fallback on a parse path). Assistant → deterministic text. Budget store → memory. Job store write → ignored.
Several of these are **silent rule-based guesses**, which conflicts with the owner's "no silent guessing" rule.

### 3.4 Error taxonomy
`route2/pipeline-error-kinds.ts classifyPipelineError` matches on error type and message substrings: budget → timeout by stage → Google `errorKind` → quota → location → missing keys → gate/intent → parse/validation → `INTERNAL_ERROR`.
- `error.stage` is rarely set, so stage-specific kinds rarely fire.
- `LLM_PROVIDER_UNAVAILABLE` and `NEARME_INVALID_LOCATION` are never produced.
- On failure the client gets **two terminal events with different codes**: `SEARCH_FAILED{code}` from `orchestrator.error.ts handlePipelineError` and `error{MODEL_BUDGET_EXCEEDED|TIMEOUT|SEARCH_FAILED}` from `executeBackgroundSearch`.

### 3.5 Terminal statuses
`JobStatus` (`job-store/job-store.interface.ts`): `PENDING | RUNNING | DONE_SUCCESS | DONE_CLARIFY | DONE_STOPPED | DONE_FAILED`. The mapping and the clarify→STOPPED misclassification are in `07` §6. `search_audit.kind` uses a separate vocabulary (`results/clarify/not_food/no_results/error/timeout/debug`).
