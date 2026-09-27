# Handoff: Agent 0 — Architect — Story 01

**Agent:** 0 architect  
**Story:** [STORY_01_order_buttons.md](../../STORY_01_order_buttons.md)  
**Sprint:** sprint-07-order-buttons  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

UI design only. One shared card, `app-restaurant-card`. Turn the gray “Order via” line into one button per app that `providerLinks()` already returns, labeled **Order on Wolt**, **Order on 10bis**, **Order on Mishloha**, and place that row above Navigate and Call.

No new files. No `server/` edits. No Route3 nodes. Click handling stays in `onProviderLinkClick`. Press sink/darken is story 02.

---

## Artifacts

| Path | Change |
|------|--------|
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.html` | move the provider block above `.action-bar`; replace the line with one control per link |
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.scss` | button row styles; drop the “Order via” line styles |
| `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts` | set each link’s visible label to “Order on …” |
| `server/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Keep `providerLinks()` URL checks, tracking params, and the empty-array case. Do not invent a link. If the computed returns nothing, render no order row.
- Set the returned `label` to the button text:
  - `wolt` → `Order on Wolt`
  - `tenbis` → `Order on 10bis`
  - `mishloha` → `Order on Mishloha`
- Dev warnings that today interpolate `config.label` must keep the short name (`Wolt`, `10bis`, `Mishloha`). Use `id` or a separate short name in those strings. Do not change validation.
- Do not change `onProviderLinkClick`. Wolt and Mishloha stay `<button type="button">` with no `href`. 10bis stays `<a>` with `href`, `target="_blank"`, `rel="noopener noreferrer"`. Both still call `onProviderLinkClick($event, link.id)`.
- The order row keeps `(click)="$event.stopPropagation()"` so a press does not select the card.
- Visible text and `aria-label` are `link.label`. Remove `Order via:` and the `·` separators. Remove the shopping-bag icon that belongs to that line.
- Keep the existing per-app logo SVGs inside each control.
- Hardcoded English, same as today’s “Order via:”. Do not add i18n keys.
- DOM order inside `<article>`: card content, then the order row, then `.action-bar` (Navigate, divider, Call).
- Story 02 owns `:active` sink/darken. This story only makes the controls look like buttons at rest (and a light hover, matching Navigate/Call hover background).

### Markup

Replace the block that starts at `provider-links-tailwind` (today after `.action-bar`) with this, placed immediately before `.action-bar`:

```html
@if (providerLinks().length > 0) {
<div class="order-buttons" (click)="$event.stopPropagation()">
  @for (link of providerLinks(); track link.id) {
    @if (link.id === 'wolt' || link.id === 'mishloha') {
    <button type="button" class="order-btn" (click)="onProviderLinkClick($event, link.id)"
      [attr.aria-label]="link.label">
      <!-- existing logo svg for this id -->
      <span class="order-btn-label">{{ link.label }}</span>
    </button>
    } @else {
    <a class="order-btn" [href]="link.url" target="_blank" rel="noopener noreferrer"
      (click)="onProviderLinkClick($event, link.id)" [attr.aria-label]="link.label">
      <!-- existing 10bis logo svg -->
      <span class="order-btn-label">{{ link.label }}</span>
    </a>
    }
  }
</div>
}
```

Do not render a control for an id that is absent from `providerLinks()`.

### Styles

- `.order-buttons`: flex, wrap, gap `0.5rem`, padding `0.5rem 1rem`, border-top `1px solid #e5e7eb`, background `#fff`.
- `.order-btn` (button and anchor): inline-flex, align center, gap `0.25rem`, padding `0.375rem 0.625rem`, border `1px solid #e5e7eb`, border-radius `6px`, background `#fff`, color `#111827`, font inherit, font-size `0.8125rem`, font-weight `600`, no underline, cursor pointer.
- Button reset: `background` and `border` as above (do not leave the old `background: none; border: none; padding: 0`).
- Hover (not disabled): background `#f9fafb`. No new `:active` treatment beyond what the browser does; story 02 adds the press.
- Delete unused rules: `.provider-links-tailwind`, `.provider-icon`, `.provider-content`, `.provider-label`, `.provider-list`, `.provider-link-item`, `.provider-name`, `.provider-separator-tw`. Keep `.provider-logo` if the SVGs still use that class.

`.action-bar` stays as it is, including its own border-top, so Navigate and Call look the same.

---

## Route2 safety

- [x] Route2 stage files untouched
- [x] `ROUTE3_ENABLED` default remains false

---

## Tests / verification

Agent 1 should update or add a card spec that renders the component (the existing `woltCta` / `providerCtas` specs call methods that are not on this class; do not revive those. Assert the template):

- [ ] Wolt FOUND + valid URL → a button whose text is `Order on Wolt`
- [ ] 10bis FOUND + valid URL → an anchor whose text is `Order on 10bis` and whose `href` is that URL
- [ ] Mishloha FOUND + valid URL → a button whose text is `Order on Mishloha`
- [ ] Missing or invalid URL → that app’s control is absent
- [ ] Document text does not contain `Order via`
- [ ] No `·` separator node
- [ ] `.order-buttons` precedes `.action-bar` in the article
- [ ] Clicking an order control does not emit card selection (`stopPropagation` still in place)

QA (agent 3) checks the same criteria in the browser on a card that has a real provider link, in search results and one other surface that uses `app-restaurant-card` (ranked, grouped, or assistant).

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 7 story 1`
