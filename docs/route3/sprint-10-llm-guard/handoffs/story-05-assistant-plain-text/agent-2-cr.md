# Handoff: Agent 2 — Code Review — Story 05

**Agent:** 2 code review  
**Story:** [STORY_05_assistant_plain_text.md](../../STORY_05_assistant_plain_text.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

`capAssistantText` cuts at character 600 and leaves a shorter string unchanged. `generateAssistantMessage` caps `message` and `question` on the duplicate fallback, the validated result, and the error fallback. A null question stays null. Message-only text is capped. The stream stops forwarding once 600 characters have been sent.

The rewriter caps the cache read, the stored value, the in-flight result, the model text, and the raw fallback. The page binds the reply with `{{ }}`. `assistant-summary.component.html` has no `innerHTML`.

Search still calls Route2. There is no graph.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/assistant/cap-assistant-text.ts` | created |
| `server/src/services/search/route2/assistant/cap-assistant-text.test.ts` | created |
| `server/src/services/search/route2/assistant/assistant-llm.service.ts` | cap returns and the stream |
| `server/src/services/assistant/assistant-llm-rewriter.service.ts` | cap every `finalMessage` |
| `llm-angular/.../assistant-summary/cap-assistant-text.ts` | created |
| `llm-angular/.../assistant-summary/cap-assistant-text.spec.ts` | created |
| `llm-angular/.../assistant-summary/assistant-summary.component.ts` | cap visible text |
| `llm-angular/.../assistant-summary/assistant-summary.component.html` | `shown(...)` on reply text |

---

## Decisions (do not reverse without discussion)

- Approve the hard cut. Do not switch it to a word boundary.
- Approve capping `message` and `question` separately.
- Approve stopping the stream at 600 characters sent to `onChunk`.
- The Angular package runs Jest. The spec run stands in for the `ng test` command in the architect handoff.
- Pending and error strings stay uncapped. They are not model replies.

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google untouched
- [x] No new graph, schema, or agent loop
- [x] Prompts and fallback dictionaries untouched
- [x] No `innerHTML`, `DomSanitizer`, or `bypassSecurityTrustHtml` in the assistant summary

---

## Tests / verification

- [x] Command: `node --test --import tsx src/services/search/route2/assistant/cap-assistant-text.test.ts` from `server/`
- [x] Result: pass (4)
- [x] Command: `npx jest --watchAll=false src/app/features/unified-search/components/assistant-summary/cap-assistant-text.spec.ts` from `llm-angular/`
- [x] Result: pass (4)
- [x] `pizza on Allenby` stays 16 characters
- [x] 600 characters stay 600
- [x] 601 characters become the first 600
- [x] `<script>alert(1)</script>` is unchanged
- [x] The template uses `{{ getMessageVisibleText(msg) }}`, `{{ shown(msg.question) }}`, and `{{ shown(text()) }}`

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 3 sprint 10 story 5`
