# Handoff: Agent -1 — Preflight — Story 01

**Agent:** -1 preflight  
**Story:** [STORY_01_order_buttons.md](../../STORY_01_order_buttons.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

UI story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **S**.

Today `app-restaurant-card` renders a gray “Order via: Wolt · 10bis · Mishloha” line **under** Navigate and Call. The story turns each app that already has a valid URL into a button labeled **Order on Wolt**, **Order on 10bis**, or **Order on Mishloha**, and moves that row **above** Navigate and Call.

`providerLinks()` already drops apps that fail the existing URL checks. Click behavior already matches the story: Wolt and Mishloha are buttons opened in `onProviderLinkClick`; 10bis is an `<a>`. No Route2 stage rewrite. No `server/` edit.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-07-order-buttons/handoffs/story-01-order-buttons/agent--1-preflight.md` | created |
| `llm-angular/.../restaurant-card/*` | N/A (design and code are later agents) |
| `server/` | N/A |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- **UI sprint.** Code is `llm-angular` only. Do not edit `server/`. Do not add Route3 nodes.
- Scope is one shared card: `llm-angular/src/app/features/unified-search/components/restaurant-card/` (html, scss, and the component only if the link list needs a display label). Search, ranked, grouped, and assistant panels already use `app-restaurant-card`.
- Keep existing URL filters in `providerLinks()`. Do not invent a link. Do not change `onProviderLinkClick` open behavior (Wolt and Mishloha stay buttons; 10bis stays a link).
- Visible text becomes “Order on {app}”. Remove the “Order via” label and the `·` separators.
- Place the order row above the Navigate / Call action bar.
- Out of this story: press sink/darken (story 2), results fade (story 3), deals, menu.

---

## Route2 safety

- [x] Route2 stage files untouched (UI only; no `server/` work)
- [x] `ROUTE3_ENABLED` default remains false (this story does not touch the flag)

---

## Tests / verification

- [x] Command: read story, epic, sprint README, and current card html / `providerLinks()` / scss
- [x] Result: pass (preflight only; no code run)

Current markup to replace: `provider-links-tailwind` sits after `.action-bar` and includes `.provider-label` (“Order via:”) plus `.provider-separator-tw`. Labels in `providerLinks()` are still `Wolt`, `10bis`, `Mishloha`. Aria text is `Order via ` + label.

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 7 story 1`
