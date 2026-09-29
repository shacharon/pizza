# Handoff: Agent 0 — Architect — Story 05

**Agent:** 0 architect  
**Story:** [STORY_05_assistant_plain_text.md](../../STORY_05_assistant_plain_text.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No graph nodes. UI and API.

The helper stays text interpolation. A reply is cut to 600 characters before the template shows it. `message` and `question` are capped separately, so a short field stays whole. The status rewriter uses the same cut on every `finalMessage` it returns.

---

## Files to add

| Path | Purpose |
|------|---------|
| `server/src/services/search/route2/assistant/cap-assistant-text.ts` | `capAssistantText` |
| `server/src/services/search/route2/assistant/cap-assistant-text.test.ts` | length and `<script>` cases |
| `llm-angular/src/app/features/unified-search/components/assistant-summary/cap-assistant-text.ts` | same cut for the page |
| `llm-angular/src/app/features/unified-search/components/assistant-summary/cap-assistant-text.spec.ts` | same cases |

## Graph

Not Route3. No nodes, no edges. `ROUTE3_ENABLED` stays unset / false.

## Stay on Route2

Keep `generateAssistantMessage`, `generateMessageOnlyText`, and `streamAssistantMessage`. Do not replace them. Do not change prompts, validation, fallback dictionaries, Gate2, Intent, or Google.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/assistant/assistant-llm.service.ts` | cap `message` and `question` on every return; cap message-only text; stop the stream at 600 characters |
| `server/src/services/assistant/assistant-llm-rewriter.service.ts` | cap every `finalMessage` |
| `llm-angular/.../assistant-summary/assistant-summary.component.ts` | cap text before the template reads it |
| `llm-angular/.../assistant-summary/assistant-summary.component.html` | keep `{{ }}` bindings; no `innerHTML` |
| Restaurant cards, search box, prompts | N/A |

---

## Decisions (do not reverse without discussion)

- One cut, duplicated only because the page and the API do not share a package:

```ts
export const ASSISTANT_REPLY_MAX_CHARS = 600;

export function capAssistantText(text: string): string {
  if (text.length <= ASSISTANT_REPLY_MAX_CHARS) return text;
  return text.slice(0, ASSISTANT_REPLY_MAX_CHARS);
}
```

- Hard cut at character 600. Do not search for a space.
- `null` question stays `null`. Cap a question only when it is a string.
- Cap `message` and `question` on their own. A 400-character message and a 400-character question both stay whole.
- The string `<script>alert(1)</script>` is under 600 characters and must be returned unchanged. The page shows it with text binding, so the browser does not run it.
- Do not add `innerHTML`, `DomSanitizer`, or `bypassSecurityTrustHtml`.

Server assistant returns:

- `generateAssistantMessage`: after the duplicate-request fallback is built, after `validateAndEnforceCorrectness`, and on the error fallback, set `message` and `question` through `capAssistantText` when they are strings.
- `generateMessageOnlyText`: `return capAssistantText((text ?? '').trim())`.
- `streamAssistantMessage`: count characters already passed to `onChunk`. Once 600 have been sent, ignore the rest of the stream. A chunk that would pass 600 is sliced to the remaining room, then later chunks are dropped.

Rewriter (`assistant-llm-rewriter.service.ts` imports `capAssistantText` from the assistant helper):

- Cap the cached `finalMessage` on read.
- Cap the value stored in `cache.set`.
- Cap the in-flight result.
- Cap the successful model text.
- Cap `rawMessage` on the failure return.

Page (`assistant-summary` only):

- `getMessageVisibleText` returns `capAssistantText` of the stream text or `msg.message`.
- Legacy `{{ text() }}` bindings go through the same function.
- `{{ msg.question }}` goes through the same function when the question is shown.
- Leave the pending and error strings as they are. They are not model replies.

---

## Route2 safety

- [x] Gate, Intent, and Google stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] Reply length on the assistant outputs and the rewriter is the edit this story allows

---

## Tests / verification

Server, from `server/`:

```text
node --test --import tsx src/services/search/route2/assistant/cap-assistant-text.test.ts
```

- [ ] 20 characters stay 20 characters
- [ ] exactly 600 characters stay 600
- [ ] 601 characters become 600 and equal the first 600
- [ ] `<script>alert(1)</script>` is unchanged

Angular, from `llm-angular/`:

```text
npx ng test --no-watch --browsers=ChromeHeadless --include=src/app/features/unified-search/components/assistant-summary/cap-assistant-text.spec.ts
```

- [ ] the same four cases

Code review also checks `assistant-summary.component.html` has no `innerHTML`.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 10 story 5`
