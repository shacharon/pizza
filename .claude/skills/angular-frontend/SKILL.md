---
name: angular-frontend
description: Angular 19 conventions and project map for the Going2Eat frontend (llm-angular/). Load before designing, writing or reviewing any frontend code.
---

# Angular frontend — Going2Eat

Full reference: `documentation/03-frontend.md`. Existing rules: `.cursor/rules/architure.mdc`, `components.mdc`, `state.mdc`, `guards.mdc`.

## Where things live
- App code: **`llm-angular/src/app/` only.**
  - `features/unified-search/` — main search page, results, restaurant card, assistant panel.
  - `facades/` — page-level orchestration (`SearchFacade`, `search-api.facade.ts`).
  - `state/` — signal stores.
  - `api/`, `core/services/`, `services/` — HTTP, WebSocket, SSE clients.
  - `contracts/`, `domain/`, `../shared/api` — types shared with the server.
- Boundaries and commands: see `CLAUDE.md` (never edit `llm-angular/src/` outside `app/`). `npm run build:prod` is what Amplify runs.

## Conventions
1. **Standalone components, `ChangeDetectionStrategy.OnPush`**, separate `.html` + `.scss` files.
2. **Container vs presentational.** Containers inject facades; presentational components use `input()` / `output()` only, no services.
3. **Signals for state**, `computed` for derived state, `effect` only for side effects. RxJS for streams (HTTP, WS, SSE) converted with `toSignal` at the edge.
4. **Facade pattern.** Components never call HTTP/WS/SSE clients directly; they call a facade that owns the flow.
5. **Typed DTO → view model mappers.** Backend shapes never reach templates.
6. **Templates are dumb**: no business logic, `@for (...; track item.id)`, no heavy calls in bindings.
7. **i18n / RTL.** Users write Hebrew, English, Arabic, Russian. Use `dir="auto"` or the language from the response for user/assistant text. Never hard-code `dir="ltr"` on content.
8. **No `console.log`** in new code. Use the existing logging/analytics service and gate debug output on environment.
9. **No secrets in the browser.** Never call OpenAI or other paid APIs from the frontend; never render model output with `innerHTML`.
10. **Accessibility**: buttons are `<button>`, images have `alt`, interactive elements are keyboard reachable.

## Streaming clients (important for the LangGraph v2 work)
- Today: `POST /search?mode=async` → 202 → WebSocket `SEARCH_RESULTS` + SSE assistant + polling fallback. Complex; see `documentation/02-system-architecture.md` §4.
- Target (v2): one SSE stream per search carrying graph events. Implement as **one** service (`SearchStreamClient`) returning an `Observable<SearchEvent>` (discriminated union), consumed by the facade. Always handle: timeout, error event, stream end, and unsubscribe/abort on navigation.
- Behind a feature flag in `environments/` so v1 stays the default.

## Testing
Every new component/facade/service gets a spec — see the `testing` skill.

## Review checklist
- [ ] Code only under `llm-angular/src/app/`.
- [ ] OnPush, standalone, signals, facade used.
- [ ] No backend shapes in templates; mapper exists.
- [ ] RTL/language handled for user-visible text.
- [ ] Streams unsubscribed/aborted; loading state always ends (error + timeout paths).
- [ ] New specs pass; `tsc` clean; no `console.log`.
