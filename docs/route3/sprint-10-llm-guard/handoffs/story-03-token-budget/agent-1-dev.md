# Handoff: Agent 1 — Developer — Story 03

**Agent:** 1 developer  
**Story:** [STORY_03_token_budget.md](../../STORY_03_token_budget.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

Search is limited to 30 requests a minute for that IP and that session. Each session gets 40 model calls per UTC day. The 41st call throws `Try again later` before OpenAI is contacted. Sync search returns that text as HTTP 429. The budget log has the count and an 8-character session prefix.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/llm/session-model-budget.ts` | created |
| `server/src/lib/llm/session-model-budget.test.ts` | created |
| `server/src/middleware/rate-limit.middleware.ts` | `buildRateLimitKey`; search opt-in includes session |
| `server/src/routes/v1/index.ts` | search limiter uses 30 and `includeSession: true` |
| `server/src/llm/openai.provider.ts` | one budget check at the start of each of the three methods |
| `server/src/controllers/search/search.controller.ts` | 429 `Try again later` |
| `server/src/controllers/search/search.async-execution.ts` | same text and code on the background path |

---

## Decisions (do not reverse without discussion)

- Other limiters stay IP-only. Only search passes `includeSession`.
- A missing session uses the `nosession` bucket.
- Redis key is `llm-budget:${session}:${utcDate}` with a 48-hour TTL. If Redis is unavailable, the same key is counted in memory.
- One entry into `completeJSON`, `complete`, or `completeStream` consumes one call. Internal transport retries do not.
- The cleanup timer on the in-memory rate limiter is unref'd so a test process can exit.

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google untouched
- [x] `ROUTE3_ENABLED` untouched
- [x] `truncateWordsForLlm` and `frameSearchAsData` untouched
- [x] Anthropic placeholder untouched

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/llm/session-model-budget.test.ts` from `server/`
- [x] Result: pass (5)
- [x] Key `search:1.2.3.4:sess_abcdef123456` and missing session `search:1.2.3.4:nosession`
- [x] `SEARCH_REQUESTS_PER_MINUTE` is 30 and `createV1Router` uses it with `includeSession: true`
- [x] Calls 1–40 resolve. Call 41 is `ModelBudgetExceededError` with message `Try again later`, which does not contain `pizza on Allenby`
- [x] Log fields are `count` 41 and `sessionPrefix` `sess_abc`. No query field

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 10 story 3`
