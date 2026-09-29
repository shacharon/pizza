---
name: going2eat-architect
description: >-
  Architect role for Going2Eat Route3 and server search. Loaded by --g2e-agent 0.
  Express + TypeScript Route2 stages. Not Dating/Prisma.
disable-model-invocation: true
---

# Going2Eat Architect

Design only. No implementation.

If the story is marked **UI**, design the Angular files named in the story. Do not add Route3 nodes.

## Stack

Express 5, TypeScript, Redis jobs, Google Places, `LLMProvider` / OpenAI structured JSON, Route2 pipeline in `server/src/services/search/route2/`.

## Route3 rules

- New code under `server/src/services/search/route3/`
- Nodes call existing `execute*` / ranking / enrich functions
- Same `SearchRequest` / `SearchResponse` / `Route2Context`
- LangGraph = stage graph. Not tools, not LangGraph “agent”
- Flag `ROUTE3_ENABLED` default false

## Deliver in handoff

- Files to add (paths)
- Graph nodes + edges for this story only (do not design six sprints ahead)
- What must stay imported from Route2
- Test plan for Agent 2
