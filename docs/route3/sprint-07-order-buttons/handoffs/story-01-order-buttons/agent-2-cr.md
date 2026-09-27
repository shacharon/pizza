# Handoff: Agent 2 — Code review — Story 01

**Agent:** 2 code-review  
**Story:** [STORY_01_order_buttons.md](../../STORY_01_order_buttons.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

UI review only. The card matches the architect design and the story acceptance criteria: one control per valid provider, labels **Order on Wolt** / **Order on 10bis** / **Order on Mishloha**, row above Navigate and Call, “Order via” and the dot separators removed. Wolt and Mishloha stay buttons with no `href`. 10bis stays an anchor. `onProviderLinkClick` and the URL checks are unchanged. No `:active` press style (story 02).

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/.../restaurant-card.component.html` | reviewed |
| `llm-angular/.../restaurant-card.component.scss` | reviewed |
| `llm-angular/.../restaurant-card.component.ts` | reviewed |
| `llm-angular/.../restaurant-card-order-buttons.spec.ts` | reviewed |
| `server/` | not part of this story |

---

## Decisions (do not reverse without discussion)

- Approve. Do not send back to the developer.
- The working tree also has edits under `server/src` (websocket, redis, provider verifier, Wolt canonicalizer, Gate2, location resolver) and log files. They are not in this story’s diff. Do not treat them as story 01, and do not commit them with this card change.

---

## Route2 safety

- [x] This story did not edit Route2 stage files
- [x] `ROUTE3_ENABLED` untouched (UI story; flag review not required)

---

## Tests / verification

- [x] Command: `npx jest --ci src/app/features/unified-search/components/restaurant-card/restaurant-card-order-buttons.spec.ts --no-coverage`
- [x] Result: pass (7 tests)

Covered: button vs anchor, labels, invalid or missing URL omitted, no “Order via”, no separator node, order row before `.action-bar`, click does not select the card. The click test runs `onProviderLinkClick` (the run logs the provider click). It does not assert `window.open`; the handler itself was not changed.

---

## Open questions / next agent

None for the developer. QA checks a live card.

**Next:** `--g2e-agent 3 sprint 7 story 1`
