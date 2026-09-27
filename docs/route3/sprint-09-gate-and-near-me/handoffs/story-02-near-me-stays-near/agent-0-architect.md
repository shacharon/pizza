# Handoff: Agent 0 — Architect — Story 02

**Agent:** 0 architect  
**Story:** [STORY_02_near_me_stays_near.md](../../STORY_02_near_me_stays_near.md)  
**Sprint:** sprint-09-gate-and-near-me  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No new pipeline files. No Angular.

`buildNearbyGoogleCall` sends a real food word to Text Search with `locationBias`. Text Search (New) cannot take a circle as a hard fence. Replace that bias with `locationRestriction.rectangle` built from the same center and `radiusMeters`. Keep `textQuery`. Leave the generic Nearby Search branch as a circle ranked by distance.

`nearby-search.handler.ts` already posts `googleCall.body` through `callGooglePlacesSearchText` and returns `[]` when Google returns no places. Do not edit that handler, and do not edit `text-search.handler.ts` (city text search).

---

## Files to add

None.

## Graph

Not Route3. No nodes, no edges.

## Stay on Route2

Keep calling `buildNearbyGoogleCall` from `executeNearbySearch`. Do not replace the nearby handler.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/google-maps/nearby-food-query.ts` | food-word body uses a rectangle; add `circleToTextSearchRectangle` |
| `server/src/services/search/route2/stages/google-maps/__tests__/nearby-food-query.test.ts` | bias assertions become restriction assertions |
| `nearby-search.handler.ts` | N/A |
| `text-search.handler.ts` | N/A |
| `gate2.stage.ts` | N/A |
| `llm-angular/` | N/A |
| `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Do not edit Gate2, Intent, `nearby-search.handler.ts`, or `text-search.handler.ts`.
- Generic keywords (`restaurant`, `restaurants`, `food`, `place`, `places`, `מסעדה`, `מסעדות`, `אוכל`) stay `{ api: 'searchNearby' }` with `locationRestriction.circle`, `includedTypes: ['restaurant']`, and `rankPreference: 'DISTANCE'`.
- Any other keyword stays `{ api: 'searchText' }`. `nearbyFoodTextQuery` is unchanged, so `Italian` on `IL` stays `Italian`, and a non-IL `pizza` stays `pizza restaurant`.
- The text-search body must not contain `locationBias`. It must contain:

```text
locationRestriction: {
  rectangle: circleToTextSearchRectangle(lat, lng, radiusMeters)
}
```

- Rectangle math, in this file:

```text
metersPerDegreeLat = 111320
dLat = radiusMeters / 111320
dLng = radiusMeters / (111320 * max(cos(lat in radians), 0.01))
low  = { latitude: lat - dLat, longitude: lng - dLng }
high = { latitude: lat + dLat, longitude: lng + dLng }
```

- Do not send both `locationBias` and `locationRestriction`. Google rejects that pair.
- Do not add a second search when the rectangle is empty. An empty Google list stays empty.
- `pizza in Tel Aviv` is the text-search mapping, not `buildNearbyGoogleCall`. Leave it alone.

---

## Route2 safety

- [x] Gate2, Intent, and city Text Search untouched
- [x] `ROUTE3_ENABLED` default remains false (not touched)
- [x] Generic nearby circle and distance rank stay

---

## Tests / verification

Run:

`node --test --import tsx src/services/search/route2/stages/google-maps/__tests__/nearby-food-query.test.ts`

- [ ] Keyword `Italian` (region `IL`, lat `32.16`, lng `34.8`, radius `500`) is `searchText`, `textQuery` is `Italian`, body has no `locationBias`, and `locationRestriction.rectangle` equals `circleToTextSearchRectangle(32.16, 34.8, 500)`
- [ ] The rectangle contains the center: `low.latitude < 32.16 < high.latitude` and the same for longitude
- [ ] Keyword `אסייתית` still sends that word as `textQuery` and uses the rectangle, not a bias circle
- [ ] Keyword `מסעדה` is still `searchNearby`, circle radius `500`, `rankPreference` `DISTANCE`, no `textQuery`
- [ ] Keyword `pizza` with region `US` is still `textQuery` `pizza restaurant` and uses the rectangle

Agent 3 may run one GPS search for `Italian next to me`. The request shape is proven by this unit test. An empty Google payload is already returned as an empty list by the handler; do not add a live empty-city fallback.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 9 story 2`
