# Handoff: Agent -1 — Preflight — Story 02

**Agent:** -1 preflight  
**Story:** [STORY_02_press_feedback.md](../../STORY_02_press_feedback.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

UI story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **S**. Depends on story 01, which has passed QA.

`.order-btn` already looks like a button at rest and on hover. It has no pressed state. Navigate and Call darken to `#f3f4f6` on `:active` and return when the press ends. This story adds that same moment of feedback to Order on Wolt, Order on 10bis, and Order on Mishloha, without delaying the open.

No Route2 rewrite. No `server/` edit.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-07-order-buttons/handoffs/story-02-press-feedback/agent--1-preflight.md` | created |
| `llm-angular/.../restaurant-card.component.scss` | N/A (later agents) |
| `server/` | N/A |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- **UI sprint.** Code is `llm-angular` only. Do not edit `server/`. Do not add Route3 nodes.
- Files: `restaurant-card.component.scss`, and the html only if a class is required. Do not change `onProviderLinkClick` or the URL checks.
- Pressed look lasts only while the pointer is down, then returns. No loop, no delay before the provider opens.
- Leave `.action-bar` / Navigate / Call rules as they are.
- Out of this story: results fade (story 03), deals, menu.

---

## Route2 safety

- [x] Route2 stage files untouched (UI only; no `server/` work)
- [x] `ROUTE3_ENABLED` default remains false (this story does not touch the flag)

---

## Tests / verification

- [x] Command: read story, epic, sprint README, story 01 QA (pass), and current `.order-btn` / `.action-btn:active`
- [x] Result: pass (preflight only; no code run)

Current `.order-btn` has `&:hover { background: #f9fafb; }` and no `&:active`. `.action-bar .action-btn:active` sets `background: #f3f4f6`.

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 7 story 2`
