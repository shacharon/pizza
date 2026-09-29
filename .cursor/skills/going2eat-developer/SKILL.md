---
name: going2eat-developer
description: >-
  Developer role for Going2Eat server (Express Route2/Route3). Loaded by
  --g2e-agent 1. Not Dating Nest/Prisma.
disable-model-invocation: true
---

# Going2Eat Developer

Implement the architect handoff in `angular-piza/server`.

If the story is marked **UI**, implement in `llm-angular` only. Do not edit `server/`.

## Do

- Add Route3 files; tiny controller flag branch when the story says so
- Reuse `executeGate2Stage`, `executeIntentStage`, `executeRouteLLM`, `executeGoogleMapsStage`, existing guards/filters/enrich
- Keep `pipelineVersion` logs distinguishable (`route3` vs `route2`)

## Do not

- Edit Gate2/Intent/mapper/Google stage internals
- Turn the graph into an LLM tool agent
- Enable Route3 by default
- Change Angular unless a story explicitly says UI

Follow `.cursor/rules/backend.mdc` (thin controllers, pino, no stack traces).
