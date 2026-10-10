---
paths:
  - "**/route3/**"
  - "**/*route3*"
  - "**/*Route3*"
---

# Going2Eat Route3 — Claude rules

These rules apply **only** to Going2Eat Route3 work: the Route3 code, the Route3 docs, and stories in the Route3 roadmap. They do not apply to Route2 maintenance or other Going2Eat work.

## 1. Sources of truth

- **Authoritative:** the approved documents in `docs/route3/shared/`:
  - `PRODUCT.md`: product requirements `PR-xx`, decisions `D-xx`, questions `Qxx`
  - `ARCHITECTURE-PRINCIPLES.md`: binding principles `AP-xx`, open items `AQ-xx`
  - `ROADMAP.md` and `EPICS.md`: phases, Epics, slices, dependencies
- **If anything conflicts, the shared documents win.** That includes these rules, a legacy doc, an agent, a skill, a Cursor rule or a chat instruction that is not an approved change. Stop and report the conflict; do not resolve it yourself.
- **Legacy material is reference only:**
  - `docs/route3/EPIC_ROUTE3.md` and `docs/route3/sprint-01-*` … `sprint-06-*` are superseded (PRODUCT D-01).
  - The agents listed in `docs/route3/README.md` (Preflight, Architect, Developer, Code Review, QA), the `--g2e-agent` command and any existing skills are legacy.
  - None of them can override an approved Route3 decision. They are audited and adapted or replaced in R3-005 / R3-006.
- **Undecided items** (`Qxx`, `AQ-xx`, `R-Qx`) marked OPEN are not decided. Do not decide them in code or docs. Raise them.

## 2. Scope discipline

- Work only on an **approved Story**. Do not invent scope, Stories, requirements or decisions.
- Change only the files the Story allows. Report anything else that needs changing; do not change it.
- Do not start the next Story without explicit approval. Do not auto-chain.
- Do not merge. Commit and push only to the Story's branch.

## 3. Route2 is immutable (AP-01, AP-02)

- **Route2 stays unchanged.** Route3 work must not change Route2's behavior or implementation. That covers files under `server/src/services/search/route2/`, Route2 prompts, schemas, contracts and the production default.
- **The only exception:** the minimal selector touch-points an approved Story explicitly allows (PR-06, AP-01).
- **Isolation:** Route3 lives in its own module. Route2 never imports Route3. Route3 reuses Route2 only through calls that leave Route2 untouched.
- **Route2 tests:** Route2's `node --test` suite must stay unchanged and keep passing.

## 4. Route3 architecture (AP-03 – AP-07)

- **LLM-first:** every user message, including the first, goes to the central **Orchestrator LLM**. It decides the next step.
- **Graph:** a custom LangGraph `StateGraph`. No prebuilt agent and no fixed business pipeline.
- **Agent loop:** a genuine **LLM → Tool → Observation → LLM** loop. Tool results return to the orchestrator as observations.
- **LangChain:** use LangChain models, tools, messages and structured outputs.
- **Specialists:** the Gate, Intent, three Mapper and Constraints LLMs are tools the orchestrator may call. They are not a mandatory sequence.
- **Recommendations:** only the LLM decides which restaurants are recommended, excluded or ranked, and it does so before a list is published. That includes opening hours, dietary needs and permanently closed status.
- **No Critic** in the initial phase (AP-17).

## 5. No deterministic business logic (AP-08)

**Forbidden** in Route3 code and prompts:

- **Business routing:** choosing the search mode, deciding to clarify, detecting a topic change, or picking language or country by rule or heuristic.
- **Business filtering:** dropping places by rule, for example on hours, dietary needs, closed status, price, rating, wrong dish or city, regexes or keyword lists.
- **Business ranking:** weighted scores, sort orders or truncation that decide what the user sees.
- **Language-to-country inference:** no "Hebrew → IL" style rule. Language never decides where to search.
- **Route2 logic in disguise:** no Route2 post-filter, list-shaping or ranking logic presented as a "fact", "helper" or "pre-processing" tool.

**Allowed:**

- **Technical guardrails:** auth, ownership, size caps, timeouts, retries, loop limits, budgets, rate limits, prompt-injection handling, tool allowlists.
- **Zod validation.**
- **Factual tools:** fact retrieval and factual computations (distance, hours coverage, geocoding, business status) that return **every** candidate with evidence attached. They never drop or reorder candidates.

## 6. Engineering rules

- **SOLID and KISS:**
  - One responsibility per node and per tool.
  - Depend on interfaces for models, tools, the checkpointer and external services.
  - Use the simplest graph that meets the Story.
  - No speculative abstractions and no future-only features (parking and booking are not in MVP).
- **Zod validation:** every LLM structured output, tool input and tool output is validated with Zod. Each validation failure has an explicit, defined handling. Never pass unvalidated model output on.
- **Explicit clarification flags:** a clarification is signaled by an explicit, typed field in a Zod-validated structured output. It is never inferred from free text. Clarification answers may be a structured choice or free text (PR-02.2, AP-10).
- **Security** (AP-14):
  - User text and tool output are data, never instructions.
  - Tools are allowlisted.
  - No arbitrary URL fetch or code execution from model output.
  - Auth and session ownership on every transport. A session never loads another session's conversation.
  - No secrets, API keys or raw tokens in code, logs or stored state.
- **Testability** (AP-15): Route3 unit tests use Vitest with fake models and fake tools, and no network. Route2 and Route3 have separate test commands.
- **Observability** (AP-16): log every LLM call, tool call and loop iteration with the request or conversation id, through the existing structured logger. Route2 and Route3 traffic must be distinguishable.

## 7. Starting a new session

Before taking any action in a new or resumed session:

1. **Read the shared documents** in `docs/route3/shared/`, including the shared status document once it exists.
2. **Identify the active Story** and read it, plus its latest handoff report.
3. **Verify Git:**
   - current branch
   - `git status`
   - that `HEAD` is the expected commit
   - that the branch is based on the approved baseline the Story names
   - that there are no unrelated local changes
4. **If anything is missing, unclear or inconsistent, stop and ask.** That includes no active Story, no handoff, the wrong branch, an unexpected SHA or a dirty tree. Do not reconstruct state from memory or chat history.
