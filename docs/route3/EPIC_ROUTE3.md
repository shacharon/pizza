# Epic — Route3 (LangGraph on top of Route2)

**Product:** Going2Eat (`angular-piza`)  
**Status:** Planned  
**Default production path:** Route2 (unchanged)

## Goal

Add **Route3**: a LangGraph coordinator that runs the **same thoughts** as Route2 by **calling existing stage functions**. Route2 code stays. Flag off by default.

## What Route3 is

A new orchestrator. Nodes wrap:

- `executeGate2Stage`
- `executeIntentStage`
- `executeRouteLLM`
- `executeGoogleMapsStage`
- ranking / enrich helpers already used by Route2

Same HTTP/WS contracts. Same prompts and JSON schemas.

## What Route3 is not

- Not a LangChain agent with tools
- Not new NLU / new prompts
- Not a rewrite of Gate2 / Intent / Google internals
- Not LCEL on every LLM call (optional last sprint, Gate2 only)

## Constraints (all stories)

1. Do not edit Route2 stage internals to “make graph work.”
2. `ROUTE3_ENABLED` default **false**. Unset = Route2.
3. LangGraph = graph of stages. LCEL = optional single LLM hop later.
4. Search response DTO unchanged.
5. Work lives in `server/src/services/search/route3/`. Controller gets a flag branch only.

## Graph (target)

```
START → region/language → gate2
  ├─ STOP / CLARIFY → terminal response (existing helpers)
  └─ CONTINUE → intent → route-llm → google → rank → enrich → END
```

Parallel `base_filters` + `post_constraints` after CONTINUE: not in the first graph sprints; add when linear path matches Route2.

## Out of scope until later

- Angular UI changes (no new search client)
- Dating repo / dating agents
- Replacing `OpenAiProvider` globally
