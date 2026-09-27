# Route3 — sprints and agents

Plan for a LangGraph Route3 **on top of** Route2. Stories are in this folder. Agents are Going2Eat-only (see below).

## Agents — Do we already have them?

| Role | Dating (`dating` repo) | Going2Eat (`angular-piza`) |
|------|------------------------|----------------------------|
| Architect | yes (`--agent 0`) | **no** (until Sprint 00) |
| Developer | yes (`--agent 1`) | **no** |
| Code review | yes (`--agent 2`) | **no** |
| QA / e2e | yes (agent 4 / first-upload QA) | **no** |
| Angular / UX | dating agent 3.5 | **not needed for Route3** (backend graph) |
| Deploy | — | `going2eat-deploy` only (not a sprint CR loop) |

**Do not use Dating agents for this work.** They encode Nest/Prisma/matching rules and will fight Going2Eat.

**Sprint 00** is the agent pipeline. Run it (or treat skills as landed if already in `.cursor/skills/going2eat-agent-run`) **before** Route3 implementation stories.

## Command

```text
--g2e-agent <n> sprint <s> story <m>
```

Example: `--g2e-agent 0 sprint 1 story 1`

| n | Role |
|---|------|
| -1 | Preflight |
| 0 | Architect (design only) |
| 1 | Developer |
| 2 | Code review |
| 3 | QA |

Order: `-1 → 0 → 1 → 2 → 3`. Do not auto-chain.

## Sprint map

| Sprint | Folder | Purpose |
|--------|--------|---------|
| 00 | [sprint-00-agent-pipeline](./sprint-00-agent-pipeline/README.md) | Going2Eat architect/dev/CR/QA skills |
| 01 | [sprint-01-graph-skeleton](./sprint-01-graph-skeleton/README.md) | Flag + empty graph + Route2 still default |
| 02 | [sprint-02-gate](./sprint-02-gate/README.md) | Gate node + STOP/CLARIFY/CONTINUE edges |
| 03 | [sprint-03-intent-route-llm](./sprint-03-intent-route-llm/README.md) | Intent + Route-LLM nodes |
| 04 | [sprint-04-google-rank](./sprint-04-google-rank/README.md) | Google + baseline rank |
| 05 | [sprint-05-enrich-parity](./sprint-05-enrich-parity/README.md) | Enrich + response parity |
| 06 | [sprint-06-optional-lcel](./sprint-06-optional-lcel/README.md) | Optional LCEL inside Gate2 call only |
| 07 | [sprint-07-order-buttons](./sprint-07-order-buttons/README.md) | UI: order buttons, press, results fade. Not Route3 |
| 08 | [sprint-08-good-search](./sprint-08-good-search/README.md) | Show places without location, then a helper to narrow. Not Route3 |
| 09 | [sprint-09-gate-and-near-me](./sprint-09-gate-and-near-me/README.md) | Food typos still search. Near me stays inside the circle |

Epic: [EPIC_ROUTE3.md](./EPIC_ROUTE3.md)
