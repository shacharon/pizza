# Handoff: Agent 3 — QA — Story 01

**Agent:** 3 qa  
**Story:** [STORY_01_order_buttons.md](../../STORY_01_order_buttons.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** pass

---

## Summary

Checked the story on http://localhost:4200/search after a “pizza in Tel Aviv” search. Provider enrichment stayed `PENDING` for every card, so the links were set on the already loaded results in the page (valid Wolt, 10bis, and Mishloha URLs on the first card; invalid or missing links on the next two). The running card template then matched the acceptance criteria.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-07-order-buttons/handoffs/story-01-order-buttons/agent-3-qa.md` | created |
| App code | N/A (QA only) |

---

## Decisions (do not reverse without discussion)

- Pass. Do not send the story back.
- Live enrichment did not deliver `FOUND` links in this session. That is outside this UI story. The card behavior was checked with valid links present on the client.

---

## Route2 safety

- [x] Route2 stage files untouched in this step
- [x] Flag-off / flag-on checks skipped (UI story)

---

## Tests / verification

- [x] Search results card (Amore Mio) with three valid links:
  - Buttons: **Order on Wolt**, **Order on Mishloha** (no `href`)
  - Link: **Order on 10bis** (`href` is the tracked 10bis URL)
  - No “Order via” text, no `·` separator node
  - `.order-buttons` is above `.action-bar` (Navigate, Call)
  - Clicking Wolt and 10bis called `window.open` with that provider URL and left the path at `/search` (card was not selected)
- [x] Pizza Lila: invalid 10bis and missing Wolt omitted; only **Order on Mishloha**
- [x] HaPizza: no valid links, no order row
- [x] Assistant bottom sheet (`compact` card): same three labels, order row above Navigate and Call, no “Order via”

---

## Open questions / next agent

Story 01 is done.

**Next:** `--g2e-agent -1 sprint 7 story 2`
