# Story 05 — Assistant text stays plain

**Sprint 10.** UI and API.

## What

The helper under the results is free text from the model. Keep it as text on the page, and cap how long it can be.

- Cap a reply at 600 characters before it is shown
- Render with text binding only. No `innerHTML`, no trusted HTML
- The same cap applies to the status rewriter output

## Scope

- `llm-angular/src/app/features/unified-search/components/assistant-summary/`
- `server/src/services/search/route2/assistant/`
- `server/src/services/assistant/assistant-llm-rewriter.service.ts`

This story may edit those UI files. Do not change restaurant cards or the search box.

## Acceptance criteria

- [ ] A reply longer than 600 characters is cut before display
- [ ] The template does not use `innerHTML`
- [ ] A reply that contains `<script>` is shown as characters, not run
- [ ] A short reply is shown in full

## Agents

`-1 → 0 → 1 → 2 → 3`
