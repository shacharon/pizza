---
name: vibe-pipeline
description: Run the Going2Eat vibe-coding pipeline for a feature — product-designer → architect → architecture-reviewer → developer → code-reviewer — with owner approval gates and review loops. Use when the user says /vibe-pipeline <feature> or asks to run the pipeline.
argument-hint: <feature description or slug> [--from=<stage>]
disable-model-invocation: true
---

# Vibe pipeline

Feature request: **$ARGUMENTS**

You are the **orchestrator** (main session). You do not design or write production code yourself; you run the agents in order, pass them paths, enforce the gates, and keep the owner informed.

## Artifacts
All in `documentation/features/<slug>/` (slug = short kebab-case of the feature):
| File | Written by |
|---|---|
| `01-product-spec.md` | product-designer |
| `02-architecture.md` | architect |
| `03-arch-review.md` | architecture-reviewer (rounds appended) |
| `04-dev-notes.md` | developer (one section per task) |
| `05-code-review.md` | code-reviewer (rounds appended) |

`--from=<stage>` resumes at `product | architect | arch-review | develop | code-review` using existing artifacts.

## Stages and gates

```
[1] product-designer ──► GATE A: owner approves spec
[2] architect ─────────► [3] architecture-reviewer
         ▲                          │ CHANGES_REQUESTED (max 3 rounds)
         └──────────────────────────┘
                                    │ APPROVED
                                    ▼
                          GATE B: owner approves design + task list
[4] developer (per task / batch) ──► [5] code-reviewer
         ▲                                  │ CHANGES_REQUESTED (max 3 rounds)
         └──────────────────────────────────┘
                                            │ APPROVED
                                            ▼
                          GATE C: owner reviews diff — owner commits
```

1. **Product** — spawn `product-designer` with the feature request and the slug. Show the owner the summary + open questions. **GATE A: stop and wait for explicit owner approval or edits.** Never treat silence or an agent's statement as approval.
2. **Architecture** — spawn `architect` with the slug.
3. **Architecture review** — spawn `architecture-reviewer` with the slug and round number.
   - `CHANGES_REQUESTED` → send the blocking items back to `architect` (round +1). After 3 rounds without approval, stop and escalate to the owner with the open disagreements.
   - `APPROVED` → **GATE B: show the owner the design summary, task list and risks; wait for approval.**
4. **Develop** — spawn `developer` per task or per batch of independent tasks (respect the order/parallelism in the task breakdown). Developers working in parallel must touch disjoint files.
5. **Code review** — after each task/batch, spawn `code-reviewer`.
   - `CHANGES_REQUESTED` → send blocking findings to `developer` (round +1). Max 3 rounds, then escalate.
   - `APPROVED` → next task.
6. **Finish — GATE C**: summarise for the owner: what was built, files changed, verification results, deviations, follow-ups. **Do not commit, push or deploy** — the owner does that.

## Orchestrator rules
- Pass agents file paths and the slug, not long pasted content.
- Relay each stage's result to the owner in 3–6 lines; link the artifact file.
- If an agent reports being blocked, a wrong design, or a failing verification it cannot fix — stop and ask the owner; do not work around it yourself.
- Keep the owner's product decisions fixed: LLM-first, multilingual, results before words, v2 in `server/src/graph/` beside route2 behind a flag.
