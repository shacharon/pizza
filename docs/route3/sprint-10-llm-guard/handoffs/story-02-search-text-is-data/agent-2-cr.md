# Handoff: Agent 2 — Code Review — Story 02

**Agent:** 2 code review  
**Story:** [STORY_02_search_text_is_data.md](../../STORY_02_search_text_is_data.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

The fixed line is one constant, `SEARCH_TEXT_IS_DATA_LINE`, and `frameSearchAsData` puts it on the user message only. Gate, intent, base filters, the three mappers, post-constraints, both assistant builders, and the status rewriter use it. System prompts stay separate. `truncateWordsForLlm` still keeps 25 words. Gate `foodSignal` is still `NO` | `UNCERTAIN` | `YES`.

Search still calls `searchRoute2`. There is no graph and no `ROUTE3_ENABLED` flag.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/llm/truncate-llm-words.ts` | line constant and `frameSearchAsData`; cut function unchanged |
| `server/src/lib/llm/index.ts` | re-export |
| Gate, intent, base filters, three mappers, post-constraints, prompt builder, status rewriter | user message framed once |
| `server/src/services/search/route2/assistant/__tests__/prompt-builder.test.ts` | first line and system-prompt assertions |

---

## Decisions (do not reverse without discussion)

- Approve the frame. Do not move the line into a system prompt or into the quoted search.
- Post-constraints `query` stays the truncated search. The line is in front of the JSON string.
- `buildUserPrompt` still delegates to `buildUserPromptJson`, so the line is not doubled.
- The message-only SATURATED template has no search text. It is still framed once, as the architect required.

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google untouched
- [x] `search.controller.ts` still calls `searchRoute2`
- [x] No new graph, schema, or agent loop
- [x] Fallbacks and timeouts stay on the existing stages
- [x] Story 1 `capModelString` untouched

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/llm/truncate-llm-words.test.ts` from `server/`
- [x] Result: pass (5)
- [x] `frameSearchAsData('pizza on Allenby')` is the fixed line, a newline, then `pizza on Allenby`
- [x] A 40-word string is still 25 words on the line after the frame, and still ends at `w25`
- [x] Gate user role is `frameSearchAsData(truncateWordsForLlm(...))`. System role is still `GATE2_SYSTEM_PROMPT`
- [ ] `prompt-builder.test.ts` is Jest and this package has no Jest runner. Source review: `SYSTEM_PROMPT` is not framed, and `buildUserPrompt` returns `buildUserPromptJson`

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 3 sprint 10 story 2`
