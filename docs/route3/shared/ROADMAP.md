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
| P0 | Contracts | Sprint 0 docs | PRODUCT, ARCHITECTURE-PRINCIPLES, ROADMAP and EPICS approved |
| P1 | Foundation + walking skeleton | E0, E1, E5 (start) | **VS-1** works in development |
| P2 | Discovery slice | E2, E5 | **VS-2** works in development in the existing UI |
| P3 | Conversation + multilingual | E4, E3, E5 | **VS-3** works in development, multilingual and cross-country |
| P4 | MVP readiness | E5 (completion), fixes across E1–E4 | Evaluation and security thresholds met; MVP readiness reviewed |
| P5 | Future transactions | E6 | Only after MVP and a new product decision |

- **E5** starts in P1 and grows with every slice. It is not a final phase only.
- **E3** may begin in P2 once VS-2 publishes lists. Its acceptance belongs to P3.

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

### VS-3 — Conversation (P3: E4 + E3)

**Proves:** the full conversational assistant.

- Free-text clarification, then a resume from the checkpoint.
- A follow-up refine updates the list.
- A question-only follow-up gets an answer.
- New Search resets the context.
- A refresh restores it.
- The orchestrator judges topic changes.
- It works in the frozen language set and searches the intended country regardless of language.

---

## 3. Dependencies

```
P0 docs
  └─► E0 Foundation ──► E1 Agent runtime (VS-1)
                            ├─► E2 Discovery (VS-2) ──┬─► E4 Conversation (VS-3)
                            │                         │
                            └─► E3 Multilingual ◄─────┘  (acceptance with VS-3)
E5 Evaluation & security: starts with E0's test harness, then gates every slice and P4
E6 Future transactions: after MVP only
```

| Epic | Hard dependencies | Why |
|------|-------------------|-----|
| E0 | P0 approved | Principles and contract must be fixed first |
| E1 | E0 | Needs the isolated module, the selector, packages and the test harness |
| E2 | E1 | Tools plug into the loop. The publish rules need the turn-result contract |
| E3 | E1; E2 for acceptance | Language and region affect tool inputs and published lists |
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

### Before P3 (E4, E3)

| Item | Owner | Blocks |
|------|-------|--------|
| PRODUCT Q2 / AQ-03: checkpointer storage, TTL, valid-session rule | E4 | Persistence, refresh restore |
| PRODUCT Q3a: New Search UI; fate of the clear (X) button | E4 | VS-3 UI |
| PRODUCT Q3b: confident topic change — reset on its own or confirm | E4 | VS-3 topic handling |
| PRODUCT Q10: list stays visible on a question-only turn | E4 | VS-3 UI |
| PRODUCT Q5: frozen language set | E3 | E3 acceptance |
| PRODUCT Q6: region source priority and fallback | E3 | E3 acceptance |
| AQ-13: client language and location signals; `IL` / `OTHER` limit | E3 | E3 inputs |

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
