# 10 — LangGraph plan (target design + migration)

Written 2026-10-10. Architecture plan only. No code was changed.

**How to read the tags:**
- **PROVEN** = seen in the code (file/function given).
- **GUESS** = likely, not checked yet.
- **PLAN** = what we recommend.

Paths are relative to `server/src/`. `route2/` means `services/search/route2/`.

---

## 1. Today in one minute

- **PROVEN:** Search today is a **fixed list of steps**, not an agent. The AI only answers questions ("is it food?", "what route?", "what filters?"). Code decides what happens next.
  - Code: `route2/route2.orchestrator.ts` → `searchRoute2()` → `searchRoute2Internal()`
- **PROVEN:** The app always uses **async search**: `POST /api/v1/search?mode=async`.
  - Code: `llm-angular/src/app/api/search.api.ts:37`
- **PROVEN:** LangChain is installed but **never used**. LangGraph is **not installed**. The folder `server/src/graph/` does not exist yet.
- **PROVEN:** Up to 5 AI calls happen before results show, and 3 of them run one after another (gate2 → intent → mapper). That is slow.

More detail: `07-as-is-agent-architecture.md`, `09-as-is-hld-and-langgraph-gaps.md`.

---

## 2. What we must NOT break (the app depends on these)

**PROVEN:** The UI only reacts to these. The new engine must send exactly the same.

| What | Where (code) |
|---|---|
| `POST /search` → 202 `{requestId, resultUrl}` | `contracts/search.contracts.ts` (`search_contracts_v1`) |
| `GET /search/:id/result` → `SearchResponse` | `services/search/types/search-response.dto.ts` |
| WS events `progress`, `ready` (`results` / `ask`), `error` | UI: `llm-angular/src/app/facades/search-ws.facade.ts` → `handleSearchEvent` |
| WS messages `SEARCH_RESULTS`, `RESULT_PATCH` (order links) | UI: `llm-angular/src/app/facades/search.facade.ts:499-506` |
| SSE assistant text: `meta`, `message`, `done` | `controllers/stream/assistant-sse/*` |

- **PROVEN:** The UI **ignores** the WS `clarify` event and `ready:'stop'`. Clarify and "not food" reach the user through the AI text card (`search.facade.ts:665`).
- **PLAN:** Write tests that record these events now, and run the same tests on the old and the new engine.

---

## 3. The new design (picture)

**PLAN:** The API stays the same. A switch picks which engine runs.

```
App  ──►  POST /api/v1/search  (same as today)
                │
                ▼
        search.controller.ts
                │
        SearchEngine switch   (env: SEARCH_ENGINE = route2 | graph | shadow)
          ├── old: route2  (unchanged)
          └── new: LangGraph engine  (server/src/graph/)
                │
                ▼
        "V1 compat" sender → same WS events + same job result as today
```

**PLAN:** The new engine as a graph:

```
START
  ▼
understand   ← 1 AI call: is it food? language, where, what dish, filters (open now, price, kosher…)
  ├─ not food ─────────────► reject ─► END
  ├─ missing location ─────► clarify (pause, ask user, then continue the SAME search)
  ▼
resolve_location   ← code + geocode (only if a city or landmark is given)
  ▼
places_search      ← Google Places
  ▼
hard_filter        ← code: open at the place's local time, kosher, distance
  ├─ 0 results and not retried yet ─► relax (widen the search once) ─► places_search
  ▼
rank               ← reuse today's ranking functions
  ▼
emit_results       ← send results to the app NOW
  ├──► narrate  (AI text, never delays results)
  └──► enrich   (Wolt / 10bis / Mishloha links, later patch)
END
```

---

## 4. Is it an "agent"?

- **PLAN:** No. The core search stays a **workflow**: code decides the path, and the AI fills in the answers. It is faster, cheaper and easier to test. This matches the project skills `langgraph` and `ai-agentic`.
- **PLAN:** Only two small loops are allowed:
  - **relax:** widen the search once if there are 0 results.
  - **clarify:** ask the user at most 2 times, then give the best answer.
- **PLAN:** A real agent (the AI chooses tools in a loop) only comes later, for chat follow-ups, with a step limit and the budget.

---

## 5. Building blocks (one small class each, injected)

| Block | Does | Reuses today's code |
|---|---|---|
| `graph/search.graph.ts` | Builds the graph (the one place that creates objects) | — |
| `graph/search.state.ts` | One typed state object | replaces `Route2Context` (`route2/types.ts`) |
| `understand` node | One AI call instead of 5 | prompts from `stages/gate2.stage.ts`, `stages/intent/intent.prompt.ts`, `stages/route-llm/*.mapper.ts`, `prompts/post-constraints.prompt.ts` |
| `resolve_location` node | City/landmark to coordinates | `stages/google-maps/textsearch/geocoding-service.ts` |
| `places_search` node | Google search + map results | `stages/google-maps/result-mapper.ts`, `lib/cache/googleCacheService.ts` |
| `hard_filter` node | Code filters | `post-filters/post-results.filter.ts` → `applyPostFilters` (fix the timezone) |
| `rank` node | Score and sort | `ranking/ranking-weight-resolver.ts`, `ranking/ranking-apply.ts` |
| `emit_results` node | Send to the app | `infra/websocket/search-ws.publisher.ts` → `publishSearchEvent`, job store |
| `narrate` node | AI text | `assistant/prompt-builder.ts`, `validation-rules.ts`, `fallback-messages.ts` |
| `enrich` node | Order links | `enrichment/provider/provider-enrichment.service.ts` |

---

## 6. Tools (outside services the graph calls)

**PLAN:** Every tool has:
- a typed input and output (zod),
- a timeout,
- a cancel signal,
- named errors, never a silent empty result.

| Tool | Problem today (PROVEN) | Rule in the new design |
|---|---|---|
| Google Places search | A missing API key returns `[]`, which looks like "no restaurants" (`text-search.handler.ts:44-53`) | Return the error `GOOGLE_AUTH` |
| Geocode | Written twice (`geocoding-service.ts` and `landmark-plan.handler.ts:298-358`) | One tool |
| Order-link lookup | Search-engine errors are saved as "not found" for 7 days (`provider-worker.ts:353-374`) | Errors are never saved as "not found" |
| AI call (structured) | Retries stack up to 6 tries (`gate2.stage.ts:277` + `openai.provider.ts`); two schemas drift apart (LANDMARK bug: `route-llm/static-schemas.ts:63` vs `schemas.ts:63`) | 1 retry max; one zod schema only |

---

## 7. State (memory of a search)

- **PROVEN:** Today, step results are only local variables, so a search can't be paused or resumed. Clarify ends the search, and the user's answer starts a brand-new one.
  - Code: `search.async-execution.ts`
- **PLAN:**
  - One state object: `query`, `understanding`, `location`, `places`, `ranked`, `clarify`, `outcome`, `loop counters`, `errors`, `timings`.
  - Services (AI, Google, Redis) are **not** stored in state.
  - Step 1: one search = one thread.
  - Step 2: the clarify answer continues the same thread, using a saved checkpoint in Redis.

---

## 8. Security first (blocks the "resume" feature)

- **PROVEN:** Anyone can pretend to be another user:
  - `controllers/auth/token.controller.ts` signs a token for any session id the client sends.
  - `middleware/auto-refresh-expired-cookie.middleware.ts` re-signs a fake cookie.
- **PLAN:** Fix this **before** saving resumable searches. Otherwise someone could take over another user's search.
- **PLAN:** Use one ownership check everywhere: result, SSE, resume, WS. If the check can't run, deny access.
- **PROVEN:** Rate limiting trusts a header the client can fake, and the Redis limiter never turns on (`middleware/rate-limit.middleware.ts:162,174-189`).

---

## 9. Logs, errors, tests

**Logs**
- **PROVEN:** There is no tracing. One search can't be followed end to end:
  - `search_audit` has no traceId.
  - AI cost logs have no requestId (`route2/search-audit.ts`, `lib/telemetry/providerTrace.ts`).
- **PLAN:** Every event gets requestId + traceId. Every node logs time, tokens, model, prompt version and outcome. One total cost per search.

**Errors**
- **PROVEN:** The app gets **two** error events with different codes (`orchestrator.error.ts` + `search.async-execution.ts`).
- **PROVEN:** "Clarify" is saved as "stopped" (`guards/gate-clarify.guard.ts:68-69`).
- **PROVEN:** The 30s timeout cancels nothing.
- **PLAN:**
  - Exactly one final event per search.
  - A real cancel signal passed to every AI and Google call.
  - If the AI fails, return a clear error or a question, never a hidden guess.

**Tests**
- **PROVEN:** Today 504 pass, 74 fail, and 18 test files can't even load. There is no quality test set (see `08`).
- **PLAN**, test layers:
  1. pure route-choice tests
  2. node tests with fake AI and Google
  3. full graph tests
  4. **contract tests** (same events as today)
  5. **quality test set**: real anonymized queries in he/en/ar/ru, measuring accuracy, clarify rate, speed and cost

---

## 10. Step-by-step migration (app never changes)

| Step | What | Done when |
|---|---|---|
| **0. Baseline** | Fix the login security bug. Build the quality test set. Record today's events. (Fix route2 bugs only if the owner approves) | Typecheck 0 errors; no passing test breaks; test set ≥ 200 queries × 4 languages |
| **1. Switch** | Add the `SearchEngine` switch + the "V1 compat" sender. route2 is still the only engine | Contract tests pass; behaviour unchanged |
| **2. Build graph** | `server/src/graph/` with fake services and tests (needs package approval) | All exit paths tested; typecheck 0 errors |
| **3. Shadow** | New engine runs quietly next to the old one; compare | New ≥ old on accuracy; not slower (p95); not more expensive |
| **4. Small %** | New engine serves X% of users, same API | Contract tests pass; errors, clarify and 0-result rates not worse for N days |
| **5. Resume** | Clarify continues the same search (Redis checkpoint, optional new request field) | End-to-end resume test; ownership denies by default |
| **6. Remove old** | Delete route2 + dead code (list in `05`) | 100% on the new engine for 2 weeks |

---

## 11. Commands to check things (read-only)

```bash
cd server && npx tsc --noEmit -p .                                   # backend typecheck
cd llm-angular && npx tsc --noEmit -p tsconfig.app.json               # frontend typecheck
cd server && npm ls @langchain/langgraph @langchain/core @langchain/openai zod   # package versions
cd server && node --test --import tsx src/services/search/route2/ranking/__tests__/*.test.ts
cd server && node --test --import tsx src/services/search/route2/stages/route-llm/__tests__/schemas.test.ts   # LANDMARK bug (red today)
cd llm-angular && npx jest src/app/facades --reporters=default        # UI side of the contract
```

---

## 12. Risks

| # | Tag | Risk |
|---|---|---|
| R1 | PROVEN + GUESS | Installed LangChain uses **zod 3**, while the app uses **zod 4** (`npm ls`). They may not work together, so LangChain will likely need an upgrade, which needs owner approval |
| R2 | PROVEN | WebSocket and job queue live in one server's memory. With several servers, events can get lost |
| R3 | GUESS | One big `understand` AI call may be faster *or* slower than 3 small ones. The test set decides |
| R4 | PROVEN | Removing the regex rules (profanity, "near me", city/dish filters) changes results. They must be covered in the test set |
| R5 | PROVEN | Results are sent twice today (`SEARCH_RESULTS` + `ready` then fetch). The new engine must copy both until the app drops one |
| R6 | GUESS | If production has `FEATURE_SSE_ASSISTANT` ≠ true, the AI text is already generated twice. Needs a check in AWS (owner) |

## 13. Decisions for the owner

| # | Question |
|---|---|
| D1 | Approve installing `@langchain/langgraph` and upgrading `@langchain/core` / `@langchain/openai`? |
| D2 | One `understand` AI call, or two (classify + extract)? |
| D3 | Use a ready-made Redis checkpoint library, or build our own on the existing Redis client? |
| D4 | Keep only the v1 API forever, or add `/api/v2/search` with SSE later? |
| D5 | LangSmith tracing (sends queries to a third party) or OpenTelemetry only? |
| D6 | In step 0, may we fix route2 bugs, or only add tests? |
| D7 | Reuse route2's ranking/filter functions in the new graph, or copy them? |

**Needed to start:** D1 and D6.
