# claudeDocs — Going2Eat backend review (2026-10-10)

Backend review of `server/src/` written by Claude. Branch `refactor/phase-1-hygiene`.

| File | What | Status |
|---|---|---|
| [01-tech-stack.md](01-tech-stack.md) | Runtime, libraries, external services | done |
| [02-high-level-architecture.md](02-high-level-architecture.md) | Boxes and arrows: client ↔ API ↔ pipeline ↔ providers | done |
| [03-route2-flow.md](03-route2-flow.md) | Low-level, step-by-step route2 search pipeline | done |
| [04-assistant-and-enrichment.md](04-assistant-and-enrichment.md) | Assistant/narrator + Wolt/10bis/Mishloha enrichment | done |
| [05-solid-services.md](05-solid-services.md) | Services/classes, responsibilities, SOLID assessment | done |
| [06-review-findings.md](06-review-findings.md) | Bugs, risks, tech debt, ranked | done |
| [07-as-is-agent-architecture.md](07-as-is-agent-architecture.md) | Runtime trace API→response, LLM call inventory, active vs legacy, state, guardrails, exit conditions | done |
| [08-tests-observability-failures.md](08-tests-observability-failures.md) | Test inventory + run results, observability, retries/timeouts/fallbacks/error taxonomy | done |
| [12-agent-architecture-understanding.md](12-agent-architecture-understanding.md) | **Current: autonomous agent target — understanding, open questions, conflicts with skills, risks** | for confirmation |
| [11-llm-first-flow-proposal.md](11-llm-first-flow-proposal.md) | Fixed-workflow proposal | **superseded by 12** |
| [10-langgraph-plan.md](10-langgraph-plan.md) | Fixed-workflow LangGraph plan | **superseded by 12** |
| [09-as-is-hld-and-langgraph-gaps.md](09-as-is-hld-and-langgraph-gaps.md) | As-Is HLD (mermaid), component map, evidence-backed LangGraph migration gaps G1–G29 | done |

Notes:
- **Start with 07 → 09** for the agent/LangGraph question. 01–06 are the general backend review.
- Verdict: route2 is a fixed LLM-classifier pipeline, **not an agent** (no tool calls, no loop, LangChain installed but unused).
- `server/src/graph/` (the planned LangGraph v2 engine) **does not exist yet**. route2 is the only search pipeline.
- Line numbers are from the review date and will drift.
