---
name: product-ux
description: Going2Eat product and UX vocabulary — users, funnel and metrics, existing screens/components, result-card anatomy, UX states, mobile-first RTL layout, tone of voice in Hebrew/English, analytics events. Load when writing product specs, designing UI flows, or judging UX in a design.
---

# Product & UX — Going2Eat

Full reference: `documentation/01-product.md`. Product principles are in `CLAUDE.md`.

## Users & entry points
- Mostly **mobile**, arriving from shared links: QR cards (`/q`), named campaign links (`/p/<name>`, e.g. `/p/linkedin`), or the plain site (`/search`). Entry is remembered per tab and logged once as `landing_open`.
- Languages: Hebrew first, then English; Arabic and Russian supported in queries and assistant text. **Today the page chrome is English-only** — a known gap.
- Typical intents: a dish/cuisine + place ("פיצה בתל אביב"), near me + constraint ("כשר פתוח עכשיו לידי"), occasion/vibe ("place for a date with gluten-free options").

## Funnel and current numbers (7 days to 2026-10-04)
| Step | Metric | Today |
|---|---|---|
| Search | searches / sessions | 155 / 39 |
| Outcome | results / clarify / error | 42% / 35% / 15% |
| Action | searches with a card click | 6.5% |
| Order | clicks that are delivery orders | 3 of 15 |
Primary product KPIs to move: **results rate ↑, clarify rate ↓ (< 10%), time to first result ↓ (target p95 ≤ 3 s), click-through ↑.** Every spec names which KPI it moves.

## Screens & components that exist (`llm-angular/src/app/features/unified-search/`)
- `search-page` — hero + `search-bar`, example prompts, results area.
- Results: `ranked-results`, `grouped-results`, `restaurant-card`, `reason-label`.
- Assistant: `assistant-panel`, `assistant-desktop-panel`, `assistant-bottom-sheet`, `assistant-strip`, `assistant-line`, `assistant-summary` (the narrator — **to be replaced by per-card reasons from the `judge` node**).
- `clarification-block` — today a dead end; target: choice chips that resume the same search.
- `daily-limit` notice, `disclosure-banner`.
- **Not present:** map (Leaflet installed but unused), restaurant details page (`/r/:placeId` is a stub).
Reuse and evolve these before inventing new components.

## Result-card anatomy (target)
1. Name, rating ★ + review count, price level, open/closed now, distance + walking time.
2. **One-line reason** why it fits this query, in the user's language (from `judge`).
3. Actions: Navigate · Call · Website · Order (Wolt / 10bis / Mishloha, only when a link exists).
4. Badges only for verified facts (kosher, open now). Soft-preference matches go in the reason line, not as badges.

## Required UX states (every spec defines all of them)
| State | Rule |
|---|---|
| Loading | Show progress within 300 ms; stage hints optional; never a blank screen |
| Partial | Show results as soon as they exist; reasons/order links patch in after |
| Success | Results + reasons |
| Empty | Say why in plain words + 2–3 suggested refinements as chips |
| Clarify | One short question + choice chips (+ "use my location") — resumes the same search |
| Not food | Friendly one-liner + example food queries |
| Error / timeout | Human message + retry; loading always ends |
| Limit reached | Explain the daily limit honestly (count searches, not "calls") |

## Layout & language
- Mobile first (360–430 px), thumb-reachable primary actions, bottom sheets over modals.
- **RTL**: `dir` follows the content language; icons that imply direction mirror; numbers and English names inside Hebrew text use `dir="auto"` spans.
- Copy is short, warm and direct. Hebrew is natural spoken Hebrew, not translated English. Every user-facing string in a spec is given in **he + en**.
- Accessibility: contrast AA, 44 px touch targets, labelled buttons, screen-reader text for ratings and icons.

## Analytics events (existing)
- `landing_open` — entry link opened (once per tab, with entry name).
- `search_audit` — per search: outcome, timings, parsed intent (server log; sanitise query text).
- `result_action` — card action: `open | navigate | call | wolt | tenbis | mishloha`.
New features add events with **snake_case names**, a short property list, and no raw PII. A spec lists every new event and the KPI it feeds.

## Spec quality checklist
- [ ] Names the KPI it moves and how it is measured.
- [ ] Hebrew + English example queries and copy.
- [ ] All UX states defined, mobile layout described, RTL considered.
- [ ] Reuses existing components where possible.
- [ ] Respects LLM-first, results-before-words, no-dead-end clarify.
