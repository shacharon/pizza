# Story 03 — Stop a token run-up

**Sprint 10**

## What

One search can call several models. Cap how often that happens.

- Search rate: 30 requests a minute per IP and session (today it is 100)
- Session budget: 40 model calls a day
- Past the budget, the API answers with a normal “try later” and does not call a model
- Log the count and the session id prefix. Do not log the search text

## Scope

`server/src/routes/v1/index.ts` for the search limiter, and one small counter used by the Route2 model calls (`completeJSON` / `complete` / `completeStream` wrappers, or the existing `llm-client`).

Do not remove the 25-word cut. Do not change Google.

## Acceptance criteria

- [ ] The 31st search in a minute from the same session is rejected by the rate limiter
- [ ] The 41st model call in a day for that session does not call a model
- [ ] The response in that case is a clear try-later message, not a stack trace
- [ ] Logs do not contain the raw search text

## Agents

`-1 → 0 → 1 → 2 → 3`
