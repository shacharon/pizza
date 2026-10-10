---
name: solid-oop
description: SOLID and OOP design rules for Going2Eat (TypeScript backend and Angular). Load when designing classes, interfaces, services, LangGraph nodes or providers, when refactoring, or when reviewing design quality.
---

# SOLID / OOP for Going2Eat

The project rule (`.cursor/rules/importnent.mdc`) is "always work with SOLID, check OOP whenever you can". This skill makes that concrete. Pragmatism wins over ceremony: apply a principle when it removes a real problem, not to add layers.

## The five principles, applied here

| Principle | What it means in this codebase | Smell to catch |
|---|---|---|
| **S**ingle responsibility | One reason to change per unit. A LangGraph node does one step. A controller validates and delegates, no business logic. | `orchestrator.*.ts` files that parse, call Google, rank and emit WS events in one function. Files > 400 lines. |
| **O**pen/closed | Add a provider (Wolt, 10bis, Mishloha…) or a filter by adding a class, not by editing a `switch`. | `if (provider === 'wolt') … else if …` chains. |
| **L**iskov substitution | Every `PlacesProvider` / `LlmClient` implementation honours the same contract: same errors, same timeouts, same DTO shape. | An implementation that throws where others return `[]`. |
| **I**nterface segregation | Small, role-based interfaces (`IntentParser`, `PlacesSearch`, `ResultRanker`), not one `SearchService` god-interface. | Classes implementing methods with `throw new Error('not implemented')`. |
| **D**ependency inversion | Depend on interfaces, receive dependencies through the constructor, wire them in a **composition root**. | `import { wsManager } from '../../server.js'` inside services (7 sites today — Phase 2 removes them). Module-level singletons created at import time. |

## Rules

1. **Composition root.** Objects are created and wired in one place (`server/src/composition-root.ts` or the graph factory), never at import time. This also fixes the import-order bugs (rate limiter grabbing Redis before init).
2. **Constructor injection.** `constructor(private readonly places: PlacesSearch, private readonly clock: Clock) {}`. No `new` of collaborators inside business classes.
3. **Interfaces at boundaries.** External systems (OpenAI, Google, Redis, DynamoDB, providers) sit behind an interface in `domain/ports` and an adapter in `infra/`. Business code never imports `openai`, `ioredis` or `@aws-sdk/*` directly.
4. **Domain DTOs cross layers**, not raw API shapes (`.cursor/rules/interfaces.mdc`). Map at the adapter.
5. **Immutable data, behaviour in classes.** State objects (graph state, DTOs) are plain readonly types. Behaviour lives in services/nodes.
6. **Composition over inheritance.** Inheritance only for true is-a with shared behaviour (at most one level). Prefer strategy objects.
7. **Pure functions for pure logic.** Ranking, filtering, scoring, mapping: pure, exported, unit-tested. A class is not required for a pure function.
8. **Errors are typed.** Use a small error hierarchy or discriminated unions (`{ kind: 'timeout' } | { kind: 'not_food' }`), not string matching.
9. **No `any`.** Use `unknown` + zod parsing at boundaries. Existing debt: 369 `any` in server, 115 in front — do not add more.
10. **Size limits.** Function > 50 lines or file > 400 lines → split, unless there is a stated reason.

## Example: provider strategy (open/closed + DIP)

```ts
// domain/ports/delivery-provider.ts
export interface DeliveryProvider {
  readonly id: 'wolt' | 'tenbis' | 'mishloha';
  findLink(place: PlaceDto, signal: AbortSignal): Promise<ProviderLink | null>;
}

// application/enrich-places.ts
export class EnrichPlaces {
  constructor(private readonly providers: readonly DeliveryProvider[]) {}
  async run(places: PlaceDto[], signal: AbortSignal) {
    return Promise.all(places.map(p =>
      Promise.allSettled(this.providers.map(pr => pr.findLink(p, signal)))));
  }
}
// Adding a provider = new class + one line in the composition root.
```

## Review checklist
- [ ] Each new class/node has one responsibility, nameable in one sentence.
- [ ] Dependencies injected, typed by interface, wired in the composition root.
- [ ] No new import of `server.ts`/`app.ts` from services.
- [ ] No vendor SDK imported outside `infra/` adapters.
- [ ] Pure logic is a pure function with a unit test.
- [ ] No new `any`; boundaries parsed with zod.
