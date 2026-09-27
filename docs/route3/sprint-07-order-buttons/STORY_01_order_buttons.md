# Story 01 — Order buttons

**Sprint 07** · **UI**

## Scope

Replace the gray “Order via: Wolt · 10bis · Mishloha” line on the restaurant card with one button per app that has a valid link.

- Labels: **Order on Wolt**, **Order on 10bis**, **Order on Mishloha**
- Show only apps that already pass the existing URL checks. Do not invent a link.
- Put this row above Navigate and Call.
- Keep the current click behavior (Wolt and Mishloha open from the click handler; 10bis stays a link).
- Same card in search results, ranked results, grouped results, and assistant panels, because they share `app-restaurant-card`.

Files: `llm-angular/src/app/features/unified-search/components/restaurant-card/` (html, scss, and the component only if the link list needs a label). No `server/` edits.

## Acceptance criteria

- [ ] A place with a Wolt link shows a button whose text is “Order on Wolt”, and the same for 10bis and Mishloha
- [ ] Apps with no valid link are absent
- [ ] The “Order via” label and the dot separators are gone
- [ ] The order row is above Navigate and Call
- [ ] Pressing a button still opens that provider and does not also select the card

## Agents

`-1 → 0 → 1 → 2 → 3`
