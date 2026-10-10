# Phase 1 diff report: llm-angular/src vs server/src (103 diverged files)

Generated 2026-09-30 at branch base 5524cd6. +/- are lines in the llm-angular copy relative to server/src. Last-commit dates from git log per path.

Verdict rule: 'server newer' = server copy last touched later than llm-angular copy (llm-angular copy is stale). 'REVIEW' = llm-angular copy is newer or same-commit and differs.

| File | +ang | -ang | ang last | srv last | Verdict |
|---|---|---|---|---|---|
| app.ts | 5 | 16 | 2026-02-18 | 2026-09-19 | server newer |
| contracts/search.contracts.ts | 1 | 1 | 2026-03-08 | 2026-01-17 | REVIEW |
| controllers/analytics/analytics.controller.ts | 7 | 13 | 2026-02-18 | 2026-09-30 | server newer |
| controllers/auth/ws-ticket.controller.ts | 16 | 38 | 2026-02-18 | 2026-03-08 | server newer |
| controllers/search/search.async-execution.ts | 16 | 10 | 2026-03-08 | 2026-09-29 | server newer |
| controllers/search/search.controller.ts | 5 | 16 | 2026-02-18 | 2026-09-29 | server newer |
| controllers/stream/assistant-sse/__tests__/assistant-sse.orchestrator.e2e.test.ts | 3 | 221 | 2026-02-18 | 2026-02-21 | server newer |
| controllers/stream/assistant-sse/assistant-context-builder.ts | 9 | 6 | 2026-02-18 | 2026-02-20 | server newer |
| controllers/stream/assistant-sse/assistant-sse.orchestrator.ts | 86 | 277 | 2026-03-08 | 2026-03-08 | REVIEW |
| controllers/stream/assistant-sse/models.ts | 1 | 1 | 2026-03-08 | 2026-03-08 | REVIEW |
| controllers/stream/assistant-sse/result-waiter.ts | 0 | 6 | 2026-02-18 | 2026-02-20 | server newer |
| controllers/stream/assistant-sse/sse-writer.ts | 10 | 28 | 2026-02-18 | 2026-02-21 | server newer |
| infra/websocket/auth-verifier.ts | 3 | 22 | 2026-02-18 | 2026-03-08 | server newer |
| infra/websocket/publish-manager.ts | 1 | 1 | 2026-02-18 | 2026-03-03 | server newer |
| infra/websocket/websocket-manager.ts | 7 | 22 | 2026-02-18 | 2026-09-27 | server newer |
| infra/websocket/websocket-protocol.ts | 2 | 2 | 2026-02-18 | 2026-03-03 | server newer |
| infra/websocket/websocket.config.ts | 6 | 11 | 2026-02-18 | 2026-03-08 | server newer |
| infra/websocket/websocket.types.ts | 0 | 4 | 2026-02-18 | 2026-03-08 | server newer |
| lib/llm/index.ts | 0 | 7 | 2026-02-18 | 2026-09-29 | server newer |
| lib/redis/redis-client.ts | 18 | 37 | 2026-02-18 | 2026-09-29 | server newer |
| lib/reliability/timeout-guard.ts | 17 | 6 | 2026-02-18 | 2026-02-21 | server newer |
| lib/telemetry/query-sanitizer.ts | 3 | 12 | 2026-02-18 | 2026-09-20 | server newer |
| lib/telemetry/stage-timer.ts | 12 | 6 | 2026-02-18 | 2026-09-20 | server newer |
| llm/openai.provider.ts | 3 | 14 | 2026-02-18 | 2026-09-29 | server newer |
| middleware/auth-session-or-jwt.middleware.ts | 2 | 4 | 2026-02-18 | 2026-09-20 | server newer |
| middleware/auth.middleware.ts | 2 | 5 | 2026-02-18 | 2026-09-20 | server newer |
| middleware/httpLogging.middleware.ts | 19 | 20 | 2026-02-18 | 2026-09-20 | server newer |
| middleware/rate-limit.middleware.ts | 2 | 19 | 2026-02-18 | 2026-09-29 | server newer |
| routes/v1/index.ts | 4 | 45 | 2026-02-18 | 2026-09-29 | server newer |
| server.ts | 5 | 8 | 2026-02-18 | 2026-03-08 | server newer |
| services/assistant/assistant-llm-rewriter.service.ts | 7 | 9 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/config/search.config.ts | 0 | 12 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/job-store/inmemory-search-job.store.ts | 2 | 3 | 2026-02-18 | 2026-02-18 | server newer |
| services/search/job-store/job-store.interface.ts | 1 | 3 | 2026-02-18 | 2026-02-18 | server newer |
| services/search/job-store/redis-search-job.store.ts | 2 | 3 | 2026-02-18 | 2026-02-18 | server newer |
| services/search/route2/__tests__/cheeseburger2-fix.test.ts | 59 | 64 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/route2/__tests__/clarify-short-circuit.test.ts | 19 | 5 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/route2/__tests__/early-intent-guard.test.ts | 35 | 14 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/route2/__tests__/textsearch-location-guard.test.ts | 14 | 7 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/route2/assistant-non-blocking.test.ts | 1 | 1 | 2026-02-18 | 2026-02-20 | server newer |
| services/search/route2/assistant/__tests__/fallback-messages.test.ts | 3 | 3 | 2026-02-18 | 2026-02-20 | server newer |
| services/search/route2/assistant/__tests__/language-detector.test.ts | 2 | 6 | 2026-02-18 | 2026-02-19 | server newer |
| services/search/route2/assistant/__tests__/prompt-builder.test.ts | 6 | 25 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/assistant/__tests__/summary-invariant.test.ts | 2 | 35 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/assistant/__tests__/validation-rules.test.ts | 10 | 16 | 2026-02-18 | 2026-02-20 | server newer |
| services/search/route2/assistant/assistant-integration.ts | 14 | 181 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/assistant/assistant-llm.service.ts | 9 | 186 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/assistant/assistant.types.ts | 1 | 20 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/assistant/fallback-messages.ts | 1 | 16 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/assistant/language-detector.ts | 8 | 11 | 2026-02-18 | 2026-02-19 | server newer |
| services/search/route2/assistant/prompt-builder.ts | 45 | 206 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/assistant/validation-rules.ts | 13 | 61 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/enrichment/brave-search-client.ts | 38 | 19 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/enrichment/brave-search.adapter.ts | 235 | 12 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/enrichment/google-cse-client.ts | 16 | 34 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/enrichment/google-cse.adapter.ts | 6 | 3 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/enrichment/metrics-collector.ts | 17 | 17 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/enrichment/provider-deeplink-resolver.test.ts | 1 | 1 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/enrichment/provider-deeplink-resolver.ts | 49 | 20 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/enrichment/provider/provider-enrichment.service.ts | 0 | 4 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/enrichment/provider/provider-worker.ts | 25 | 30 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/enrichment/provider/provider.contracts.ts | 2 | 7 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/route2/failure-messages.ts | 1 | 3 | 2026-02-18 | 2026-02-19 | server newer |
| services/search/route2/guards/shared/response-builder.ts | 2 | 69 | 2026-03-08 | 2026-09-27 | server newer |
| services/search/route2/guards/textsearch-location.guard.ts | 101 | 19 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/route2/orchestrator.early-context.ts | 0 | 2 | 2026-02-18 | 2026-02-19 | server newer |
| services/search/route2/orchestrator.error.ts | 3 | 9 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/orchestrator.filters.ts | 3 | 14 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/orchestrator.parallel-tasks.ts | 4 | 6 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/orchestrator.response.ts | 56 | 85 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/route2/pipeline-error-kinds.ts | 0 | 11 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/post-filters/post-results.filter.ts | 2 | 150 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/prompts/post-constraints.prompt.ts | 126 | 11 | 2026-02-18 | 2026-09-28 | server newer |
| services/search/route2/route2.orchestrator.ts | 32 | 276 | 2026-03-08 | 2026-09-27 | server newer |
| services/search/route2/shared/base-filters-llm.ts | 11 | 68 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/shared/filters-resolver.ts | 2 | 10 | 2026-02-18 | 2026-02-18 | server newer |
| services/search/route2/shared/shared-filters.tighten.ts | 0 | 2 | 2026-02-18 | 2026-02-19 | server newer |
| services/search/route2/shared/shared-filters.types.ts | 1 | 33 | 2026-02-18 | 2026-02-18 | server newer |
| services/search/route2/stages/gate2.stage.ts | 5 | 22 | 2026-03-08 | 2026-09-30 | server newer |
| services/search/route2/stages/gate2/gate2-query-validity.ts | 126 | 76 | 2026-03-08 | 2026-09-29 | server newer |
| services/search/route2/stages/google-maps.stage.new.ts | 2 | 3 | 2026-02-18 | 2026-09-20 | server newer |
| services/search/route2/stages/google-maps.stage.ts | 2 | 3 | 2026-02-18 | 2026-09-20 | server newer |
| services/search/route2/stages/google-maps/landmark-plan.handler.ts | 9 | 12 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/stages/google-maps/nearby-search.handler.ts | 58 | 48 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/stages/google-maps/result-mapper.ts | 1 | 66 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/stages/google-maps/text-search.handler.ts | 14 | 108 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/stages/google-maps/textsearch/__tests__/field-mask-builder.test.ts | 1 | 3 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/stages/google-maps/textsearch/field-mask-builder.ts | 2 | 3 | 2026-02-18 | 2026-09-30 | server newer |
| services/search/route2/stages/google-maps/textsearch/geocoding-service.ts | 2 | 5 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/stages/intent/intent.prompt.ts | 10 | 51 | 2026-02-18 | 2026-02-21 | server newer |
| services/search/route2/stages/intent/intent.stage.ts | 16 | 75 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/stages/intent/intent.types.ts | 4 | 39 | 2026-02-18 | 2026-02-20 | server newer |
| services/search/route2/stages/post-constraints/post-constraints.stage.ts | 10 | 65 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts | 6 | 78 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/stages/route-llm/landmark.mapper.ts | 48 | 61 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/stages/route-llm/nearby.mapper.ts | 4 | 6 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/stages/route-llm/textsearch.mapper.ts | 3 | 64 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/route2/types.ts | 2 | 38 | 2026-02-18 | 2026-09-27 | server newer |
| services/search/types/restaurant.types.ts | 2 | 6 | 2026-02-18 | 2026-03-03 | server newer |
| services/search/types/search-request.dto.ts | 0 | 3 | 2026-02-18 | 2026-09-29 | server newer |
| services/search/types/search-response.dto.ts | 3 | 12 | 2026-03-08 | 2026-03-08 | REVIEW |
| services/search/types/search.schemas.ts | 0 | 21 | 2026-02-18 | 2026-02-20 | server newer |
| utils/fetch-with-timeout.ts | 5 | 22 | 2026-02-18 | 2026-02-21 | server newer |
