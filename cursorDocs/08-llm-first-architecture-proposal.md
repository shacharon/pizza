# 08 — LLM-first search architecture: proposal for CTO review

Status: **draft for discussion**. Nothing has been implemented, and no packages have been installed.
Labels: **[P]** proven in code · **[H]** hypothesis, not measured · **[R]** recommendation.
Paths are relative to `server/src/`. Evidence for today's flow: [05-route2-flow.md](05-route2-flow.md), [07-as-is-hld-and-langgraph-gaps.md](07-as-is-hld-and-langgraph-gaps.md).

## 1. Decisions needed in this review

1. **Shape of the LLM flow:** option A, B or C (section 4).
2. **Meaning of "LLM-first":** does code still compute facts and carry out the LLM's decisions? See section 5.
3. **Ranking on the critical path:** can results be shown before the ranking LLM finishes?
4. **Phase 1 clarify:** reuse the existing `locationResume` contract, or go straight to a LangGraph interrupt with a checkpointer.
5. **Failure policy:** when the understanding/intent LLM fails, return an error or fall back to a guess? (`CLAUDE.md` says "no silent guessing".)

## 2. Today (route2)

### 2.1 LLM calls per normal successful search: 6, up to about 10 **[P]**

| # | LLM call | Code | When | Blocks results? |
|---|---|---|---|---|
| 1 | Gate2 (food yes/uncertain/no) | `stages/gate2.stage.ts: executeGate2Stage` | always, unless the regex pre-check decided; +1 retry on timeout | yes |
| 2 | Intent (TEXTSEARCH / NEARBY / LANDMARK) | `stages/intent/intent.stage.ts: executeIntentStage` | always | yes |
| 3 | Route mapper (Google parameters) | `stages/route-llm/route-llm.dispatcher.ts: executeRouteLLM` | always; +1 retry on timeout | yes |
| 4 | Base filters (hours, price) | `shared/base-filters-llm.ts: resolveBaseFiltersLLM` | always | yes (barrier) |
| 5 | Post-constraints (hours, price, kosher, GF, …) | `stages/post-constraints/post-constraints.stage.ts` | always | yes (barrier) |
| 6 | Early summary | `assistant/assistant-integration.ts` | always | no |
| 7 | Message-only summary | `orchestrator.response.ts: generateAndPublishMessageOnly` | 15 or more results | **yes, awaited** |
| 8 | Generic-query narration | `orchestrator.response.ts` | generic query with GPS | no |

The critical path is three LLM calls in a row (gate → intent → mapper), followed by a parallel barrier (base filters ∥ post-constraints ∥ Google). Documented p50 is about **5.5–7.5 s** end to end (`documentation/02-system-architecture.md:16`).

### 2.2 Decisions made in code today (deterministic) **[P]**

| Decision | Code |
|---|---|
| Gibberish/profanity pre-check before Gate2 | `stages/gate2/gate2-query-validity.ts: getGate2QueryValidityPreDecision` |
| Language by script | `utils/query-language-detector.ts: detectQueryLanguage` |
| "Near me" phrase list and route override | `utils/near-me-detector.ts`, `orchestrator.nearme.ts: applyNearMeRouteOverride` |
| Intent fallbacks (failure → TEXTSEARCH; NEARBY without GPS → TEXTSEARCH) | `intent.stage.ts` |
| Location guards and anchor rules | `orchestrator.guards.ts`, anchor block in `route2.orchestrator.ts` |
| Mapper fallbacks (fixed text query, default radius) | `textsearch.mapper.ts`, `nearby.mapper.ts` |
| Google retries (radius tiers, retry without bias) | `stages/google-maps/text-search.handler.ts` |
| Merging two filter outputs | `orchestrator.filters.ts: applyPostFiltersToResults` |
| Post-filtering (hours, "not kosher" by name, list-shape regex) | `post-filters/post-results.filter.ts`, `list-shape.ts`, `not-kosher-name.ts` |
| Ranking with fixed weights and boosts | `ranking/ranking-weight-resolver.ts`, `ranking-apply.ts` |
| Summary from a template (fewer than 15 results) | `assistant/fallback-messages.ts` |

### 2.3 Why it was split this way **[P]**
- ADR-02 (`documentation/02-system-architecture.md:550`): small, schema-constrained calls per purpose; cheap models; per-stage timeouts and observability; deterministic guards between stages. Documented cost: 3 sequential LLM hops, about 100 files.
- Duplication in practice:
  - Base filters and post-constraints both extract hours and price.
  - Gate2 always returns `language: 'other'`, so intent detects language again.
  - Post-constraints' candidate list `top` is always empty (`buildPostConstraintsUserPayload`).
- Drift in practice: the landmark zod schema (`route-llm/schemas.ts:63`) and the JSON schema (`static-schemas.ts:63`) disagree. `schemas.test.ts` fails because of it.

## 3. Target flow (common to all options)

```
User query
  ↓
Understand: food? intent (3 types)? enough data? constraints?
  ├─ not food                → message, end
  ├─ missing data, can't search → clarify with choices, end
  ├─ missing data, can search   → search + attach a question (partial results)
  └─ enough data             → search
  ↓
Search loop (LangChain tools): run the Google tool → enough results? → otherwise one more tool (max 3)
  ↓
Filter + Rank by the requested constraints (LLM)
  ↓
Results (WS SEARCH_RESULTS) → enrichment and narration in the background
```

The loop is **only around search**. It is not around the whole flow, and there is no critic in Phase 1.

## 4. Options

### A — Separate and sequential (owner's proposal)
Food LLM → Intent LLM → Mapper LLM → Constraints LLM → Google → Filter/Rank LLM.

### B — Separate, partly parallel
(Food LLM ∥ Intent LLM ∥ Constraints LLM) → Mapper LLM / tool call → Google → Filter/Rank LLM.

### C — Merged understanding
Understanding LLM (food + intent + constraints + first tool call) → Google → Search-check LLM → Filter/Rank LLM.

### Comparison

| | Today | A | B | C |
|---|---|---|---|---|
| LLM calls (normal search) | 6 | 5 | 5 | 3 |
| LLM steps in a row | 3, then a barrier | 5 | 3 | 3 |
| Who decides constraints | 2 LLMs + code merge | 1 LLM | 1 LLM | 1 LLM (same call) |
| Filtering | code | LLM | LLM | LLM |
| Ranking | code | LLM | LLM | LLM |
| Prompt size per call | small | small | small | larger |
| Easy to locate a failure | per stage | per stage | per stage | per field of one output |
| Latency **[H]** | p50 5.5–7.5 s | highest | close to C | lowest |
| Cost **[H]** | 6 calls | 5 calls | 5 calls | 3 calls |
| Risk | known | slow | merging parallel outputs | one prompt does a lot |

### Recommendation **[R]**
- **B as the safe first step**, or **C if latency matters most**.
- B keeps one responsibility per prompt (easy to tune and evaluate) and removes most of the sequential wait.
- C is faster and cheaper. It is the shape the repo's own skill recommends ("merge calls only when they read the same input and the result is one decision", `.claude/skills/ai-agentic/SKILL.md` §2).
- Both are measurable on the same eval set, so the choice can be confirmed with data before the cut-over.

## 5. What "LLM-first" means in code **[R]**

**The LLM decides, and code only computes facts and carries out decisions.**

| Stays in code (not semantic) | Moves to the LLM |
|---|---|
| Calling Google, cache | food / not-food |
| Distance from the anchor, Google's `openNow` | intent and route |
| zod validation; ranked IDs ⊆ candidates | clarify vs search |
| Loop limit (max 3 tool calls), LLM budget | constraints |
| Auth, rate limits, WS, job store | filtering |
| Order-link enrichment worker | ranking |

This conflicts with the current skill text "routing is code / code does what code can check" (`.claude/skills/langgraph/SKILL.md` §2.4, `ai-agentic` §1). **Decision needed.** If accepted, graph edges only read a field the LLM produced (for example `outcome`), so the decision is still the model's.

New capability, decided by the LLM and executed by Google: send `openNow`, `minRating` and `priceLevels` to Google. **[P]** None are sent today (`text-search.handler.ts`).

## 6. LangChain/LangGraph design (short)

- **Graph:** an explicit LangGraph `StateGraph`, not a prebuilt ReAct agent. The tool loop is a bounded subgraph.
- **Tools (zod args), wrapping existing code:**
  - `places_text_search` → `callGooglePlacesSearchText` + `GoogleCacheService`
  - `places_nearby_search` → `callGooglePlacesSearchNearby`
  - `geocode` → `geocodeCity`
  - `get_place_details` (Phase 2) → `getPlaceDetailsByPlaceId`
- **State:** a typed, serializable object (query, understanding, candidates, ranking, outcome, errors, timings), replacing the mutable `Route2Context`.
- **Middleware as LangChain callbacks:** budget (`session-model-budget.ts`), tracing (`traceProviderCall`, stage timer, `search_audit`). The request `AbortSignal` is passed into every model call. **[P]** It is not passed today.
- **Retries:** one transient-only retry per node. **[P]** Today the provider retry and the stage retries stack.
- **Errors:** typed node errors, classified by the existing `classifyPipelineError`. Narration and enrichment never fail a run.
- **Contract:** the existing `SearchResponse`, WS events (`SEARCH_RESULTS`, `RESULT_PATCH`, `assistant`, `ready`/`clarify`/`error`) and UI stay unchanged. A `SearchEngine` interface lets route2 and the graph engine run side by side.

## 7. Migration plan (API and UI unchanged)

| Phase | Work | Exit criteria |
|---|---|---|
| 0 | Green baseline (`schemas.test.ts` fails today), characterization tests for route2, eval set from anonymised `search_audit` (he/en/ar/ru), install LangChain packages (needs approval) | Typecheck at 0 errors; route2 eval baseline recorded |
| 1 | Ports and composition root (`SearchEngine`, event publisher, LLM factory, Places port); route2 wrapped unchanged | Route2 behaviour identical |
| 2 | Understanding step(s) in shadow mode | Field accuracy ≥ route2; clarify rate ≤ route2 (target < 10%) |
| 3 | Search tools and loop in shadow mode | Top-10 overlap with route2 within an agreed band; ≤ 3 tool calls at p95 |
| 4 | Filter/Rank LLM offline | NDCG@5 ≥ route2 ranking |
| 5 | Canary behind a flag, x% of sessions | Error rate and p95 ≤ route2; zero UI contract diffs; cost per search within budget |
| 6 | Clarify via interrupt with Redis checkpointer; retire route2 | Clarify resumes the same run; route2 traffic is 0 |

Validation commands available today:
```bash
cd server && npx tsc --noEmit -p .
cd server && node --test --import tsx src/services/search/route2/stages/route-llm/schemas.test.ts   # 1 failing test today
cd server && node --test --import tsx src/services/search/route2/route2.orchestrator.test.ts
cd llm-angular && npx tsc --noEmit -p tsconfig.app.json
```

## 8. Risks

| Risk | Note |
|---|---|
| Ranking LLM adds latency **[H]** | About 1–2.5 s on the critical path. Today ranking is instant code. Mitigate with a small model, short output (`id`, `rank`, `reasonCode`) and ≤ 20 compact cards. |
| LLM filtering hallucinates **[H]** | No critic in Phase 1. Code supplies facts (`openNow`, distance) and checks that IDs come from the candidates. |
| Variance from the tool loop **[H]** | p95 latency and cost become noisier. Mitigate with max 3 tool calls and the budget. |
| Budget counts calls **[P]** | Loop steps consume the 40-per-day allowance (`session-model-budget.ts`). |
| Single process **[P]** | WS and the provider queue are per process. This proposal does not change that. |
| Schema drift **[P]** | Already caused the landmark bug. Use one zod schema per contract. |
| No v2 code exists yet **[P]** | `server/src/graph/` and `@langchain/langgraph` are absent on `refactor/phase-1-hygiene`. |
