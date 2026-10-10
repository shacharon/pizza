---
name: testing
description: How to write and run meaningful tests in Going2Eat — node:test for the server, Jest for Angular, fakes for LLM/Google/Redis, LangGraph node and graph tests, and what a reviewer should demand. Load when writing, fixing or reviewing tests.
---

# Testing — Going2Eat

**State today:** both suites are mostly red or never run (`documentation/06-tech-issues-and-debt.md` TST-01/02). Rule: **new code ships with tests that pass when run directly, and you never reduce the number of passing tests.** Don't try to fix unrelated red tests inside a feature task — note them as follow-ups.

## What a good test is here
1. Tests **behaviour through a public interface**, not private methods or call order.
2. Covers the **failure paths**: timeout, abort, empty results, invalid model output, provider error, clarify, not-food. Most past bugs lived there (spinner never ending, abort never firing).
3. **No network, no real model, no real Redis, no clock** in unit tests. Inject fakes through constructors (`solid-oop`).
4. Deterministic: fixed inputs, fake clock, no `setTimeout` waits.
5. Fixtures are **synthetic** — never copy real user queries, session ids or coordinates from logs.
6. Each acceptance criterion (`AC-x`) maps to at least one test; name tests after behaviour: `it('asks for location when none in query and no device location')`.

## Server — `node:test`
```ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HardFilterNode } from '../nodes/hard-filter.node.js';   // .js extension (ESM)

describe('HardFilterNode', () => {
  it('drops closed places when openNow is requested', async () => {
    const node = new HardFilterNode(new FakeClock('2026-10-05T20:00:00+03:00'));
    const out = await node.run(stateWith({ hard: { openNow: true }, places: [openPlace, closedPlace] }));
    assert.deepEqual(out.places?.map(p => p.id), [openPlace.id]);
  });
});
```
Run: `cd server && node --test --import tsx src/graph/__tests__/hard-filter.node.test.ts`
- Place tests in `__tests__/` next to the code, named `*.test.ts`.
- Do **not** use `vitest` (not installed; 15 old files import it and never run).
- New test files must be runnable by an npm script — add them to a script or a glob (e.g. `test:graph`) as part of the task.

## Fakes to reuse (create once in `server/src/graph/__tests__/fakes/`)
| Fake | Behaviour |
|---|---|
| `FakeLlm` | Returns queued structured outputs; can throw `TimeoutError`; records calls (prompt version, input size) |
| `FakePlacesSearch` | Returns fixture places; can return `[]` or throw |
| `FakeClock` | Fixed `now()` for opening hours |
| `FakeBudget` | Allows/denies model calls |
| In-memory checkpointer | From `@langchain/langgraph` (verify the export name in the installed version) |

## LangGraph tests
- **Node test**: node + fakes + input state → assert the **partial update** it returns.
- **Router test**: pure function, table-driven over states.
- **Graph test**: compile the graph with fakes + in-memory checkpointer, run with a `thread_id`, assert path and final state for:
  1. food query → results; 2. not food → reject; 3. missing location → interrupt → resume with answer → results; 4. Google empty → `outcome: 'empty'`; 5. model timeout → fallback/error event; 6. client abort → run stops.
- **Stream test**: collect the public `SearchEvent`s from the SSE adapter and assert order: `stage… → results → patch… → done`.

## Frontend — Jest + jest-preset-angular
```ts
TestBed.configureTestingModule({
  providers: [provideHttpClient(), provideHttpClientTesting(), { provide: SearchStreamClient, useValue: fakeStream }],
});
```
- Use `jest.fn()`; **never `jasmine.createSpyObj`** (breaks under Jest — 11 files fail today for this).
- Component tests: set `input()`s via `fixture.componentRef.setInput(...)`, assert rendered DOM and `output()` emissions.
- Facade tests: drive a fake stream (`Subject<SearchEvent>`), assert signal values, including that `loading()` ends on error, timeout and completion.
- RTL: assert `dir` for Hebrew/Arabic content.
- Run: `cd llm-angular && npx jest src/app/... --reporters=default`.

## Evals are not unit tests
Real-model checks on the golden query set (accuracy, clarify rate, latency, cost) are run on demand for prompt/model changes — see `ai-agentic` §6. Unit tests never call a real model.

## Reviewer checklist
- [ ] Every AC has a test; failure paths tested.
- [ ] No network/real model/real time; fakes injected.
- [ ] Tests assert outcomes, would fail if the feature broke (mentally delete the code — does a test go red?).
- [ ] Synthetic fixtures only.
- [ ] Tests run via a script and pass; command + result pasted in dev notes.
