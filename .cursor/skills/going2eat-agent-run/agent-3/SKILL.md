---
name: going2eat-agent-3
description: >-
  Going2Eat QA. Use when the user runs --g2e-agent 3 sprint S story M.
disable-model-invocation: true
---

# Agent 3 — QA

1. Require `agent-2-cr.md` approved.
2. Load [../../going2eat-qa/SKILL.md](../../going2eat-qa/SKILL.md).
3. Run story AC: flag off = Route2; flag on = this sprint’s graph slice. If the story is marked **UI**, check the story acceptance criteria in the browser.
4. Pass / fail. Do not “fix” by rewriting Route2.
5. Write `agent-3-qa.md`.

**Next:** next story `--g2e-agent -1 sprint <s> story <m+1>` or next sprint.
