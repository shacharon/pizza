# Going2Eat Route3 — Architecture Principles

**Story:** R3-002 (Sprint 0)
**Status:** Draft for approval
**Depends on:** [`PRODUCT.md`](./PRODUCT.md) (R3-001). Product requirement IDs (`PR-xx`), decisions (`D-xx`) and questions (`Qxx`) refer to that file.
**Scope of this file:** the rules every Route3 design and implementation story must follow. It does not choose the implementation.

This document has three parts:

1. **Existing architecture.** Facts that constrain Route3, read from the code at `796e568`. `R2/` means `server/src/services/search/route2/`.
2. **Binding principles.** Rules every Route3 story must follow. They are numbered `AP-xx`. A story that cannot meet one must stop and raise it.
3. **Open design decisions.** Questions that are not decided. They are numbered `AQ-xx`. Nothing in part 3 is binding.

---

## 1. Existing architecture (verified)

- **Route2 pipeline:** `R2/route2.orchestrator.ts` runs a fixed sequence in code. The sequence is: Gate2, Intent, route-LLM mapper, location guards, Constraints LLMs plus Google in parallel, deterministic post-filters, deterministic weighted ranking, enrichment, response. See PRODUCT §1.1.
- **Route2 LLM capabilities.** Each is one structured JSON call:

  | Capability | Code | What it produces |
  |------------|------|------------------|
  | Gate | `R2/stages/gate2.stage.ts` | food signal: CONTINUE / ASK_CLARIFY / STOP |
  | Intent | `R2/stages/intent/intent.stage.ts` | route (TEXTSEARCH / NEARBY / LANDMARK), language, region candidate, city |
  | Mappers (3) | `R2/stages/route-llm/textsearch.mapper.ts`, `nearby.mapper.ts`, `landmark.mapper.ts`, chosen by `route-llm.dispatcher.ts` | Google request mapping per route |
  | Constraints | `R2/shared/base-filters-llm.ts`, `R2/stages/post-constraints/post-constraints.stage.ts` | open state and times, price, dietary, accessible, parking |
  | Assistant | `R2/assistant/` | narration, clarify and summary text |

- **How LLM calls are made:**
  - All calls go through the project's own `LLMProvider.completeJSON` with a Zod schema (`server/src/llm/openai.provider.ts`, `anthropic.provider.ts`, `server/src/llm/types.ts`).
  - The provider is chosen by `LLM_PROVIDER` (default `openai`) in `server/src/llm/factory.ts`.
  - Model and timeout are chosen per purpose in `server/src/lib/llm/` (purposes: `gate`, `intent`, `baseFilters`, `routeMapper`, `assistant`).
- **LangChain and LangGraph:**
  - `langchain` and `@langchain/openai` are listed in `server/package.json`, but no file under `server/src` imports them.
  - LangGraph (`@langchain/langgraph`) is not installed.
- **Existing guardrails in Route2:**
  - capped model strings (`cap-model-string.ts`)
  - search text marked as data
  - a per-session LLM token budget (`server/src/lib/llm/session-model-budget.ts`)
  - pipeline timeout
  - auth and session ownership checks on HTTP, WS and SSE
- **Infrastructure:**
  - Redis exists. It holds jobs, auth sessions, WS tickets, caches, rate limits and budgets.
  - Logging is structured (`server/src/lib/logger/structured-logger.ts`).
  - Tests run with `node --test`.
- **Client contract:**
  - The UI uses `POST /api/v1/search`, `GET /api/v1/search/:requestId/result`, WS `/ws` and the assistant SSE stream.
  - The response is `SearchResponse`.
  - No client-side route selector exists.
- **No Route3 code exists.**

---

## 2. Binding principles

### AP-01 — Route2 is immutable

- Route3 work must not change any file under `R2/`, or Route2's prompts, schemas, behavior or production default.
- The only allowed shared touch-points are the ones needed to select Route3 (PR-06). They must leave Route2 the default and behave the same when Route3 is not selected.
- Route2 tests must keep passing unchanged.

### AP-02 — Route3 is isolated

- Route3 code lives in its own module.
- **Dependency direction:**
  - Route2 never imports Route3.
  - Route3 may **reuse** Route2 code only through calls that leave Route2 untouched.
  - Shared infrastructure (Google client, auth, Redis, logging, LLM budget) is used through its existing public interfaces.
- Turning Route3 off, or deleting it, must leave Route2 working.

### AP-03 — LLM-first, autonomous orchestrator from the first message

- Every user message, **including the first one**, goes to the **Orchestrator LLM**. No code path decides the business flow before the orchestrator sees the message.
- The orchestrator decides what to do next, for example:
  - ask a clarifying question
  - call a capability or tool
  - search
  - refine
  - answer from the current results
  - start a new search
  - reply
- In line with D-02, the orchestrator judges topic changes and asks when uncertain.

### AP-04 — Custom LangGraph `StateGraph` with a real agent loop

- **The graph:** Route3 is a **custom LangGraph `StateGraph`**. It is not a prebuilt agent and not a fixed pipeline.
- **The loop:** the graph implements a real loop, **LLM → Tool → Observation → LLM**:
  1. The orchestrator emits tool calls.
  2. The tools run.
  3. Their results go back to the orchestrator as observations.
  4. The orchestrator then decides again.
  - The loop ends when the orchestrator produces a final turn result: a reply, a question or a recommendation list.
- **No hard-wired business sequence:** graph edges express the agent loop and technical control. They do not hard-wire a business sequence such as "always Gate → Intent → Mapper".

### AP-05 — LangChain primitives

- **Models:** LangChain chat models.
- **Tools:** LangChain tools with Zod input schemas.
- **Messages:** LangChain messages (`HumanMessage`, `AIMessage`, `ToolMessage`, `SystemMessage`) for the conversation.
- **Structured outputs:** used wherever an LLM must return data, not prose.
- The existing `LLMProvider` stays in place for Route2 (AP-01).

### AP-06 — Specialized LLMs remain available as capabilities

- **Exposed as tools:** the Gate, Intent, three Mapper (text search, nearby, landmark) and Constraints (base filters, post constraints) LLM capabilities remain available to the orchestrator as **tools**.
- **Calling them:** the orchestrator decides **whether and when** to call each one. None is mandatory on every turn, and no fixed order is imposed.
- **Validation:** their outputs keep their Zod-validated structured shape.

### AP-07 — LLM-driven filtering and ranking before publishing

- **Only the LLM decides:** only the LLM decides which restaurants are recommended, which are excluded and in what order they are shown.
  - This covers every criterion, including opening hours, dietary requirements and permanently closed status.
  - Tools supply evidence (AP-08). They never make this decision.
- **Permanently closed places:** the product requirement to exclude them (PR-05.3) stays binding. The LLM meets it by excluding every place whose evidence shows permanently closed status. No tool does it for the LLM.
- **When it runs:** this happens **before** any new recommendation list is published to the user. It satisfies PR-05.1.
- **What must never be published:**
  - unfiltered or unranked lists
  - partial lists
  - provider-ordered lists
- **No invented facts:** the LLM's selection and any statements about restaurants must be grounded in tool observations (PR-05.4).

### AP-08 — No deterministic business logic; guardrails and facts are allowed

**Not allowed:** deterministic code must not make business decisions. That means:

- **Routing:** choosing search mode, deciding to clarify, detecting topic changes, choosing region or language from heuristics.
- **Filtering:** no tool or code may exclude or filter restaurants on business criteria. This includes:
  - opening hours
  - dietary requirements
  - permanently closed status
  - price
  - rating
  - wrong dish or wrong city
  - name regexes or keyword lists
- **Ranking:** no weighted scores, sort orders or truncation by business criteria that decide what the user sees.
- **Route2 logic under another name:** Route2's post-filters, list shaping and weighted ranking must not be carried into Route3, for example as a "fact", "evidence", "helper" or "pre-processing" tool.

**Factual tools return evidence, not decisions:**

- A factual tool returns every candidate it received or retrieved, each with its facts attached. Examples of facts: business status, hours coverage, distance, price level, dietary signals.
- It does not drop, hide or reorder candidates based on those facts.

**Allowed:**

- **Technical guardrails:**
  - authentication and session ownership
  - input-size and output-size caps
  - timeouts, retries and loop-iteration limits
  - token and cost budgets
  - rate limits
  - prompt-injection handling (user text treated as data)
  - tool allowlists
- **Validation:** Zod validation of every LLM output, tool input and tool output, with defined handling of failures.
- **Fact retrieval:** calling providers such as Google Places with the search parameters the LLM chose.
- **Factual computations** that produce evidence for the LLM, for example:
  - distance between two points
  - whether opening hours cover a given time
  - unit and currency normalization
  - geocoding results
  - the provider's business status (e.g. permanently closed), passed through as a fact

### AP-09 — Conversation state and checkpointing

- **State:** each conversation has explicit, typed graph state. It includes at least:
  - the message history
  - the current search context (PR-03.1)
  - the last published recommendation list
- **Checkpointing:** the state is persisted with a LangGraph **checkpointer**, keyed by conversation.
  - A refresh with a valid session resumes the same conversation (PR-03.4).
  - An explicit New Search starts a fresh context (PR-03.2).
- **Sessions:** state is bound to the authenticated session. A client cannot load or resume another session's conversation.

### AP-10 — Clarification and resume

- A clarification ends the turn with a question to the user. Its graph state is checkpointed.
- The user's next message, whether a choice or free text (PR-02.2), resumes the same conversation from that checkpoint. The orchestrator merges the answer into the current context instead of starting over.

### AP-11 — Multilingual and country-aware, with no language-to-country inference

- **Reply language:** the orchestrator replies in the user's language (PR-04.2).
- **Country / region:** taken from where the user wants to eat: an explicit place, device location or session (PR-04.3).
  - Route3 prompts and code must **not** infer country from request language. For example, there is no "Hebrew → IL" rule.
- Supported languages must cover whatever set PRODUCT Q5 freezes.

### AP-12 — Existing API and UI compatibility

- **One UI:** Route3 is served to the existing Angular UI (PR-06.1).
  - Route2's HTTP / WS / SSE contracts and `SearchResponse` must keep working unchanged for Route2.
  - Any Route3 contract change must be additive and must not break a Route2 client.
  - The contract shape is open (PRODUCT Q4, AQ-01).
- **Selector:** the Route2 / Route3 selector is development-only (PR-06.2). Route2 stays the production default.

### AP-13 — SOLID and KISS

- **Single responsibility:**
  - Each graph node does one thing.
  - Each tool wraps one capability.
  - State, prompts, tools, graph wiring and transport adaptation are separate.
- **Dependencies:**
  - Depend on interfaces for models, tools, the checkpointer and external services, so each can be replaced in tests.
  - Use the simplest graph that meets the requirements.
- **No speculative abstractions:** no future-only features (parking, booking: PR-07) and no extra agents.

### AP-14 — Security

- User text and tool outputs are **data**, never instructions. Prompts must keep them delimited.
- **Tools:**
  - The orchestrator may call only allowlisted tools with Zod-validated inputs.
  - No tool fetches arbitrary URLs or runs arbitrary code from model output.
- **Inherited guardrails:** Route3 keeps or exceeds Route2's: model-string caps, token budget, timeouts, auth and ownership on every transport.
- **Logs and stored state:** no secrets, API keys or raw tokens. User text in logs follows the existing sanitization rules.

### AP-15 — Testability

- **Unit tests:** every tool and node is unit-testable with fake models and fake external services, with no network.
- **Orchestrator behavior:** tested with scripted model responses that prove the loop, clarification / resume, New Search reset and the publish gate (AP-07).
- **Route2 regression:** Route2's existing test suite runs unchanged as a regression check.

### AP-16 — Observability

- **Per turn, log:**
  - the request or conversation id
  - every LLM call (purpose, model, latency, tokens, cost)
  - every tool call (name, latency, outcome, validation failures)
  - loop iterations
  - the final turn result
- **Joining up:** logs use the existing structured logger, so a full turn can be rebuilt from them.
- **Comparison:** Route2 and Route3 traffic must be distinguishable.

### AP-17 — No Critic in the initial phase

- The initial phase has **no Critic**: no separate reviewer or self-critique LLM pass that checks or rewrites the orchestrator's output.
- Adding one later is a new decision.

---

## 3. Open design decisions

All items are **OPEN**. Product questions in `PRODUCT.md` §4 stay open as well, and several of them block items here.

| # | Question | Related |
|---|----------|---------|
| AQ-01 | Transport for Route3: reuse `POST /search` + WS/SSE with additive fields, or add a conversation endpoint? How are conversation turns, clarify questions and streaming represented to the UI? | AP-12, PRODUCT Q4 |
| AQ-02 | How Route3 reuses the specialist capabilities: call Route2 stage functions directly, wrap them as LangChain tools, or re-implement them on LangChain models with the same prompts and schemas. Route2 stages use the custom `LLMProvider`, not LangChain. | AP-02, AP-05, AP-06 |
| AQ-03 | Checkpointer backend (Redis or other), TTL, and what makes a session "valid" for resume. | AP-09, PRODUCT Q2 |
| AQ-04 | Orchestrator model and provider, and the models for the specialist tools. Is Anthropic supported in Route3 alongside OpenAI? | AP-05 |
| AQ-05 | Loop limits: maximum iterations and tool calls per turn, and the per-turn latency and cost budget. | AP-08, PRODUCT Q11 |
| AQ-06 | How LLM filtering and ranking is structured: inside the orchestrator LLM, or as a dedicated LLM ranking step (never a deterministic one, AP-08). How many candidates it sees, and what facts are passed for each place. | AP-07, PRODUCT Q8 |
| AQ-07 | How it is verified that the LLM's published list meets PR-05.3 and the user's explicit constraints. Examples: evals, tests, or a validation step that returns a non-compliant output to the LLM with the reason. Any such check must never silently remove or reorder places itself (AP-07, AP-08). The product policy for unknown data stays open in PRODUCT Q7 and Q13. | AP-07, AP-08, PRODUCT Q7, Q13 |
| AQ-08 | Which Route2 computations are reused as evidence-only tools (for example distance, opening-hours coverage, business status), and how Route2's location guards become orchestrator decisions. Route2's post-filters, list shaping and weighted ranking are not carried over (AP-08). | AP-08 |
| AQ-09 | Final output contract: the structured result schema the orchestrator must return to publish a list, and how a reply-only turn is represented (PR-02.4, PRODUCT Q10). | AP-07, AP-12 |
| AQ-10 | How the dev-only selector is wired across client and server, and whether the server refuses Route3 in production. | AP-12, PRODUCT Q9 |
| AQ-11 | Order-provider links (Wolt / 10bis / Mishloha) and assistant narration in Route3: reuse the enrichment as a tool or post-step, or leave them out. | PRODUCT Q12 |
| AQ-12 | Tracing tooling beyond the structured logger (for example LangSmith): allowed or not, given privacy. | AP-16 |
| AQ-13 | Language and region inputs to the orchestrator: which client signals are sent (UI locale, GPS, session region), and how the `IL` / `OTHER` device-region limit is handled. | AP-11, PRODUCT Q5, Q6 |
| AQ-14 | Which LangGraph and LangChain package versions to adopt, and whether they work with the existing `langchain@0.3` / `@langchain/openai@0.6` and `zod@4`. | AP-04, AP-05 |
