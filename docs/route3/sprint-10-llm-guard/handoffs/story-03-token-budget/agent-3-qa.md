# Handoff: Agent 3 — QA — Story 03

**Agent:** 3 QA  
**Story:** [STORY_03_token_budget.md](../../STORY_03_token_budget.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** pass

---

## Summary

Route2 still serves a normal search. The 31st request in a minute from the same session is rejected with `Too many requests` and does not call a model. The 41st model call throws `Try again later` before OpenAI. Neither the rate-limit log nor the budget log contains the search text.

The API process last listened at 19:56:13, after the cap was in the limiter. The live check ran at 20:28. The blocked log shows `count` 31 and `limit` 30.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/llm/session-model-budget.ts` | reviewed, not edited |
| `server/src/routes/v1/index.ts` | reviewed, not edited |
| `server/src/llm/openai.provider.ts` | reviewed, not edited |

---

## Decisions (do not reverse without discussion)

- Empty `POST /search` bodies count toward the limiter and fail validation, so the 31st check does not call a model.
- The 41st model call is the in-memory counter test. It throws before the provider HTTP call.
- A successful search still logs the query in the existing pipeline log. The new limiter and budget logs do not.

---

## Route2 safety

- [x] Flag off: `pizza on Allenby` is `meta.source` `route2`
- [x] `ROUTE3_ENABLED` does not exist

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/llm/session-model-budget.test.ts` from `server/`
- [x] Result: pass (5)
- [x] Calls 1–40 resolve. Call 41 is `Try again later` and does not contain `pizza on Allenby`
- [x] Budget log is `count` 41 and `sessionPrefix` `sess_abc`. No query field

`POST /api/v1/auth/token`, then `POST /api/v1/search?mode=sync` on `http://localhost:3000`:

| Check | Result |
|-------|--------|
| `pizza on Allenby` on its own session | 200, `source` `route2`, `mode` `textsearch`, 8 places |
| 31 empty bodies on a second session | requests 1–30 are 400. Request 31 is 429 `{"error":"Too many requests","code":"RATE_LIMIT_EXCEEDED","retryAfter":58}` |
| Blocked log | `count` 31, `limit` 30, path `/`, no search text |

- [x] The 31st search in a minute from the same session is rejected by the rate limiter
- [x] The 41st model call does not call a model
- [x] The budget response is `Try again later`, not a stack trace
- [x] The new logs do not contain the raw search text

---

## Open questions / next agent

None. Story 03 is done.

**Next:** `--g2e-agent -1 sprint 10 story 4`
