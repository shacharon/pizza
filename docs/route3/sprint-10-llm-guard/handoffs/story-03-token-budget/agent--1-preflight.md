# Handoff: Agent -1 — Preflight — Story 03

**Agent:** -1 preflight  
**Story:** [STORY_03_token_budget.md](../../STORY_03_token_budget.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

Server story on Going2Eat (`angular-piza`), not Dating and not a Route3 graph. Size **M**.

Two separate caps. The search HTTP limiter in `server/src/routes/v1/index.ts` is 100 requests a minute. The story lowers that to 30 per IP and session. The daily cap is new: 40 model calls for a session. The 41st call does not reach a model. The API returns a normal try-later message, not a stack trace. Logs may include the count and a session id prefix. They must not include the search text.

This does not rewrite Gate2, Intent, or Google. Do not remove the 25-word cut or the story 1 string caps.

Two facts the architect must design around:

- The limiter comment says IP and session. The key in `createRateLimiter` is `search:` plus the client IP only. Session is not in the key.
- Route2 does not use `completeJSONWithPurpose`. Gate, intent, base filters, the mappers, post-constraints, and the assistant call `llmProvider.completeJSON` or `complete` on the provider. A counter only inside `llm-client.ts` would not see those calls.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-10-llm-guard/handoffs/story-03-token-budget/agent--1-preflight.md` | created |
| `server/src/routes/v1/index.ts` | N/A (later agents; search `maxRequests`) |
| Provider `completeJSON` / `complete` / `completeStream`, or a wrapper those calls actually use | N/A (later agents) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- Search rate becomes 30 requests a minute per IP and session. Do not leave the key as IP alone if the story’s “and session” is to be true.
- Session budget is 40 model calls a day. The 41st does not call a model.
- Past the budget, the response is a clear try-later message. No stack trace.
- Log the count and a session id prefix. Do not log the raw search text.
- Do not edit Google. Do not change `truncateWordsForLlm` or `frameSearchAsData`.
- Do not rewrite Gate2 routing or Intent route selection. The counter sits in front of the model call.

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] The search limiter number and key, and one model-call counter, are the exception this story allows

---

## Tests / verification

- [x] Command: read story, sprint README, epic, `createV1Router` search limiter, `createRateLimiter` key, and the Route2 `completeJSON` / `complete` call sites
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None that block design. The architect decides the day window and whether a retry counts as another model call. The counter has to be on the provider path Route2 uses.

**Next:** `--g2e-agent 0 sprint 10 story 3`
