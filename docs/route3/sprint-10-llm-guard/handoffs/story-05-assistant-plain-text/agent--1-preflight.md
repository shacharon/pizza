# Handoff: Agent -1 — Preflight — Story 05

**Agent:** -1 preflight  
**Story:** [STORY_05_assistant_plain_text.md](../../STORY_05_assistant_plain_text.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

UI and API story on Going2Eat (`angular-piza`), not Dating and not a Route3 graph. Size **M**.

The helper under the results is plain text today. `assistant-summary.component.html` binds it with `{{ getMessageVisibleText(msg) }}`, `{{ text() }}`, and `{{ msg.question }}`. There is no `innerHTML` and no `DomSanitizer` in that component. `getMessageVisibleText` returns the stream text or `msg.message` with no length cut. The status rewriter returns `finalMessage` from the model, the cache, or `rawMessage` with no 600-character cut.

This story caps a reply at 600 characters before it is shown, keeps text binding only, and applies the same cap to the rewriter output. It does not rewrite Gate2, Intent, or Google. It does not change restaurant cards or the search box.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-10-llm-guard/handoffs/story-05-assistant-plain-text/agent--1-preflight.md` | created |
| `llm-angular/.../assistant-summary/` | N/A (later agents; cap + text binding) |
| `server/src/services/search/route2/assistant/` | N/A (later agents; cap the reply before it is sent) |
| `server/src/services/assistant/assistant-llm-rewriter.service.ts` | N/A (later agents; same 600 cap) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- The story is marked UI and API. The story’s file list is the scope: the assistant-summary component, the Route2 assistant folder, and the status rewriter. Do not treat this as Angular-only.
- Do not change restaurant cards or the search box.
- Do not rewrite Gate2, Intent, Google, assistant prompts, or fallback dictionaries. A 600-character cut is the change.
- Keep rendering as text interpolation. Do not add `innerHTML` or trusted HTML.
- A string that contains `<script>` must stay characters in the template.
- A reply of 600 characters or fewer stays whole.
- The rewriter’s success, cache, and raw fallback paths all need the same cap.

---

## Route2 safety

- [x] Gate, Intent, and Google stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] The assistant reply length and the rewriter length are the exception this story allows

---

## Tests / verification

- [x] Command: read story, sprint README, epic, assistant-summary template, and `rewriteAssistantMessage`
- [x] Result: pass (preflight only; no code run)

Open for the architect: whether the 600-character cut is on `message` only, or also on the separate `question` line that the template already prints as text.

---

## Open questions / next agent

The architect should name the one cut function and where it runs before display, including the rewriter return values.

**Next:** `--g2e-agent 0 sprint 10 story 5`
