# Going2Eat (angular-piza)

## Is this a Route3 task?

A task is **Route3** only if:

- it identifies an approved Route3 Story (`R3-…`). That includes Sprint 0 governance Stories (rules, agents, skills, workflow, handoff, recovery), or
- the user explicitly says the change is for the Route3 engine.

**A directory path alone never makes a task Route3.** `docs/route3/` also holds legacy Route2 work.

**Not Route3:**
- Route2 work, including the legacy sprints 07–10 under `docs/route3/` and any other legacy Route2 docs there
- Angular UI work outside a Route3 Story
- infrastructure and deploys

**Unclear scope:** the request mentions Route3 or touches `docs/route3/`, but names no approved `R3-…` Story and no engine.
- Ask which applies.
- **Do not edit anything until the user answers.**
- Do not apply Route3 restrictions in the meantime.

## Route3 tasks

Before doing anything else:

1. Read the approved shared documents in `docs/route3/shared/`: `PRODUCT.md`, `ARCHITECTURE-PRINCIPLES.md`, `ROADMAP.md` and `EPICS.md`.
2. Read `.claude/rules/route3.md` and follow it.

The shared documents are authoritative.

**STATUS and HANDOFF files are planned, not yet present.** They arrive with R3-007 / R3-008. Until then, a missing status or handoff file does not block a Sprint 0 Story. Work from the Story brief given in the request instead.

## Everything else

- Route3-specific requirements do not apply to Route2 or other work. That includes the LLM-first architecture, the ban on deterministic business logic and Vitest.
- Work as usual, within the scope of the request.
