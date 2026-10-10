# Going2Eat Route3 — Epics

**Story:** R3-003 (Sprint 0)
**Status:** Draft for approval
**Depends on:** [`PRODUCT.md`](./PRODUCT.md) (`PR-xx`, `D-xx`, `Qxx`) and [`ARCHITECTURE-PRINCIPLES.md`](./ARCHITECTURE-PRINCIPLES.md) (`AP-xx`, `AQ-xx`).
**Delivery order:** [`ROADMAP.md`](./ROADMAP.md).

This file defines **what each Epic owns**. It contains no sprint plans or stories. Those come later, Epic by Epic.

Every Epic is bound by:
- **AP-01:** Route2 is immutable.
- **AP-02:** Route3 is isolated.
- **AP-08:** no deterministic business routing, filtering or ranking.
- **AP-17:** no Critic.

An Epic may not start a story that needs an undecided item it owns until that item is decided.

---

## Epic overview

| Epic | Name | Purpose | Depends on |
|------|------|---------|------------|
| E0 | Engineering foundation | Isolated Route3 module, dependencies, dev-only selector, test and observability baseline | Sprint 0 |
| E1 | Agent runtime | Custom `StateGraph`, Orchestrator LLM, real LLM → Tool → Observation → LLM loop | E0 |
| E2 | Restaurant discovery | Specialist and factual tools, LLM filtering and ranking, country-aware baseline, publishing lists to the existing UI | E1 |
| E3 | Multilingual and country-aware search | Expands the VS-2 baseline: frozen language set, broader cross-country cases | E1; slice with E2 |
| E4 | Conversation | Multi-turn context, clarification and resume, follow-ups, New Search, refresh restore | E1, E2 |
| E5 | Evaluation and security | Eval sets, compliance checks, security hardening, Route2-vs-Route3 comparison | E0; runs alongside E1–E4 |
| E6 | Future transactions | Parking and booking | MVP done; not in MVP (PR-07) |

---

## Sprint 0 — Delivery setup (before E0)

Sprint 0 is not an Epic. It is the prerequisite for all Epics: E0 does not start until it is complete. Its deliverables are listed in [`ROADMAP.md` §1.1](./ROADMAP.md):

- the contract documents
- IDE-specific rules
- the five development roles: Business Analyst, Solution Architect, Architecture Reviewer, Developer + Vitest, Code Reviewer
  - Playwright E2E is a separate, optional sprint-end stage, not a sixth role.
  - The agents in `docs/route3/README.md` (Preflight, Architect, Developer, Code Review, QA) are legacy references, not approved Route3 roles.
- the Skills Audit. Existing agents and skills are audited and then adapted or replaced in R3-005 / R3-006. They are not modified before then.
- the Workflow
- Git Handoff
- Session Recovery

It changes no application code and no Route2 code.

---

## E0 — Engineering foundation

**Goal:** a place where Route3 can be built and run in development without any effect on Route2.

**In scope**
- **Module:** an isolated Route3 module and the dependency direction rules (AP-02).
- **Packages:** adopt the LangGraph and LangChain packages (AP-04, AP-05).
- **Selector:** the dev-only Route2 / Route3 selector, client and server (PR-06.2, AP-12).
  - Route2 stays the production default (PR-06.3).
  - Only the minimum Route2 touch-points allowed by AP-01.
- **Test harness:** fake chat models and fake external services, no network (AP-15).
- **Regression:** the Route2 test suite runs unchanged as a regression gate.
- **Observability:** baseline per-turn logging that tells Route2 and Route3 traffic apart (AP-16).

**Out of scope:** any orchestrator behavior, tools, prompts or UI features beyond the selector.

**Success criteria**
- With the selector unset, or in production, every request is served by Route2 exactly as before.
- In development, a request can be routed to a Route3 stub and returns a well-formed response.
- The Route2 test suite passes unchanged.
- No file under `server/src/services/search/route2/` changes.
- Route3 tests run with fake models and no network access.

**Owns these open decisions**
- **AQ-14:** LangGraph and LangChain versions, and compatibility with `zod@4` and the installed `langchain@0.3` / `@langchain/openai@0.6`.
- **AQ-10 / PRODUCT Q9:** how the selector is gated, and whether the server refuses Route3 in production.
- **AQ-12:** tracing beyond the structured logger.

---

## E1 — Agent runtime

**Goal:** prove a real autonomous agent loop end to end, with a real LLM and at least one real tool.

**In scope**
- **Graph:** a custom LangGraph `StateGraph` with typed state (AP-04, AP-09 state shape).
- **Orchestrator LLM:** receives every message, including the first (AP-03).
- **The loop:** a real **LLM → Tool → Observation → LLM** loop, with tool calls and `ToolMessage` observations (AP-04, AP-05).
- **Tools:** a tool registry with Zod-validated inputs and outputs, and defined handling of validation failures (AP-08, AP-14).
- **Guardrails:** loop-iteration and tool-call limits, timeouts and token budget (AP-08, AP-14).
- **Turn result:** a structured final result for a turn: reply, question or recommendation list (AQ-09). A question can offer structured choices, and the user may still answer in free text (PR-02.2).
- **Logging:** per-call logging for the loop (AP-16).
- **Vertical slice VS-1** (see ROADMAP).

**Out of scope**
- The full specialist toolset (E2).
- Persistence across requests (E4).
- Multilingual tuning (E3).

**Success criteria**
- In development, a first user message reaches the orchestrator. The orchestrator calls at least one real tool, receives the observation, and produces a final result grounded in it.
- The loop handles each of these without crashing or looping forever:
  - zero tool calls
  - several tool calls
  - a tool error
  - an invalid model output
- Scripted-model tests prove the loop, the limits and the validation handling.
- Logs rebuild the full turn: every LLM and tool call, with latency, tokens and outcome.

**Owns these open decisions**
- **AQ-04:** orchestrator and specialist models and providers.
- **AQ-05 / PRODUCT Q11:** loop limits and the per-turn latency and cost budget.
- **AQ-09:** final output contract (shared with E2 for the list part).

---

## E2 — Restaurant discovery

**Goal:** real restaurant recommendations from Route3, filtered and ranked by the LLM, shown in the existing UI.

**In scope**
- **Specialist tools:** Gate, Intent, the three Mappers and the Constraints capabilities exposed as tools the orchestrator may call (AP-06).
- **Retrieval:** a provider retrieval tool (Google Places) using LLM-chosen parameters.
- **Evidence:** evidence-only factual tools, for example distance, opening-hours coverage and business status (AP-08).
- **LLM filtering and ranking:** done before publishing, with the publish rules of AP-07 / PR-05.1. This includes excluding permanently closed places (PR-05.3).
- **Grounding:** the assistant does not state facts the data does not support (PR-05.4).
- **Country-aware baseline (PR-04.3, AP-11).** This is the first real restaurant search, so the baseline cannot be deferred:
  - **Language never determines search geography.** No language-to-country mapping in prompts or code.
  - **Where to search** comes from the explicit place in the message, GPS or the session location. The orchestrator LLM chooses among them; code does not choose by rule (AP-08).
  - **A change of request language keeps the same search area** when the place, GPS and session are the same.
- **Transport:** publishing results through the existing UI and contracts. Changes are additive only (AP-12, PR-06.1).
- **Order links:** whether Wolt / 10bis / Mishloha links and card actions carry over.
- **Vertical slice VS-2** (see ROADMAP).

**Out of scope**
- Multi-turn context (E4).
- Expanding language coverage beyond the baseline (E3).
- Parking and booking (E6).

**Success criteria**
- For a single-message request in development, Route3 publishes a recommendation list in the existing UI.
- Every published list was selected and ordered by the LLM.
  - No tool or code removed or reordered candidates on business criteria (AP-07, AP-08).
- No permanently closed place appears in a published list on the agreed evaluation set (E5).
- Statements about restaurants are supported by tool observations on the evaluation set.
- Route2 clients and contracts behave unchanged.
- **Country-aware baseline on the evaluation set:**
  - No search area is derived from the request language.
  - Cross-language cases search the intended place. Examples: a Hebrew query about Paris searches France; an English query in Tel Aviv searches Israel.
  - The same request in another language, with the same place, GPS and session, searches the same area.

**Owns these open decisions**
- **AQ-01 / PRODUCT Q4:** transport and contract for Route3 results.
- **AQ-02:** how the specialist capabilities are reused (call Route2 stage functions, wrap them, or rebuild them on LangChain).
- **AQ-06 / PRODUCT Q8:** structure of the LLM filtering and ranking step, the number of candidates, the facts per place, and any quality bar.
- **AQ-08:** which Route2 computations become evidence-only tools.
- **AQ-11 / PRODUCT Q12:** order links and card actions.
- **PRODUCT Q7, Q13:** the unknown-data policy and the dietary bar that the LLM is instructed to apply.
- **PRODUCT Q6 (baseline):** priority among explicit place, GPS and session location, and the fallback. E3 extends it.
- **AQ-13 (baseline):** the client language and location signals, and the `IL` / `OTHER` device-region limit. E3 extends it.

---

## E3 — Multilingual and country-aware search

**Goal:** extend the country-aware baseline delivered in VS-2 (E2) across the frozen language set and multi-turn conversations. Route3 replies in the user's language and never infers country from language. E3 expands this capability; it does not introduce it.

**In scope**
- **Replies:** the orchestrator replies in the user's language (PR-04.2, AP-11).
- **Region:** broader cross-country cases on top of the E2 baseline (PR-04.3, AP-11).
  - No "Hebrew → IL" rule in Route3 prompts or code.
- **Signals:** any extension to the language and location signals defined in the E2 baseline.
- **Language switches:** the explicit place, GPS, session and conversation location are kept when the user changes language, together with E4.
- **Language coverage:** the set frozen by PRODUCT Q5 (PR-04.1).

**Out of scope**
- New UI locales.
- Route2 language or region behavior. It stays as it is (AP-01).

**Success criteria**
- On the evaluation set, replies are in the user's language for every language in the frozen set.
- Cross-language cases search the intended place. Examples: a Hebrew query about Paris searches France; an English query in Tel Aviv searches Israel.
- No Route3 prompt or code maps request language to country.

**Owns these open decisions**
- **PRODUCT Q5:** the frozen language set.
- **PRODUCT Q6, AQ-13:** extensions beyond the E2 baseline only.

---

## E4 — Conversation

**Goal:** a full conversational assistant that keeps search context across turns until New Search.

**In scope**
- **Replies and follow-ups:** the user can reply in free text and refine with follow-ups (PR-01, PR-02.3).
- **Updated results vs answers:** a follow-up that changes constraints produces an updated list. A follow-up that is only a question gets an answer (PR-02.4).
- **Persistence:** context persisted with a LangGraph checkpointer and bound to the authenticated session (AP-09).
- **Clarification:** a clarification ends the turn. The user answers it by **either a structured choice or free text**, and either answer resumes the conversation from the checkpoint and is merged into the current request (PR-02.2, AP-10).
- **Context lifetime:**
  - Explicit New Search resets the context (D-02, PR-03.2).
  - The orchestrator LLM judges topic changes and asks when uncertain (D-02, PR-03.3). There are no deterministic topic rules.
  - A refresh restores the context when the session is valid (D-02, PR-03.4).
- **UI:** the UI shows whether the user is refining or starting over (PR-03.5).
- **Vertical slice VS-3** (see ROADMAP).

**Out of scope**
- Long-term memory across separate searches or users.
- A Critic (AP-17).

**Success criteria**
- **Multi-turn scripts on the evaluation set:**
  - A refine updates the list.
  - A question about the list is answered without needless re-search.
  - A clarification answer is merged into the request, not treated as a new search. This holds for both a structured choice and a free-text answer.
  - A change of language mid-conversation keeps the conversation's location.
- **Context lifetime:**
  - New Search always starts a clean context.
  - A refresh with a valid session restores the conversation.
- **Isolation:** one session can never load or resume another session's conversation.

**Owns these open decisions**
- **PRODUCT Q2 / AQ-03:** checkpointer storage, TTL, and what makes a session "valid".
- **PRODUCT Q3a:** how New Search appears in the UI, and what happens to the clear (X) button.
- **PRODUCT Q3b:** whether a confident topic change resets on its own or confirms first.
- **PRODUCT Q10:** whether the current list stays on screen during a question-only turn.

---

## E5 — Evaluation and security

**Goal:** evidence that Route3 meets the product contract and is safe, before anyone considers it beyond development.

**In scope**
- **Evaluation sets:** discovery, constraints, multilingual and cross-country, multi-turn conversation, clarification, and grounding. They are built up as E1–E4 deliver.
- **Compliance checks:** checks for PR-05 (publish gate, permanently closed, explicit constraints, grounding). They follow AQ-07: a check may reject an output back to the LLM, but never removes or reorders places itself.
- **Security** (AP-14):
  - prompt-injection cases (user text and tool output as data)
  - tool allowlist
  - auth and ownership on every transport
  - session isolation of conversations
  - no secrets in logs or stored state
  - model-string caps and budgets
- **Comparison:** Route2 vs Route3 quality, latency and cost on the same evaluation set (AP-16, PRODUCT Q11).

**Out of scope**
- A Critic or self-review LLM (AP-17).
- Production rollout itself.

**Success criteria**
- Every Route3 slice has evaluation cases, and they run repeatably.
- PR-05 compliance and security cases pass at the agreed thresholds.
- Per-turn latency and cost are measured against the agreed budget.

**Owns these open decisions**
- **AQ-07:** how compliance with PR-05.3 and explicit constraints is verified.
- **R-Q2 (new):** evaluation thresholds that count as a "pass" for MVP readiness.

---

## E6 — Future transactions (not MVP)

**Goal:** parking information and table booking, after MVP (PR-07).

**In MVP**
- **No implementation.**
- The other Epics must not block adding these later (PR-07.2).
- If a user asks for parking or booking, the assistant says it is not supported yet and continues (PR-07.3). That behavior is delivered in E2 / E4 as part of normal replies.

**Success criteria (MVP):** none beyond PR-07.3. This Epic is planned only after the MVP and a new product decision.

**Owns these open decisions**
- **R-Q3 (new):** scope, providers and priority of parking and booking after the MVP.
