# Handoff: Agent 3 — QA — Story 05

**Agent:** 3 QA  
**Story:** [STORY_05_assistant_plain_text.md](../../STORY_05_assistant_plain_text.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** pass

---

## Summary

A reply longer than 600 characters is cut to the first 600. A short reply stays whole. `<script>alert(1)</script>` stays that string. The helper template binds the reply with `{{ }}` and has no `innerHTML`.

Route2 still serves a normal search. The live helper text was 61 characters, and its question was 29. Both are under the cap, so they are returned in full.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/assistant/cap-assistant-text.ts` | reviewed, not edited |
| `server/src/services/assistant/assistant-llm-rewriter.service.ts` | reviewed, not edited |
| `llm-angular/.../assistant-summary/assistant-summary.component.html` | reviewed, not edited |

---

## Decisions (do not reverse without discussion)

- The 601-character cut and the script string are the unit tests. This local search did not produce a reply that long.
- The template check is the source file: reply text is `{{ getMessageVisibleText(msg) }}`, `{{ shown(msg.question) }}`, and `{{ shown(text()) }}`. There is no `innerHTML`.
- No browser tool was available, so the page was not clicked. The UI bundle rebuilt after the component change (`search-page-component` 531.28 kB).

---

## Route2 safety

- [x] Flag off: `pizza on Allenby` is `meta.source` `route2`
- [x] `ROUTE3_ENABLED` does not exist

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/assistant/cap-assistant-text.test.ts` from `server/`
- [x] Result: pass (4)
- [x] Command: `npx jest --watchAll=false src/app/features/unified-search/components/assistant-summary/cap-assistant-text.spec.ts` from `llm-angular/`
- [x] Result: pass (4)
- [x] 601 characters become the first 600
- [x] `<script>alert(1)</script>` is unchanged
- [x] The template has no `innerHTML`

`POST /api/v1/auth/token`, then `POST /api/v1/search?mode=sync` on `http://localhost:3000`:

| Check | Result |
|-------|--------|
| `pizza on Allenby` | 200, `source` `route2`, `mode` `textsearch`, 8 places |
| Assistant `message` | 61 characters, no `<script>` |
| Assistant `question` | 29 characters, no `<script>` |

- [x] A reply longer than 600 characters is cut before display
- [x] The template does not use `innerHTML`
- [x] A reply that contains `<script>` is kept as characters
- [x] A short reply is shown in full

---

## Open questions / next agent

None. Story 05 is done. Sprint 10 has no story 6.
