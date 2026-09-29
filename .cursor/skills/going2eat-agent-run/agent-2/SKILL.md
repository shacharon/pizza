---
name: going2eat-agent-2
description: >-
  Going2Eat code review. Use when the user runs --g2e-agent 2 sprint S story M.
disable-model-invocation: true
---

# Agent 2 — Code review

1. Require `agent-1-dev.md`.
2. Load [../../going2eat-code-review/SKILL.md](../../going2eat-code-review/SKILL.md).
3. Review + tests. Reject if Route2 internals changed without story AC, or if LangGraph became an agent/tools loop.
4. Write `agent-2-cr.md`.

**Next:** `--g2e-agent 3 sprint <s> story <m>` (or `--g2e-agent 1` if rejected)
