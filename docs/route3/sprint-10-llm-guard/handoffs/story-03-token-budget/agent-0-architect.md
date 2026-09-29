# Handoff: Agent 0 — Architect — Story 03

**Agent:** 0 architect  
**Story:** [STORY_03_token_budget.md](../../STORY_03_token_budget.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No graph nodes. No Angular.

Two caps. Search HTTP stays the existing limiter, now 30 requests a minute for that IP and that session. Model calls get a separate counter: 40 per session per UTC day. The 41st throws before any provider HTTP call. The API answers `Try again later`. Logs get the count and an 8-character session prefix, not the search text.

---

## Files to add

| Path | Purpose |
|------|---------|
| `server/src/lib/llm/session-model-budget.ts` | Daily counter and `ModelBudgetExceededError` |
| `server/src/lib/llm/session-model-budget.test.ts` | 40 allowed, 41st refused |

## Graph

Not Route3. No nodes, no edges. `ROUTE3_ENABLED` stays unset / false.

## Stay on Route2

Keep `searchRoute2`, Gate, Intent, and Google. The counter is called from `OpenAiProvider` before the OpenAI client. Stages stay as they are.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/routes/v1/index.ts` | search limiter `maxRequests: 30`, include session in the key |
| `server/src/middleware/rate-limit.middleware.ts` | search key is IP and session; other limiters stay IP-only |
| `server/src/lib/llm/session-model-budget.ts` | created |
| `server/src/lib/llm/session-model-budget.test.ts` | created |
| `server/src/llm/openai.provider.ts` | one budget check at the start of `completeJSON`, `complete`, and `completeStream` |
| `server/src/controllers/search/search.controller.ts` | map the budget error to 429 |
| `server/src/controllers/search/search.async-execution.ts` | same message on the background error path |
| Gate, Intent, Google, `truncateWordsForLlm`, `frameSearchAsData` | N/A |
| `llm-angular/`, `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Search limit is 30 in a 60-second window. The 31st request is the existing 429 `Too many requests` / `RATE_LIMIT_EXCEEDED`. Do not change feedback or restaurant limiters.
- Search key is `search:${ip}:${sessionId}`. Read `sessionId` from the request after `authSessionOrJwt`. If it is missing, use `nosession` so the bucket is still capped. Do not log the full session id. The existing limiter log stays; do not add the query.
- Export a pure helper used by that key, so a test can see IP and session together:

```ts
export function buildRateLimitKey(prefix: string, ip: string, sessionId?: string): string {
  return `${prefix}:${ip}:${sessionId && sessionId.length > 0 ? sessionId : 'nosession'}`;
}
```

Only the search limiter passes the session. Other `createRateLimiter` callers keep today's IP-only key.

- Day window is the UTC date `YYYY-MM-DD`. Redis key `llm-budget:${sessionId}:${utcDate}`. If Redis is down, use an in-memory map with the same key. Set the Redis TTL to 48 hours.
- `MODEL_CALLS_PER_SESSION_DAY` is 40. `consumeSessionModelCall` increments first. If the new count is greater than 40, throw `ModelBudgetExceededError` and do not call OpenAI. Counts 1 through 40 proceed.
- One entry into `completeJSON`, `complete`, or `completeStream` is one call. Transport retries inside that method do not increment again. A stage that calls the method twice counts twice.
- Missing `sessionId` uses the key `nosession` for that UTC day. Still capped at 40.
- The error message is exactly `Try again later`. It has no query and no stack.

```ts
export class ModelBudgetExceededError extends Error {
  constructor() {
    super('Try again later');
    this.name = 'ModelBudgetExceededError';
  }
}
```

- Log only `{ event: 'model_budget_exceeded', count, sessionPrefix }` where `sessionPrefix` is the first 8 characters, or `none`. Do not log messages, the query, or the rest of the session id.
- Sync search catch: if the error is `ModelBudgetExceededError`, `429` with `createSearchError('Try again later', 'MODEL_BUDGET_EXCEEDED')`. Do not pass `error.message` from any other error, and do not send `error.stack`.
- Async background catch: same text and code `MODEL_BUDGET_EXCEEDED`. Do not put the raw error message on the job when it might be something else that contains the query. For this error, the stored message is `Try again later`.
- Do not edit the Anthropic placeholder. It never calls a model.
- Do not edit Google, Gate routing, Intent route selection, `truncateWordsForLlm`, or `frameSearchAsData`.

### Where the check runs

First lines of `OpenAiProvider.completeJSON`, `complete`, and `completeStream`, before `getOpenAIClient` and before `traceProviderCall`:

```ts
await consumeSessionModelCall(opts?.sessionId);
```

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [x] 25-word cut and the data line stay
- [ ] Search limiter key and the provider budget check are the edits this story allows

---

## Tests / verification

Run from `server/`:

```text
node --test --import tsx src/lib/llm/session-model-budget.test.ts
```

- [ ] `buildRateLimitKey('search', '1.2.3.4', 'sess_abcdef123456')` is `search:1.2.3.4:sess_abcdef123456`
- [ ] A missing session id becomes `search:1.2.3.4:nosession`
- [ ] Search `maxRequests` in `createV1Router` is 30
- [ ] With an in-memory counter, calls 1–40 resolve and call 41 throws `ModelBudgetExceededError`
- [ ] The error message is `Try again later` and does not contain a planted query such as `pizza on Allenby`
- [ ] The budget log object has `count` and `sessionPrefix` of at most 8 characters, and no query field
- [ ] A second `consumeSessionModelCall` inside the same `completeJSON` is not required; the provider calls `consume` once per method entry

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 10 story 3`
