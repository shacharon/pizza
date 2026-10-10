# 06 — Review findings (ranked)

Severity: **P0** = security or production-breaking · **P1** = wrong results / product rule broken · **P2** = cost, reliability · **P3** = debt.
✔ = verified directly in code by the main reviewer; the rest come from sub-reviews with file:line refs.

## A. Security / privacy (platform)

| # | Sev | Finding | Where |
|---|---|---|---|
| A1 ✔ | P0 | **Session takeover:** public `POST /auth/token` signs a 30-day JWT for any client-supplied `sessionId`. All ownership checks compare only sessionId. | `controllers/auth/token.controller.ts:25,76` |
| A2 ✔ | P0 | **Cookie forgery:** auto-refresh `jwt.decode`s an unverified cookie and, on a bad signature or expiry, issues a genuinely signed cookie for that sessionId, copying the unverified `userId`. | `middleware/auto-refresh-expired-cookie.middleware.ts:44-75,148-175` |
| A3 | P0 | The session cookie (first 50 chars of the Cookie header) is logged at info level on every SSE request. | `middleware/auth-session-or-jwt.middleware.ts:66` |
| A4 | P1 | Session ids, raw queries, feedback notes and coordinates are logged at info level. | token.controller:91, redis-search-job.store:49-51, base-filters-llm:251, nearby-search.handler:36, routes/v1/index:56 … |
| A5 | P1 | Rate limits use the left-most `X-Forwarded-For` (spoofable), there is no `trust proxy`, and the Redis limiter never activates (Redis client is read before init because of ESM import hoisting). | `middleware/rate-limit.middleware.ts:162,174-189` |
| A6 | P1 | Free session minting bypasses the LLM budget (40/day per session) and the per-session search limit. | `lib/llm/session-model-budget.ts` |
| A7 | P1 | `GET /search/:requestId` has no ownership check; SSE ownership fails open when the job is missing or the store errors. | `search.controller.ts:230-239`, `ownership-validator.ts:30-36` |
| A8 | P2 | Public photo proxy (`origin:true`), public `/feedback` (SES), analytics stores up to 1MB of arbitrary data × 1000 in memory. | app.ts, analytics.controller.ts:44-66 |
| A9 | P2 | WS ticket GET+DEL is not atomic (ticket can be reused); `requestId` uses `Math.random`. | `auth-verifier.ts:134-150`, `search.controller.ts:33` |
| A10 | P3 | A personal email address is hard-coded in the SES feedback sender; Redis URL (with password) can be logged on a format error. | `send-feedback-email.ts`, `config/env.ts` |

## B. route2 correctness (P1 unless noted)

| # | Finding | Where |
|---|---|---|
| B1 ✔ P0 | **LANDMARK street/area queries always fail.** The JSON schema + prompt allow `afterGeocode:'textSearchWithBias'`, but zod accepts only `'textSearch'`. Parse fails, there is no fallback, and the pipeline errors. | `route-llm/static-schemas.ts:63` vs `schemas.ts:63`, `landmark.mapper.ts:26,52` |
| B2 ✔ | Landmark nearby search ignores the keyword (only `includedTypes:['restaurant']`): "pizza near X" returns any restaurant. | `landmark-plan.handler.ts:108-133` |
| B3 ✔ | **Results wait for words:** SATURATED (≥15 results) awaits the MESSAGE_ONLY LLM (≤1.2s) before the response. | `orchestrator.response.ts:~130` |
| B4 | The early SUMMARY is generated with `resultCount:0`, isn't cancelled on timeout, and can arrive *after* real results saying "no results found". | `route2.orchestrator.ts:380-411`, `fallback-messages.ts` |
| B5 | Opening hours use server time (UTC) `getDay()/getHours()`, ignore overnight periods, and treat 24/7 places as open only on Sunday. | `post-results.filter.ts:357,376,382-397,415,444-465`, `orchestrator.response.ts:~72` |
| B6 | Price intent does nothing useful: the re-sort is overwritten by ranking; `priceFit` rewards any price level (so "cheap" boosts expensive places); post_constraints `priceLevel` is reported as applied but never applied. | `post-results.filter.ts:100-159`, `ranking-apply.ts:205-208`, `orchestrator.filters.ts:87,130` |
| B7 | Ranking distance is always measured from the user's GPS, never from the searched city/landmark. | ranking |
| B8 | Google `languageCode` is he/en only, so Arabic and Russian users get English data. | all handlers |
| B9 | Rule-based detectors (he/en only) override the LLM: the near-me substring list ("בסביבה", "nearby") hijacks LANDMARK queries; profanity regexes hit "shiitake" and "זינגר"; `list-shape` city regex drops "שדרות ירושלים, תל אביב" from Tel Aviv results. These go against the LLM-first rule. | `near-me-detector.ts`, `gate2-query-validity.ts:16,47`, `list-shape.ts:14,25-72` |
| B10 | Intent post-fix forces English "500m from me" to LANDMARK with `landmarkText:null`. | `intent.stage.ts:159-176` |
| B11 | `result-mapper` reads `weekdayText` (the field is `weekdayDescriptions`); a missing location becomes (0,0). | `result-mapper.ts:99-100,119` |
| B12 | The constraint metadata sent to the client claims kosher=hard and unknown-hours=exclude; the code does neither. | `constraints-registry.ts` |
| B13 P2 | Gate2 failure throws (pipeline fails) while Intent degrades; budget errors are rethrown in one stage and swallowed in another. | gate2.stage, intent.stage |
| B14 P2 | Clarify does not resume the same search (product rule). | orchestrator |
| B15 P2 | base_filters / post_constraints get no current date/time, so "tomorrow" and "Friday 20:00" can't be resolved. | `base-filters-llm.ts:54` |

## C. Reliability / cost

| # | Sev | Finding | Where |
|---|---|---|---|
| C1 ✔ | P1 | The controller's 30s AbortController goes on `ctx.signal`; route2 reads `ctx.abortSignal`, so it never cancels anything (real limit is 45s). No LLM call receives any abort signal. | `search.async-execution.ts:28-31`, `route2/types.ts:27` |
| C2 | P1 | WS pub/sub and the provider queue are in-process: multiple instances without sticky sessions lose events. | infra/websocket, provider-job-queue |
| C3 | P1 | Provider enrichment: a Brave/CSE outage or 429 is cached as NOT_FOUND for **7 days**; the cache guard meant to prevent this is unused. | `provider-deeplink-resolver.ts:206-217`, `provider-worker.ts:353-374` |
| C4 | P1 | Weak name matching (all-noise-word names match anything; "italia" matches "italiano"), so wrong order links get cached for 14 days. | `provider-strategies/shared.ts:207-230` |
| C5 | P2 | Provider queue: serial, unbounded; timeouts don't cancel; locks expire while jobs are still queued, leading to re-enqueue and double billing; the RESULT_PATCH only reaches the first requestId, so later requests stay PENDING. | provider-job-queue, publish-manager.ts:191 |
| C6 | P2 | Google cache: the 10s race re-fetches while the first call is still running (double billing); the L0 in-flight entry is tied to the first request's abort; cache init never retries if Redis is down at boot. | handlers ~156/169/214, `cache-manager.ts:61` |
| C7 | P2 | Field mask includes Enterprise-tier fields on every call; landmark geocodes even on a cache hit. | field-mask-builder.ts:17, landmark-plan.handler.ts:59 |
| C8 | P2 | Redis boot retries never retry; ioredis gives up after 3 reconnects; `/healthz` returns 503 when Redis is down, which causes restart loops. | `redis-client.ts:68-70,107-110`, health controller |
| C9 | P2 | Job store read-modify-write without WATCH/Lua (lost updates); no search idempotency (double submit runs two pipelines). | `redis-search-job.store.ts:59-127` |
| C10 | P2 | `.env.local` never overrides `.env`; dotenv runs after hoisted imports. | `server.ts:6-46` |
| C11 | P3 | Cost calculator prices `gpt-4.1*` as `gpt-4` by substring match; enrichment metrics are finalized before the jobs run. | `cost-calculator.ts`, `route2.orchestrator.ts:566` |
| C12 | P3 | Memory leaks: `summaryGenStateByRequestId` Map, budget `memoryCounts`, analytics array. | assistant-llm.service.ts:28 |

## C+. Added in the agent-architecture pass (see 07/08)
| # | Sev | Finding | Where |
|---|---|---|---|
| C13 ✔ | P1 | gate-clarify and nearby-clarify are stored as **DONE_STOPPED** (the `failureReason:'LOW_CONFIDENCE'` check runs before the clarify check) | `guards/gate-clarify.guard.ts:68-69`, `guards/nearby-location.guard.ts:70-71`, `search.async-execution.ts` |
| C14 | P1 | On failure the client gets two terminal events with different codes (`SEARCH_FAILED{code}` + `error{…}`), and the raw `err.message` is stored and sent | `orchestrator.error.ts`, `search.async-execution.ts` |
| C15 | P2 | If prod runs with `FEATURE_SSE_ASSISTANT` ≠ `true` while the UI uses SSE (`useSseAssistant:true`), assistant LLM calls run twice per search. Local `.env`=true, `.env.example`=false; prod value not checked | `orchestrator.response.ts:104`, `llm-angular/src/environments/*` |
| C16 | P2 | Nested retries (stage × provider) allow up to 6 HTTP attempts per gate call and spend 2 budget units; all session-less calls share one `nosession` budget bucket | `gate2.stage.ts:277`, `openai.provider.ts`, `session-model-budget.ts` |
| C17 | P2 | Tests: 504 pass / 74 fail in route2+LLM; 18 files cannot load; `npm test` and `npm run qa` point at deleted or missing files; no evals | see 08 |
| C18 | P3 | `search_audit` has no traceId; `provider_call` has no requestId or stage, so one search can't be correlated end to end | `search-audit.ts`, `lib/telemetry/providerTrace.ts` |

## D. Debt
- ~200 `any` in the platform layer plus many in route2; `console.*` in app code (assistant service, resolver, DynamoDB audit).
- Fake progress events (`route_llm 50%` is sent before the pipeline runs).
- Results are delivered twice (WS `SEARCH_RESULTS` + `ready` + stored result).
- Legacy `/api` mount; its Sunset date has passed.
- The rest is in `05-solid-services.md` (duplication, dead code, DI).

## Suggested order
1. A1, A2, A3 (security, small fixes).
2. B1, B3, C1 (one-line-class bugs with big impact).
3. C3, C4 (wrong or missing order links cached for days).
4. B5, B6, B7 (result quality: hours, price, distance).
5. Platform hygiene: trust proxy plus a real IP, a Redis rate limiter, a zod env schema, a composition root. This feeds the v2 graph design.
