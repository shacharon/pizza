# Handoff: Agent 1 — Developer — Story 05

**Agent:** 1 developer  
**Story:** [STORY_05_assistant_plain_text.md](../../STORY_05_assistant_plain_text.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

A reply is cut at 600 characters before it is shown. `message` and `question` are capped on their own. The status rewriter caps every `finalMessage`. The page still binds those strings with `{{ }}`.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/assistant/cap-assistant-text.ts` | created |
| `server/src/services/search/route2/assistant/cap-assistant-text.test.ts` | created |
| `server/src/services/search/route2/assistant/assistant-llm.service.ts` | cap returns and stop the stream at 600 |
| `server/src/services/assistant/assistant-llm-rewriter.service.ts` | cap every `finalMessage` |
| `llm-angular/.../assistant-summary/cap-assistant-text.ts` | created |
| `llm-angular/.../assistant-summary/cap-assistant-text.spec.ts` | created |
| `llm-angular/.../assistant-summary/assistant-summary.component.ts` | cap visible text |
| `llm-angular/.../assistant-summary/assistant-summary.component.html` | `shown(...)` on reply text; still `{{ }}` |

---

## Decisions (do not reverse without discussion)

- Hard cut at character 600. A shorter field stays whole.
- `question` stays `null` when it is null.
- The stream forwards chunks only until 600 characters have been sent.
- The rewriter caps cache reads, the stored cache value, the in-flight result, the model text, and the raw fallback.
- The template has no `innerHTML`.

---

## Route2 safety

- [x] Gate, Intent, and Google untouched
- [x] `ROUTE3_ENABLED` untouched
- [x] Prompts and fallback dictionaries untouched
- [x] Flag off: `pizza on Allenby` is `meta.source` `route2`, `mode` `textsearch`, 8 places

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/assistant/cap-assistant-text.test.ts` from `server/`
- [x] Result: pass (4)
- [x] Command: `npx jest --watchAll=false src/app/features/unified-search/components/assistant-summary/cap-assistant-text.spec.ts` from `llm-angular/`
- [x] Result: pass (4)
- [x] 16-character reply stays 16
- [x] 600 characters stay 600
- [x] 601 characters become the first 600
- [x] `<script>alert(1)</script>` is unchanged

The Angular package runs Jest, so that command replaced `ng test`.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 10 story 5`
