# Story 02 — Near me stays near

**Sprint 09**

## Scope

When the route is NEARBY, Google must stay inside the user’s circle, including when the query also names a food (Italian, pizza, sushi).

Today a food word switches that call to Text Search with `locationBias` (a hint), so Google can return Tel Aviv. A generic “restaurant near me” already uses `locationRestriction` (a fence).

Change `server/src/services/search/route2/stages/google-maps/nearby-food-query.ts` so a NEARBY food word is also a fence around `userLocation`. Text Search (New) hard restriction is a rectangle: build that box from the same circle. Do not drop the food word.

If nothing is inside the fence, return an empty list. Do not fill it from Tel Aviv or any other city.

This story is allowed to edit that file and its test. Do not change Gate2 or Intent.

## Acceptance criteria

- [ ] `Italian next to me` with GPS calls Google with a hard location restriction around that GPS, not `locationBias`
- [ ] The food word is still sent (Italian is not dropped)
- [ ] A generic `restaurant near me` stays a hard circle, ranked by distance
- [ ] An empty Google response stays empty
- [ ] A query that names a city (`pizza in Tel Aviv`) is unchanged

## Agents

`-1 → 0 → 1 → 2 → 3`
