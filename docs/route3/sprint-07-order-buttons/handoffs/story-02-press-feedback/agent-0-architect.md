# Handoff: Agent 0 — Architect — Story 02

**Agent:** 0 architect  
**Story:** [STORY_02_press_feedback.md](../../STORY_02_press_feedback.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

UI design only. Add a pressed background on `.order-btn` that matches Navigate and Call: `#f3f4f6` while `:active`, then the existing rest or hover background when the press ends. No html change. No click-handler change. No `server/` edits.

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss` | `&:active` on `.order-btn` |
| `restaurant-card.component.html` | N/A (`.order-btn` already exists on the button and the 10bis anchor) |
| `restaurant-card.component.ts` | N/A |
| `server/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Darken, the same way `.action-bar .action-btn:active` does. Do not add a translate, scale, or keyframe. Navigate and Call do not sink via transform; matching them means the gray press fill.
- Do not edit `.action-bar` or `.action-btn` rules.
- Do not change `onProviderLinkClick`, labels, or which control is a button vs an anchor.
- `:active` is the whole feedback. It ends on release. Do not add a class toggled from TypeScript, a timeout, or an animation that runs after mouseup. The open stays on the existing click.
- One rule covers Wolt, Mishloha, and 10bis because all three use `.order-btn`.

### Styles

Inside `.order-btn`, after the existing `&:hover` block:

```scss
transition: background 0.15s ease;

&:hover {
  background: #f9fafb;
}

&:active {
  background: #f3f4f6;
}
```

`:active` comes after `:hover` so a press while the pointer is over the control stays `#f3f4f6`, not the hover gray. `0.15s` matches the action-bar background transition. It does not delay `window.open`.

Rest background stays `#fff`.

---

## Route2 safety

- [x] Route2 stage files untouched
- [x] `ROUTE3_ENABLED` default remains false

---

## Tests / verification

No new unit test required. jsdom does not apply `:active`. Agent 2 checks the scss rule and that `.action-btn` rules are unchanged.

QA (agent 3) in the browser, on a card that shows the order buttons:

- [ ] Press and hold Order on Wolt: background darkens to the same gray as a pressed Navigate button, then returns on release
- [ ] Same for Order on 10bis and Order on Mishloha
- [ ] Releasing still opens that provider
- [ ] Navigate and Call colors on rest, hover, and press are unchanged

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 7 story 2`
