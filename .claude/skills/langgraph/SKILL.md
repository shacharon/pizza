---
name: langgraph
description: LangGraph.js + LangChain.js patterns for the Going2Eat v2 search engine (server/src/graph/) — state, nodes, edges, interrupts, checkpointing, streaming, structured output, testing. Load before designing, writing or reviewing any LangGraph/LangChain code.
---

# LangGraph.js / LangChain.js — Going2Eat v2

Goal: rebuild the search engine as a LangGraph workflow in TypeScript, side by side with route2, behind `/api/v2/search` and a feature flag. Route2 stays in production until v2 wins on the eval set.

## 0. Versions — verify before coding
The repo has old, unused `langchain@0.3` and `@langchain/openai@0.6`. LangChain/LangGraph APIs changed across major versions.
- Before writing code, check the installed versions (`npm ls @langchain/langgraph @langchain/core @langchain/openai`) and the current docs / type definitions in `node_modules`. **Do not rely on memory for API names.** The snippets below show the shape, not guaranteed signatures.
- Use `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`. Do not use the legacy `langchain` chains/memory/agents classes.

## 1. Layout
```
server/src/graph/
  search.graph.ts          # builds and compiles the graph (composition of nodes)
  search.state.ts          # state schema (zod/Annotation) + reducers
  nodes/                   # one file per node, one class or function each
    understand.node.ts
    clarify.node.ts
    google-search.node.ts
    hard-filter.node.ts
    judge.node.ts
    enrich.node.ts
  prompts/                 # versioned prompts (understand.v1.ts ...)
  schemas/                 # zod schemas for model outputs
  ports/                   # interfaces: PlacesSearch, LlmFactory, Clock...
  adapters/                # Google, OpenAI, Redis checkpointer adapters
  __tests__/
server/src/controllers/v2/search-stream.controller.ts   # SSE endpoint
```

## 2. Design rules
1. **Explicit workflow graph, not a prebuilt ReAct agent** for the core search.
2. **Nodes are thin and injected.** A node is a small class (or factory) receiving its ports through the constructor; `search.graph.ts` wires them (composition root). Nodes return a **partial state update**, never mutate state.
3. **State is the contract.** One typed state object, e.g.:
   ```ts
   { query, language, deviceLocation?, intent?, clarification?, places[], ranked[], enrichment{}, outcome, errors[] }
   ```
   Use reducers for fields that accumulate (`errors`, `enrichment`). Keep raw provider payloads out of state — store mapped DTOs.
4. **Routing is code.** `addConditionalEdges` uses pure functions over state (`notFood → reject`, `missingLocation → clarify`, else `google_search`). No model call inside a router.
5. **Parallelism** via fan-out edges (or `Send` for per-item map). `judge` and `enrich` run in parallel after results are emitted.
6. **Clarify = `interrupt()`**: the graph pauses, the client receives the question + choices, the answer resumes the same thread (`Command({ resume })`). Requires a checkpointer.
7. **Checkpointer**: in-memory saver for dev/tests; Redis-backed for prod (threads must survive a request, and later multiple instances). `thread_id` = conversation id, never the raw session id from the client without ownership check.
8. **Structured output**: `new ChatOpenAI({ model, timeout, maxTokens }).withStructuredOutput(zodSchema)`. One model factory port so the model can be swapped per node.
9. **Streaming**: stream graph runs to the client over **one SSE stream** per search. Map internal stream chunks (`updates` / `custom` / `messages` modes) to a small public event union:
   ```ts
   type SearchEvent =
     | { type: 'stage'; stage: string }
     | { type: 'clarify'; question: string; choices: string[]; threadId: string }
     | { type: 'results'; places: PlaceCard[] }
     | { type: 'patch'; ranked?: RankedItem[]; links?: ProviderLinks }
     | { type: 'done'; outcome: Outcome }
     | { type: 'error'; code: string };
   ```
   Never leak internal state shape to the client.
10. **Cancellation**: pass the request `AbortSignal` into the run config; stop on client disconnect.
11. **Errors**: a node catches expected failures and writes a typed error + fallback to state; unexpected errors fail the run and emit `error`. Set a recursion limit.
12. **Budget**: every model call goes through the existing per-session budget (`lib/llm`).

## 3. Target graph (v2.0)
```
START → understand ─┬─ not food ───────────→ reject → END
                    ├─ missing location ──→ clarify (interrupt) → understand
                    └─ ok → google_search → hard_filter → emit_results ─┬→ judge  → END
                                                                         └→ enrich → END
```

## 4. Testing
Node, router, graph and stream tests with fakes: `testing` skill, "LangGraph tests". Evals: `ai-agentic` §6.

## Review checklist
- [ ] Versions/APIs verified against installed packages.
- [ ] Workflow graph, routers are pure functions, nodes injected and single-purpose.
- [ ] State typed, partial updates, reducers where needed, no raw payloads.
- [ ] Interrupt + checkpointer used for clarify; thread ownership checked.
- [ ] One SSE stream, public event union, abort on disconnect.
- [ ] Node + graph tests with fakes.
