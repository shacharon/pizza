# Handoff: Agent 2 — Code Review — Story 03

**Agent:** 2 code review  
**Story:** [STORY_03_token_budget.md](../../STORY_03_token_budget.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

Search is 30 requests a minute, and the key is `search:${ip}:${session}`. Feedback stays at 10 and restaurants stay at 60, both still IP-only. `OpenAiProvider` counts one model call at the start of `completeJSON`, `complete`, and `completeStream`, before `retryWithBackoff` and before the OpenAI client. Call 41 throws `Try again later`. Sync search returns that as 429 `MODEL_BUDGET_EXCEEDED`. The budget log is `count` and `sessionPrefix` only.

Search still calls `searchRoute2`. There is no graph.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/llm/session-model-budget.ts` | daily counter and `ModelBudgetExceededError` |
| `server/src/lib/llm/session-model-budget.test.ts` | key, 30/minute, 41st call |
| `server/src/middleware/rate-limit.middleware.ts` | `buildRateLimitKey`; session only when `includeSession` |
| `server/src/routes/v1/index.ts` | search uses `SEARCH_REQUESTS_PER_MINUTE` and `includeSession: true` |
| `server/src/llm/openai.provider.ts` | one `consumeSessionModelCall` per method |
| `server/src/controllers/search/search.controller.ts` | 429 try-later, no stack |
| `server/src/controllers/search/search.async-execution.ts` | stored message is `Try again later` for this error |

---

## Decisions (do not reverse without discussion)

- Approve both caps. Do not put the search text in the budget log.
- A missing session stays on the `nosession` bucket.
- Internal transport retries do not consume a second call. The check sits above `retryWithBackoff`.

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google untouched
- [x] `search.controller.ts` still calls `searchRoute2` on the success path
- [x] No new graph, schema, or agent loop
- [x] `truncateWordsForLlm` and `frameSearchAsData` untouched
- [x] Fallbacks and timeouts stay on the existing stages

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/llm/session-model-budget.test.ts` from `server/`
- [x] Result: pass (5)
- [x] `search:1.2.3.4:sess_abcdef123456` and `search:1.2.3.4:nosession`
- [x] Router source uses `SEARCH_REQUESTS_PER_MINUTE` and `includeSession: true`
- [x] Calls 1–40 resolve. Call 41 message is `Try again later` and does not contain `pizza on Allenby`
- [x] Exceeded log is `count` 41 and `sessionPrefix` `sess_abc`. No query field

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 3 sprint 10 story 3`
