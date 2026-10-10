# 12 — Autonomous search agent: understanding, conflicts, risks

**Status:** understanding for confirmation (no implementation yet) · **Date:** 2026-10-10
**Supersedes:** `10-langgraph-plan.md` and `11-llm-first-flow-proposal.md` (both describe a fixed workflow, which the owner rejected).

Labels: **[P] PROVEN** = read in code · **[H] HYPOTHESIS** = not yet verified · **[R] RECOMMENDATION**
Paths are relative to `server/src/services/search/route2/` unless shown otherwise.

---

## 1. My understanding of the target

**One autonomous orchestrator agent** (LangChain `createAgent`) runs a real **LLM → tools → observe → decide** loop. The orchestrator LLM owns every business decision:
- which tool to call
- in what order
- whether to retry
- whether to ask the user
- when to stop

**The specialized LLMs stay.** Each one becomes a **tool** the orchestrator calls.

**Code** only does these things, and never makes a semantic decision:
- executes tools
- validates inputs and outputs with zod
- enforces security and resource limits
- keeps the existing API and UI working

```
POST /api/v1/search (unchanged) ─► executeBackgroundSearch (host, unchanged contract)
                                        │
                                        ▼
                    ┌──────── Orchestrator agent (createAgent) ────────┐
                    │  LLM ⇄ tools loop; decides order/retry/clarify/stop │
                    └───┬─────────────────────────────────────────────┬─┘
     specialized LLM tools                                   execution tools (code)
     gate_food            (today executeGate2Stage)           google_text_search    (executeTextSearch)
     classify_intent      (executeIntentStage)                google_nearby_search  (executeNearbySearch)
     map_textsearch       (textsearch.mapper)                 google_landmark_search(executeLandmarkPlan)
     map_nearby           (nearby.mapper)                     ask_user  → clarify / interrupt
     map_landmark         (landmark.mapper)                   (publish results → v1 WS/job events)
     extract_constraints  (base_filters + post_constraints)
     filter_rank_results  (NEW LLM; replaces applyPostFilters/ranking code)

Code only: run tools · zod in/out · auth/ownership · GPS injected server-side ·
           budget · max iterations/tool calls · timeouts + AbortSignal · event/contract mapping
```

### What changes from today [P]

| Today (code decides) | Evidence | Target |
|---|---|---|
| Fixed step order | `route2.orchestrator.ts:82-626` `searchRoute2Internal` | Orchestrator LLM decides the order |
| Guards decide clarify / location | `orchestrator.guards.ts`, `orchestrator.nearme.ts` | Orchestrator LLM, via `ask_user` |
| "Near me" word list | `utils/near-me-detector.ts` | Orchestrator / `classify_intent` LLM |
| Code overrides the intent | `stages/intent/intent.stage.ts:159-176` | Never overridden |
| Filtering | `post-filters/post-results.filter.ts:41 applyPostFilters`, `post-filters/list-shape.ts`, `post-filters/not-kosher-name.ts` | `filter_rank_results` LLM |
| Ranking | `ranking/ranking-weight-resolver.ts:44`, `ranking/ranking-apply.ts:141` | `filter_rank_results` LLM |

### What can be reused [P]
- **The Google handlers already take an LLM-produced argument object:**
  - `executeTextSearch(mapping, ctx)` (`stages/google-maps/text-search.handler.ts:24`)
  - `executeNearbySearch` (`nearby-search.handler.ts:24`)
  - `executeLandmarkPlan` (`landmark-plan.handler.ts:24`)
- **Their argument types are zod schemas** (`stages/route-llm/schemas.ts:25-81`). They map almost directly to execution-tool inputs and mapper-tool outputs.
- **The specialized LLM prompts and schemas exist today:**
  - Gate: `stages/gate2.stage.ts:177`
  - Intent: `stages/intent/*`
  - The three mappers: `stages/route-llm/*.mapper.ts`
  - Constraints: `shared/base-filters-llm.ts`, `stages/post-constraints/*`

---

## 2. Questions to confirm

| # | Question | Why it matters |
|---|---|---|
| Q1 | Is **Gate a tool** the orchestrator calls (my reading), or a call that runs before the agent starts? | It decides whether the orchestrator runs (and costs a turn) on non-food queries |
| Q2 | **Constraints:** one tool that merges today's two calls, or keep both? | Today `resolveBaseFiltersLLM` and `executePostConstraintsStage` extract the same things, with opposite merge priorities: `orchestrator.filters.ts:72-89` vs `ranking/ranking-weight-resolver.ts:50` **[P]** |
| Q3 | **Filtering/Ranking:** one LLM tool or two? | Number of turns and latency |
| Q4 | **Results to the UI:** does the orchestrator *decide* when to show them (a `publish_results` tool), or does code publish when `filter_rank_results` returns? | "Results before words" (CLAUDE.md) vs "the LLM controls termination" |
| Q5 | **Order-link enrichment** (Wolt/10bis/Mishloha): background execution outside the loop, or a tool? | It's slow and async (`enrichment/provider/provider-job-queue.ts`), with no semantic decision today |

---

## 3. Conflicts with existing project rules (superseded, not followed)

| Location | Old rule | Conflict |
|---|---|---|
| `.claude/skills/langgraph/SKILL.md:8` | "rebuild… as a LangGraph **workflow**" | Target is an agent |
| `.claude/skills/langgraph/SKILL.md:36` | "**Explicit workflow graph, not a prebuilt ReAct agent**" | Target is `createAgent` |
| `.claude/skills/langgraph/SKILL.md:43` | "**Routing is code.** … No model call inside a router" | The LLM routes |
| `.claude/skills/langgraph/SKILL.md:60-68`, `:76` | Fixed graph `understand → google_search → hard_filter → emit → judge`; "routers are pure functions" | Fixed order |
| `.claude/skills/ai-agentic/SKILL.md:10-12` | "core search is a **fixed workflow**… agent only for open-ended tasks" | Contradicts the target directly |
| `.claude/skills/ai-agentic/SKILL.md:13` | "**Code does** … open now, distance, kosher flag, **sorting by score**" | Filtering/ranking become an LLM decision |
| `.claude/skills/solid-oop/SKILL.md:28` | "Ranking, filtering, scoring… pure functions" | Becomes an LLM tool |
| `.claude/skills/testing/SKILL.md:22-48` | `HardFilterNode`, "Router test: pure function" | Tests must become agent-trajectory tests |
| `.claude/agents/architect.md:26,28` | "LangGraph.js **workflow**"; "merge food-gate + intent into one `understand` call" | Target keeps Gate and Intent separate |
| `.claude/agents/architecture-reviewer.md:28`, `.claude/agents/code-reviewer.md:26` | Review for "pure routers", workflow | Reviewers would reject the target |
| `claudeDocs/10-langgraph-plan.md`, `claudeDocs/11-llm-first-flow-proposal.md` | Fixed workflow, merged gate+intent, code-side fact filtering | **Superseded** |
| Claude's earlier recommendations (code emits results, gate+intent merged, hard filters in code) | — | **Withdrawn** where they conflict |

**`CLAUDE.md` does not conflict.** Line 11 only says `server/src/graph/` is the v2 engine. Its product rules still apply as **constraints** on the agent:
- "results before words"
- "clarification resumes the same search"
- "no silent guessing"

**[R]** The skills and agent files above need an owner-approved update. Until then, the vibe pipeline (`/vibe-pipeline`) will push the old design.

---

## 4. Technical risks (challenged inside the agent architecture, not replacing it)

| # | Risk | Evidence | Mitigation inside the agent design |
|---|---|---|---|
| R1 | **`createAgent` isn't available.** The installed `langchain@0.3.37` exports only `createReactAgent` (the legacy text-ReAct agent). `@langchain/langgraph` isn't installed. LangChain core uses zod 3; the app uses zod 4 | **[P]** `server/node_modules/langchain/dist/agents/index.d.ts:19`; `npm ls` | Upgrade LangChain (needs owner approval, CLAUDE.md rule 5). **[H]** `createAgent` is in langchain v1; check its API in `node_modules` after the upgrade |
| R2 | **Latency.** Each tool round costs an orchestrator turn. gate → intent → mapper (+ constraints) → Google → filter/rank → final is about 6 orchestrator calls plus 6 specialized calls, almost all one after another | **[P]** today's critical path is 3 LLM calls one after another (`route2.orchestrator.ts:159-292`). **[H]** ~10–15 s, not measured | Parallel tool calls in one turn (mapper ∥ constraints); a small, fast orchestrator model; compact tool outputs; progress events per tool; measure in shadow mode before canary |
| R3 | **Budget.** The cap is 40 model calls per session per day, counted per call. About 12 calls per search allows roughly 3 searches a day | **[P]** `server/src/lib/llm/session-model-budget.ts consumeSessionModelCall` | Owner decision: count per *search*, or raise the cap. Code enforces it as a resource limit |
| R4 | **The agent bypasses budget and tracing.** Both live inside `OpenAiProvider`; `ChatOpenAI` wouldn't call them. The `LLMProvider` interface has no tool calling | **[P]** `server/src/llm/openai.provider.ts`, `server/src/lib/telemetry/providerTrace.ts`, `server/src/llm/types.ts:110-150` | Re-add both as agent middleware/callbacks before the first call |
| R5 | **Two semantic deciders on the route.** The orchestrator must read the query to choose tools, and `classify_intent` also decides the route | **[P]** today intent is the only router | Define in the prompt that `classify_intent` is evidence and the orchestrator decides. Measure how often they disagree in evals |
| R6 | **LLM ranking of ~20 places.** The model must read hours, price and distance for each place: many tokens, high factual-error risk | **[P]** the hours logic is non-trivial even in code (`post-filters/post-results.filter.ts:357-465`; bugs listed in `06` B5) | Code **computes data fields** (isOpenAt in the place's time zone, distanceKm, priceLevel). The LLM **decides** inclusion and order. Decisions stay semantic; arithmetic stays execution |
| R7 | **Prompt injection from tool results** (place names and addresses enter the loop) | **[P]** only the user query is framed (`server/src/lib/llm/truncate-llm-words.ts frameSearchAsData`) | Delimit tool outputs as data; zod-validate every tool argument |
| R8 | **GPS supplied by the LLM** | **[P]** `stages/route-llm/nearby.mapper.ts:134-138,278` | Inject GPS and device region server-side (a security concern, not a semantic one). The tool returns a typed `LOCATION_REQUIRED`, and the agent decides what to do |
| R9 | **Clarify and resume need memory plus trusted identity** | **[P]** `server/src/controllers/auth/token.controller.ts`, `server/src/middleware/auto-refresh-expired-cookie.middleware.ts` | Fix auth before the checkpointer and threads |
| R10 | **Non-deterministic paths with no evals** | **[P]** no golden set; `npm run qa` points at a missing file | Trajectory evals (tool order and arguments) plus outcome evals, in he/en/ar/ru, in shadow mode against route2 |
| R11 | **"The LLM controls retries" vs cost** | — | The LLM decides *whether* to retry. Code caps iterations, calls per tool, and the 45s deadline (`route2.config.ts PIPELINE_TIMEOUT_MS`) |

---

## 5. Next step
1. Owner confirms or corrects §1 and answers Q1–Q5.
2. Owner approves updating the conflicting skills and agent files (§3) and the LangChain upgrade (R1).
3. Then: an implementation architecture covering
   - tool contracts
   - agent configuration and limits
   - event mapping to the v1 API
   - reuse vs rewrite per file
   - migration and evals
