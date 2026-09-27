# Handoff: Agent 1 — Developer — Story 01

**Agent:** 1 developer  
**Story:** [STORY_01_order_buttons.md](../../STORY_01_order_buttons.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

`app-restaurant-card` now shows one order control per app that `providerLinks()` already accepts. Labels are **Order on Wolt**, **Order on 10bis**, and **Order on Mishloha**. That row sits above Navigate and Call. The “Order via” line and the dot separators are gone.

Wolt and Mishloha stay buttons opened in `onProviderLinkClick`. 10bis stays an anchor. No `server/` edits.

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.html` | order row above `.action-bar` |
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss` | `.order-buttons` / `.order-btn`; old provider-line rules removed |
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts` | button labels; short `name` kept for URL warnings |
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card-order-buttons.spec.ts` | created |
| `server/` | N/A |

---

## Decisions (do not reverse without discussion)

- Followed the architect markup and styles. No `:active` press treatment (story 02).
- `label` is the visible button text. `name` (`Wolt`, `10bis`, `Mishloha`) is only for the invalid-URL warning.
- URL checks, tracking params, and `onProviderLinkClick` are unchanged.
- 10bis `href` is the tracked URL (existing `appendTenbisTrackingParams`), not the raw provider string.

---

## Route2 safety

- [x] Route2 stage files untouched
- [x] `ROUTE3_ENABLED` default remains false (not touched)

---

## Tests / verification

- [x] Command: `npx jest --ci src/app/features/unified-search/components/restaurant-card/restaurant-card-order-buttons.spec.ts --no-coverage`
- [x] Result: pass (7 tests)

Browser check of a live card is Agent 3.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 7 story 1`
