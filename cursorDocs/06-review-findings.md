# 06 — Review findings and suggested order

Severity: **P0** security or data exposure, **P1** correctness or reliability, **P2** maintainability. Items marked (doc) come from `documentation/04-backend.md` and were not re-verified in this pass. The rest I confirmed in code.

## P0 — security
| # | Finding | Where |
|---|---|---|
| S1 (doc) | `POST /auth/token` signs any client-supplied `sessionId`. Anyone who learns a session id can impersonate it, which defeats all job ownership checks. | `controllers/auth/token.controller.ts` |
| S2 (doc) | Auto-refresh middleware re-signs claims from a cookie decoded with `jwt.decode` (no signature check). | `middleware/auto-refresh-expired-cookie.middleware.ts` |
| S3 (doc) | Client IP is the first `X-Forwarded-For` entry, so every IP rate limit can be bypassed. There is no `trust proxy`. | `rate-limit.middleware.ts`, `lib/http/client-ip.ts` |
| S4 (doc) | Redis rate limiter is never active (ESM import order). Limits are per task, in memory. | `rate-limit.middleware.ts` |
| S5 (doc) | SSE ownership check fails open. `GET /search/:id` (status) has no ownership check. | `ownership-validator.ts`, `search.controller.ts` |

## P1 — correctness and reliability
| # | Finding | Where |
|---|---|---|
| **B1** | **Landmark `textSearchWithBias` always fails** (zod enum vs JSON-schema enum). Verified by a failing spec. Found by claudeDocs. | `route-llm/schemas.ts:63`, `static-schemas.ts:63`, `landmark.mapper.ts` |
| **B3** | **SATURATED results await the MESSAGE_ONLY LLM** (≤1 s) before responding. Found by claudeDocs. | `orchestrator.response.ts` |
| **B2, B5–B12** (claudeDocs, not re-verified by me) | Landmark nearby ignores the keyword; opening hours use server time and ignore overnight and 24/7 places; price intent is effectively a no-op; ranking distance is always measured from GPS; Google `languageCode` is he/en only; rule-based detectors override the LLM; `result-mapper` reads the wrong hours field. | see `claudeDocs/06-review-findings.md` §B |
| **C3, C4** (claudeDocs, not re-verified) | A Brave/CSE outage is cached as NOT_FOUND for 7 days, and weak name matching caches wrong order links for 14 days. | `provider-deeplink-resolver.ts`, `provider-worker.ts`, `provider-strategies/shared.ts` |
| **C9** (claudeDocs, not re-verified) | Job store does read-modify-write with no atomicity, and there is no search idempotency. | `redis-search-job.store.ts` |
| **A3** (claudeDocs, not re-verified) | The session cookie prefix is logged at info level on every SSE request. | `auth-session-or-jwt.middleware.ts` |
| R1 | The 30 s async abort is dead. `signal` vs `abortSignal` mismatch, and a pipeline timeout ends as `SEARCH_FAILED`, never `TIMEOUT`. | `search.async-execution.ts`, `route2.orchestrator.ts` |
| R2 | Gate CLARIFY and nearby-location CLARIFY end as `DONE_STOPPED` (`LOW_CONFIDENCE` is checked first). | `search.async-execution.ts`, `guards/*` |
| R3 | Duplicate and differently-cased terminal events. | orchestrator and async-execution |
| R4 | Probable duplicate assistant SUMMARY (early LLM + deterministic fallback). | `orchestrator.response.ts` |
| R5 | Sync search errors are not logged. | `search.controller.ts` |
| R10 | Provider-cache lookups run before the response is built, so a slow Redis delays results. | orchestrator |
| W1 (doc) | WS state is per process, with no pub/sub, so it cannot scale past one task. | `infra/websocket/*` |
| W2 (doc) | WS ticket consumption is `GET` then `DEL`, not atomic. Use `GETDEL`. | `auth-verifier.ts` |
| L1 (doc) | Landmark mapper has no fallback, and nearby mapper and post-constraints bypass the per-purpose LLM config. | `route-llm/*.mapper.ts` |

## P2 — structure and hygiene
| # | Finding | Where |
|---|---|---|
| D1 | No composition root. `wsManager` imported from `server.ts` in 5 files (circular). | see doc 03 |
| D2 | `any` and untyped context fields at stage boundaries. | orchestrator, `types.ts` |
| D3 | Stale comments and dead path (place-details enrichment, early-context duplication). | orchestrator |
| D4 (doc) | About 40 dead files, 2 unused dependencies (`langchain`, `pino-http`), committed zips and logs. | various |
| D5 (doc) | `npm test` fails (8 of 8 files), 54 of 90 WS unit tests fail, no CI. | `package.json`, `tests/` |
| D6 | `server/src/graph/` and `@langchain/langgraph` do not exist, though `CLAUDE.md` says new work goes there. Update the doc or the branch. | `CLAUDE.md` |
| D7 | `requestId` uses `Math.random`. | `search.controller.ts` |

## Suggested order of work
0. **B1 and B3 first**: both are small, verified, and user-visible.
1. **Auth hardening (S1, S2, S5)**: small changes and the biggest risk reduction.
2. **Client IP and rate limit (S3, S4)**: `trust proxy`, and a lazily created Redis limiter.
3. **Async flow bugs (R1–R5)**: one PR with tests for terminal status and event sequence. These are pure bug fixes, so they fit the route2 rule.
4. **Test baseline and CI (D5)**: delete tests for removed modules, wire the working suites into `npm test`, and add a workflow with `tsc --noEmit` plus tests.
5. **Remove `wsManager` coupling (D1)** through `SearchEventPublisher`, which also makes the route2 end-to-end test possible (mock OpenAI and Google).
6. **Dead code and artifacts (D4)**, and the stale-doc cleanup (D3, D6).
7. **Scale-out (W1)** only when more than one task is needed.

## Questions for the discussion
- Is the v2 graph engine on another branch? If not, are we still planning for it, or do we keep fixing route2?
- Do you want R4 (duplicate assistant message) fixed by dropping the early summary or by dropping the deterministic fallback?
- Should enrichment lookups move after the response (publish results first, patch providers later) to protect "results before words"?
- One task or many on ECS? That decides whether WS pub/sub is urgent.
