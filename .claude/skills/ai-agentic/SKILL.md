---
name: ai-agentic
description: LLM and agentic-system engineering rules for Going2Eat — prompt design, structured output, workflow-vs-agent choice, multilingual handling, cost/latency, evals, safety. Load when designing or changing anything that calls a model.
---

# AI / agentic engineering — Going2Eat

Product principle (decided by the owner): **LLM-first**. Every query is understood by a model, in any language (he/en/ar/ru). No rule-based fast path, no cache of parsed queries, no silent guessing.

## 1. Workflow first, agent only when needed
- The core search is a **fixed workflow** (deterministic graph with model calls inside nodes). Predictable, testable, fast.
- Use an **agent** (model chooses tools in a loop) only for open-ended tasks, e.g. free-form follow-up chat. Every agent loop has a max-steps limit and a budget.
- Code does what code can check (open now, distance, kosher flag, sorting by score). The model does what needs judgement (understanding text, soft preferences, explanations).

## 2. Every model call is a typed function
- Input: explicit, minimal. Output: **zod schema with structured output** — never parse free text.
- One responsibility per call. Merge calls only when they read the same input and the result is one decision (e.g. food-gate + intent → one `understand` call).
- Each call has: timeout, `AbortSignal`, max output tokens, retry policy (one retry max on transient errors), typed fallback result, and a cost entry in the per-session budget (`lib/llm`).
- Never put the model on the critical path of something the user is waiting for if its output is optional (narration, summaries). Stream results first, patch extras later.

## 3. Prompt rules
- **Static instructions first, dynamic data last** (system prompt, schema description, examples, then the user query). This maximises provider-side prompt caching — latency and cost win, not a result cache.
- Prompts live in versioned files (`prompts/<name>.v<N>.ts`), never inline in business logic. Changing a prompt = new version + eval run.
- Few-shot examples cover all four languages and the hard cases (mixed language, slang, landmarks, "near me").
- Language: detect in the `understand` call, carry `language` in state, and every user-facing model output must be in that language — validate it in code.
- Keep output schemas small. Output tokens dominate latency.

## 4. Clarify vs answer
- Clarify only when a required slot is truly missing **and** cannot be filled from context (e.g. no location in text and no device location). Otherwise answer.
- A clarification always offers choices (chips) and resumes the same run (LangGraph interrupt), never a dead end.
- Track **clarify rate** as a product metric. Target < 10%.

## 5. Safety
Prompt injection, PII in prompts and output validation: `security-privacy` §5–6.

## 6. Evals are the test suite of an LLM-first product
- Golden set: real queries (from `search_audit`, anonymised) in all four languages with expected structured output.
- Every prompt/model/graph change runs the eval and reports: field accuracy, clarify rate, not-food precision/recall, p50/p95 latency, cost per search.
- A change that lowers accuracy or raises p95 latency needs an explicit trade-off note.

## 7. Observability
- Trace every node/model call: input size, output, latency, tokens, cost, model, prompt version.
- Log the parsed intent and outcome (results / clarify / not-food / error) per search for funnel analysis.

## Review checklist
- [ ] Workflow vs agent choice justified.
- [ ] Structured output with zod; timeout, abort, max tokens, fallback, budget.
- [ ] Prompt versioned; static-first ordering; multilingual examples.
- [ ] Optional model output off the critical path.
- [ ] Untrusted input delimited; output validated.
- [ ] Eval run attached for any prompt/model change.
