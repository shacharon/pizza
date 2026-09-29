---
name: going2eat-agent-run
description: >-
  Run Going2Eat sprint agents with --g2e-agent N sprint S story M. Route3 and
  other angular-piza stories. Never Dating agents or dating-api paths.
disable-model-invocation: true
---

# Going2Eat Agent Run

One agent per user message. Repo: **`angular-piza`**. Not Dating.

```text
--g2e-agent <n> sprint <s> story <m>
```

| Agent | Step | Role |
|-------|------|------|
| **-1** | [agent--1/SKILL.md](./agent--1/SKILL.md) | Preflight |
| **0** | [agent-0/SKILL.md](./agent-0/SKILL.md) | [going2eat-architect](../going2eat-architect/SKILL.md) |
| **1** | [agent-1/SKILL.md](./agent-1/SKILL.md) | [going2eat-developer](../going2eat-developer/SKILL.md) |
| **2** | [agent-2/SKILL.md](./agent-2/SKILL.md) | [going2eat-code-review](../going2eat-code-review/SKILL.md) |
| **3** | [agent-3/SKILL.md](./agent-3/SKILL.md) | [going2eat-qa](../going2eat-qa/SKILL.md) |

Do not auto-chain. Wait for the user.

## Resolve story

`docs/route3/sprint-<ss>-*/README.md` row **m** → story file.  
Handoffs: `docs/route3/<sprint>/handoffs/<story-slug>/`

Prior handoffs: 0 needs -1 ready; 1 needs 0; 2 needs 1; 3 needs 2.

## Isolation

- Code: `angular-piza/server` (Route3), not `dating-api`
- Do not load `dating-agent-run` or dating first-upload
- Route3: wrap Route2 stages; do not rewrite Gate2/Intent/Google

## UI sprint

If the story is marked **UI** (Sprint 07, or a Sprint 08 story marked UI), ignore Route3 graph rules for that story:

- Code is `llm-angular` only. Do not edit `server/`.
- Architect designs the files named in the story, not `route3/` nodes.
- Developer implements that design.
- QA checks the story acceptance criteria in the browser, not Route2 flag-off.

## Reply

```markdown
## Done: --g2e-agent <n> sprint <s> story <m>
**Handoff:** `docs/route3/...`
**Next:** `--g2e-agent <next> sprint <s> story <m>`
```
