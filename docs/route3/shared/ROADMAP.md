# Going2Eat Route3 — Roadmap

**Story:** R3-003 (Sprint 0)
**Status:** Draft for approval
**Depends on:** [`PRODUCT.md`](./PRODUCT.md), [`ARCHITECTURE-PRINCIPLES.md`](./ARCHITECTURE-PRINCIPLES.md).
**Epic details:** [`EPICS.md`](./EPICS.md).

This roadmap sets the **order** of delivery, the **vertical slices** that prove progress, the **dependencies**, and the **decisions that must be made** before each phase. It has no dates, sprint plans or stories.

**Constant across all phases:**
- Route2 stays the production default and unchanged (AP-01, PR-06.3).
- All Route3 work runs behind the dev-only selector (PR-06.2).

---

## 1. Phases

| Phase | Name | Epics | Exit (summary) |
|-------|------|-------|----------------|
| P0 | Sprint 0: contracts and delivery setup | Sprint 0 (see §1.1) | Contract documents approved **and** the delivery setup in §1.1 in place |
| P1 | Foundation + walking skeleton | E0, E1, E5 (start) | **VS-1** works in development |
| P2 | Discovery slice | E2, E5 | **VS-2** works in development in the existing UI, with the country-aware baseline |
| P3 | Conversation + multilingual | E4, E3, E5 | **VS-3** works in development; E3 expands multilingual and cross-country coverage |
| P4 | MVP readiness | E5 (completion), fixes across E1–E4 | Evaluation and security thresholds met; MVP readiness reviewed |
| P5 | Future transactions | E6 | Only after MVP and a new product decision |

- **E5** starts in P1 and grows with every slice. It is not a final phase only.
- **Country-aware search is not deferred to E3.** The baseline is part of VS-2 (E2). E3 expands it in P3; it does not introduce it.

### 1.1 P0 — Sprint 0 scope

Sprint 0 delivers the contracts **and** the way Route3 work is done. P1 does not start until all of the following are in place.

| Deliverable | What it covers |
|-------------|----------------|
| Contract documents | `PRODUCT.md` (R3-001), `ARCHITECTURE-PRINCIPLES.md` (R3-002), `ROADMAP.md` and `EPICS.md` (R3-003), approved. |
| IDE-specific rules | Route3 rules for each IDE used on Route3 work. Cursor (`.cursor/rules/`) and Claude Code are in use today. The rules encode at least: Route2 is immutable (AP-01), Route3 is isolated (AP-02), no deterministic business routing, filtering or ranking (AP-08), and story scope limits. |
| Five development agents | The Going2Eat roles already named in `docs/route3/README.md`: **Preflight**, **Architect**, **Developer**, **Code Review**, **QA**. Going2Eat-only; Dating agents are not used. Each is updated to the Route3 contracts above. |
| Skills Audit | An inventory of the agent skills that exist versus those the docs reference. `docs/route3/README.md` points to `.cursor/skills/going2eat-agent-run`, but this repository currently contains only `.cursor/skills/obslete-files`. The audit records what is present, missing or obsolete, and what must be rebuilt for the five agents. |
| Workflow | The story workflow across the five agents: order, approval gates, independent review before approval, no auto-chaining, and the stop points. |
| Git Handoff | The branch, commit and push rules for each story. A dedicated branch from the approved baseline; only the story's files committed; no unrelated local changes; no merge without approval. A handoff report gives the branch, SHA, corrections and open questions. |
| Session Recovery | How an interrupted or new agent session resumes a story from repository state (branch, handoff report, story docs) rather than chat history, and how it confirms the approved baseline before continuing. |

Sprint 0 changes no application code and no Route2 code.

---

## 2. Vertical slices

Each slice goes end to end in development: UI or HTTP in, Route3 graph, real LLM, real tool, response out. It is built only as far as its slice needs. Each slice ships with its evaluation cases (E5).

### VS-1 — Real agent loop (P1: E0 + E1)

**Proves:** a real **LLM → Tool → Observation → LLM** loop.

1. A first user message is selected to Route3 in development.
2. The orchestrator LLM decides to call at least one real tool.
3. The tool result returns to the orchestrator as an observation.
4. The orchestrator produces a grounded final result.

**Rules:**
- Tool calls are validated with Zod.
- Loop limits apply.
- The full turn is visible in the logs.
- If VS-1 shows restaurants at all, AP-07 applies: the LLM selects and orders them.

**Not yet:** persistence, the full toolset, multilingual policy.

### VS-2 — Single-turn discovery (P2: E2)

**Proves:** trustworthy recommendations from one message.

- The orchestrator uses specialist and retrieval tools, plus evidence-only factual tools.
- It filters and ranks with the LLM, then publishes a recommendation list in the **existing UI**.

**Rules:**
- PR-05.1 publish gate: no unfiltered, unranked, partial or provider-ordered list.
- PR-05.3: no permanently closed place.
- PR-05.4: grounded statements only.
- No deterministic business filtering or ranking (AP-08).
- **Country-aware baseline (PR-04.3, AP-11):** this is the first real restaurant search, so it already meets the baseline:
  - **Language never determines where to search.** No language-to-country mapping in prompts or code.
  - **Where to search** comes from the explicit place in the message, GPS or the session location. The orchestrator LLM chooses among them; code does not pick by rule (AP-08).
  - **Changing the language of the request does not change where to search.** The same request in another language, with the same place, GPS and session, searches the same area.

### VS-3 — Conversation (P3: E4 + E3)

**Proves:** the full conversational assistant.

- A clarification answered by **either a structured choice or free text**, then a resume from the checkpoint (PR-02.2, AP-10).
- A follow-up refine updates the list.
- A question-only follow-up gets an answer.
- New Search resets the context.
- A refresh restores it.
- The orchestrator judges topic changes.
- The conversation's location is kept when the user switches language mid-conversation.
- E3 expands coverage to the frozen language set and broader cross-country cases. The country-aware baseline already exists from VS-2.

---

## 3. Dependencies

```
P0 Sprint 0 (contracts + rules, agents, skills audit, workflow, git handoff, session recovery)
  └─► E0 Foundation ──► E1 Agent runtime (VS-1)
                            ├─► E2 Discovery (VS-2) ──┬─► E4 Conversation (VS-3)
                            │                         │
                            └─► E3 Multilingual ◄─────┘  (acceptance with VS-3)
E5 Evaluation & security: starts with E0's test harness, then gates every slice and P4
E6 Future transactions: after MVP only
```

| Epic | Hard dependencies | Why |
|------|-------------------|-----|
| E0 | P0 complete | Contracts, rules, agents, workflow and handoff must be in place first |
| E1 | E0 | Needs the isolated module, the selector, packages and the test harness |
| E2 | E1 | Tools plug into the loop. The publish rules need the turn-result contract. Delivers the country-aware baseline |
| E3 | E1; E2 for acceptance | Language and region affect tool inputs and published lists. E3 expands the country-aware baseline that E2 delivers in VS-2 |
| E4 | E1, E2 | Context and refines operate on published lists and on graph state |
| E5 | E0 (harness); each slice | Eval cases ship with each slice. P4 needs all of E1–E4 |
| E6 | MVP complete + product decision | PR-07 |

---

## 4. Decisions required before each phase

These are listed by phase. Items are taken from PRODUCT §4 and ARCHITECTURE §3, and each is owned by an Epic. **Nothing here is decided by this document.**

### Before P1 (E0, E1)

| Item | Owner | Blocks |
|------|-------|--------|
| AQ-14: LangGraph / LangChain versions; `zod@4` compatibility | E0 | E0 setup |
| AQ-10 / PRODUCT Q9: selector gating; does the server refuse Route3 in production | E0 | E0 selector |
| AQ-04: orchestrator and specialist models and providers | E1 | VS-1 |
| AQ-05 / PRODUCT Q11: loop limits; per-turn latency and cost budget | E1 | VS-1 limits |
| AQ-09 (reply / question part): final turn-result contract | E1 | VS-1 output |
| AQ-12: tracing beyond the structured logger | E0 | Not blocking; default is the existing logger |

### Before P2 (E2)

| Item | Owner | Blocks |
|------|-------|--------|
| AQ-01 / PRODUCT Q4: transport and contract for Route3 results in the existing UI | E2 | VS-2 UI |
| AQ-02: how the specialist capabilities are reused | E2 | VS-2 tools |
| AQ-06 / PRODUCT Q8: LLM filtering and ranking structure; candidates and facts; quality bar | E2 | VS-2 publish gate |
| AQ-08: which Route2 computations become evidence-only tools | E2 | VS-2 tools |
| AQ-09 (list part): recommendation-list result schema | E1 / E2 | VS-2 output |
| PRODUCT Q7, Q13: unknown-data policy per constraint; dietary bar | E2 | VS-2 constraint handling |
| AQ-07: how PR-05 compliance is verified | E5 | VS-2 acceptance |
| AQ-11 / PRODUCT Q12: order links and card actions | E2 | Not blocking VS-2; blocks MVP |
| PRODUCT Q6: priority among explicit place, GPS and session location, and the fallback when none is known | E2 (baseline); E3 extends | VS-2 country-aware baseline |
| AQ-13: client language and location signals sent to Route3; handling of the `IL` / `OTHER` device-region limit | E2 (baseline); E3 extends | VS-2 country-aware baseline |

### Before P3 (E4, E3)

| Item | Owner | Blocks |
|------|-------|--------|
| PRODUCT Q2 / AQ-03: checkpointer storage, TTL, valid-session rule | E4 | Persistence, refresh restore |
| PRODUCT Q3a: New Search UI; fate of the clear (X) button | E4 | VS-3 UI |
| PRODUCT Q3b: confident topic change — reset on its own or confirm | E4 | VS-3 topic handling |
| PRODUCT Q10: list stays visible on a question-only turn | E4 | VS-3 UI |
| PRODUCT Q5: frozen language set | E3 | E3 acceptance |

### Before P4 (MVP readiness)

| Item | Owner | Blocks |
|------|-------|--------|
| R-Q1 (new): what "MVP ready" means for Route3. Exit criteria, and who decides any change to the production default. PR-06.3 keeps Route2 as the default until then. | Product | P4 exit |
| R-Q2 (new): evaluation pass thresholds | E5 | P4 exit |

### P5

| Item | Owner | Blocks |
|------|-------|--------|
| R-Q3 (new): parking and booking scope, providers and priority | E6 | P5 start |

---

## 5. Rules for planning sprints from this roadmap

- **One Epic at a time:** sprints and stories are written per Epic, after this roadmap is approved, and in phase order.
- **Undecided items:** a story must not depend on an undecided item from §4. Either the item is decided first, or the story is limited to work that does not need it.
- **Principles:** every story cites the `PR-xx` and `AP-xx` it implements and must not break any binding principle.
- **Legacy plan:** legacy `docs/route3/` sprints 01–06 are superseded (PRODUCT D-01) and are not used for planning.
