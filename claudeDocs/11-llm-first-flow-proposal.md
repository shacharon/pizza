# 11 — Proposal: LLM-first search flow (for CTO review)

**Status:** proposal, not approved · **Date:** 2026-10-10 · **Scope:** backend search engine (`server/`)
**Related:** `07` (how it works today), `09` (gaps), `10` (migration plan)

---

## TL;DR
1. **Today:** the AI makes 6 decisions and fixed code makes 12. Code often overrides the AI.
2. **Proposal:** the AI makes 15 decisions. Code only does work: Google search, fact checks (open now, price, distance) and sorting.
3. **Speed:** the user waits about 3 seconds instead of about 4–5, because fewer AI calls run one after another.
4. **Two loops:** if information is missing, the AI asks the user and the **same** search continues. If there are 0 results, the AI widens the search once.
5. **Built as** a LangGraph workflow in `server/src/graph/`. The existing API and app do not change.
6. **Needs approval:** install LangGraph, and allow bug fixes in today's route2 (see §8).

---

## 1. Goal
Keep today's search intents (city search / near me / landmark), but make the search **truly LLM-first**:
- **The AI decides.** Code never overrides an AI decision.
- **Code checks facts and does the work** (API calls, open-hours math, distance, sorting, limits).
- **No silent guessing.** If the AI fails, it retries once or asks the user.

---

## 2. Today vs proposal: who decides each step

**AI** = the model decides · **CODE** = fixed rules decide

| # | Step | **TODAY** | **PROPOSAL** | Today's code (evidence) |
|---|---|---|---|---|
| 1 | Bad words? | CODE (word list) | AI | `stages/gate2/gate2-query-validity.ts` |
| 2 | Is it food? | AI | AI (asked together with #3) | `stages/gate2.stage.ts` |
| 3 | Which type? (city / near me / landmark) | AI, then CODE changes it | AI | `stages/intent/intent.stage.ts` |
| 4 | "Near me" detected | CODE (word list) | AI | `utils/near-me-detector.ts`, `orchestrator.nearme.ts` |
| 5 | "500m from X" detected | CODE (Hebrew words only) | AI | `intent.stage.ts:159-176` |
| 6 | No GPS: what to do? | CODE (changes the type silently) | AI (asks the user) | `intent.stage.ts` |
| 7 | Location missing: ask the user? | CODE | AI | `orchestrator.guards.ts` |
| 8 | Query language | CODE | AI | `utils/query-language-detector.ts` |
| 9 | Build the Google search text | AI, then CODE cleans it | AI | `stages/route-llm/textsearch.mapper.ts` |
| 10 | Open now / price / kosher | AI ×2 (duplicate) | AI ×1 | `shared/base-filters-llm.ts`, `stages/post-constraints/*` |
| 11 | Search Google | CODE | CODE (same) | `stages/google-maps.stage.ts` |
| 12 | Filter: open now / price / distance | CODE | CODE (same, these are facts) | `post-filters/post-results.filter.ts` |
| 13 | Filter: wrong dish or wrong city | CODE (word list) | AI | `post-filters/list-shape.ts` |
| 14 | "Not kosher" filter | CODE (word list) | AI | `post-filters/not-kosher-name.ts` |
| 15 | AI failed: what now? | CODE guesses silently | AI retries once, or asks the user | `textsearch.mapper.ts`, `intent.stage.ts` |
| 16 | 0 results: what now? | nothing | AI widens the search once | — |
| 17 | Sort results | CODE | CODE (same) | `ranking/ranking-apply.ts` |
| 18 | Assistant text | AI | AI | `assistant/assistant-llm.service.ts` |
| | **AI decides** | **6 steps** | **15 steps** | |
| | **CODE decides** | **12 steps** | **3 steps** | |
| | **AI calls the user waits for** | **5** (3 one after another) | **3** (2 one after another) | |
| | **Wait time (estimate)** | **~4–5 s** | **~3 s** | |

Paths are relative to `server/src/services/search/route2/`. The wait times are estimates (about 1s per AI call) and must be measured (§7).

---

## 3. Proposed flow

```
User query + facts (has GPS? device region?)
   │
   ▼
[understand]  AI: is it food? which type (city / near me / landmark)? what is missing? language
   ├─ not food ─────────────────────────► reply ─► END
   ├─ critical info missing ─► [clarify] question + buttons ─(user answers)─► back to [understand]
   ▼  (if only partly missing: continue, and attach a question to the results)
   ┌───────────────┴───────────────┐   in parallel
[map]  AI                    [constraints]  AI
builds the Google search     open now / price / kosher / "taste"
(1 of 3: city/near/landmark)
   └───────────────┬───────────────┘
                   ▼
           [google_search]   tool (code)
                   ▼
           [hard_filter]     code: open now, price, distance (facts)
                   ├─ 0 results ─► [relax] AI decides how to widen ─► [google_search] (once)
                   ▼
           [rank] ─► [emit]  results shown to the user   ◄── the user waits only up to here
                   ├─► [judge]    AI: matches "taste" (romantic, kids…) ─► updates the list
                   ├─► [narrate]  AI: assistant text
                   └─► [enrich]   Wolt / 10bis / Mishloha links
```

### The two loops (each with a limit)
| Loop | When | Goes back to | Limit |
|---|---|---|---|
| Clarify | The AI says critical info is missing | `understand`, with the user's answer, in the same search | max 2 questions |
| Widen | 0 results after filtering | `google_search`, with the AI's wider search | max 1 time |

### Agent or workflow?
**Workflow.** The AI decides at every step, and the graph follows its decision.
A "full agent", where the AI picks tools in a free loop, would be 2–4 AI round trips slower and harder to test. It is kept for a later chat feature.

---

## 4. Changes vs the original flow (A–G)
The original flow was: A = food? · B = intent (3 types) + clarify · C = AI mapper per type · D = AI constraints · F = Google · G = AI filter on results.

| Change | Why |
|---|---|
| **A + B in one AI call** (`understand`) | Same input, one decision, about 1s faster |
| **C and D in parallel** | They don't depend on each other |
| **G split:** facts by code at once, "taste" by AI **after** results are shown | Code is exact for hours and price; the user doesn't wait for the AI |

---

## 5. What stays in code (and why)
| Code does | Why not AI |
|---|---|
| Call Google, geocode | It's an API call |
| Open now, price level, distance | Exact facts from Google data; the AI can get them wrong |
| Sorting / score | Math, fast, testable |
| Timeouts, budget, rate limits, security | Must be guaranteed |
| Check the AI's answer is possible (e.g. NEARBY but no GPS) | If impossible, **send it back to the AI or ask the user**, never change it silently |

---

## 6. What does NOT change
- API: `POST /api/v1/search?mode=async`, `GET /search/:id/result` (`controllers/search/search.controller.ts`)
- Events the app uses: `progress`, `ready`, `error`, `SEARCH_RESULTS`, `RESULT_PATCH`, SSE assistant text (`llm-angular/src/app/facades/search-ws.facade.ts`, `search.facade.ts`)
- The app (UI): no change needed until the optional "resume" step (§9, step 5)

---

## 7. How we prove it's better
- **Test set:** at least 200 real queries per language (he / en / ar / ru), anonymized, with the expected AI answer.
- **Measure, old vs new:** accuracy, clarify rate (target < 10%), "not food" accuracy, p50/p95 wait time, cost per search.
- The test set must include the cases the deleted code rules covered: bad words, "near me", "500m from X", wrong city/dish.
- **Rule:** the new engine goes live only if it is **not worse** on accuracy, speed and cost.

---

## 8. Decisions needed (CTO / owner)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Install `@langchain/langgraph` and upgrade `@langchain/core` / `@langchain/openai`. The installed ones use zod 3 and the app uses zod 4 | Yes |
| D2 | Merge "is it food?" + "which type?" into one AI call | Yes |
| D3 | AI "taste" filter: show results first, then update (non-blocking) | Yes, non-blocking |
| D4 | Delete the code rules (bad-word list, "near me" list, city/dish filters) once the test set passes | Yes, after the test set |
| D5 | Allow bug fixes in today's route2 while we build | Yes, security + critical bugs only |
| D6 | Tracing: LangSmith (sends queries to a third party) or OpenTelemetry only | OpenTelemetry first |
| D7 | Clarify "resume the same search" needs an optional new request field (UI change later) | Yes, as the last step |

---

## 9. Rollout (summary; details in `10`)

| Step | What | Done when |
|---|---|---|
| 0 | Fix the login security bug; build the test set; record today's events | Test set ready; no passing test breaks |
| 1 | Add an engine switch (old / new / shadow); same API | App behaves the same |
| 2 | Build the graph in `server/src/graph/` with tests | All paths tested; typecheck clean |
| 3 | Shadow: run the new engine quietly next to the old one and compare | New ≥ old on accuracy, speed, cost |
| 4 | New engine for a small % of users | No worse for N days |
| 5 | Clarify continues the same search | End-to-end test passes |
| 6 | Delete route2 | 100% on new for 2 weeks |

---

## 10. Risks
| Risk | Mitigation |
|---|---|
| One bigger `understand` call could be slower than expected | Measure in step 3; fall back to 2 calls |
| Removing code rules changes results | They are covered by the test set before deletion |
| The AI is wrong where code was right | Facts stay in code; the AI decides only intent and taste |
| Login bug: anyone can impersonate a session (`controllers/auth/token.controller.ts`) | Fix in step 0, before saving resumable searches |
| WebSocket and job queue live in one server's memory | Sticky sessions or Redis pub/sub before scaling out |
| AI cost per search | Fewer calls than today (5 vs 6–7 total) |
