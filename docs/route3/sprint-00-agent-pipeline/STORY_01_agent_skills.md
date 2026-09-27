# Story 01 — Going2Eat sprint agents

**Sprint 00 · Status: landed in repo (skills + this docs tree)**

## Why

Dating `--agent` is Nest/Prisma/matching. Going2Eat needs its own loop: architect → developer → CR → QA.

## Scope

- Orchestrator skill `going2eat-agent-run` (`--g2e-agent`)
- Roles: architect, developer, code-review, QA
- Handoff template
- Isolation: `angular-piza` only

## Acceptance criteria

- [x] `--g2e-agent <n> sprint <s> story <m>` documented
- [x] Dating agent-run not referenced as the runner
- [x] Route3 constraints in developer/CR skills (no Route2 rewrite, flag off)

## Notes

If skills are missing in a clone, this story is “rebuild skills,” not Route3 code.
