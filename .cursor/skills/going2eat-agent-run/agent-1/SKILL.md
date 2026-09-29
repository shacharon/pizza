---
name: going2eat-agent-1
description: >-
  Going2Eat developer. Use when the user runs --g2e-agent 1 sprint S story M.
disable-model-invocation: true
---

# Agent 1 — Developer

1. Require `agent-0-architect.md`.
2. Load [../../going2eat-developer/SKILL.md](../../going2eat-developer/SKILL.md).
3. Implement in `angular-piza/server` per architect. Do not rewrite Route2 stages. If the story is marked **UI**, implement in `llm-angular` only.
4. Smoke the flag-off path (Route2 still default). Full test suite is Agent 2.
5. Write `agent-1-dev.md`. Commit only if the user asked.

**Next:** `--g2e-agent 2 sprint <s> story <m>`
