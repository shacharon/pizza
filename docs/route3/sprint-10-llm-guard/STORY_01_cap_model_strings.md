# Story 01 — Cap the strings the model writes

**Sprint 10**

## What

The model may write the Google text query, the city, and the landmark. Those strings have no maximum length. Cut them before they are used.

- Google `textQuery`: 80 characters
- `cityText`: 40 characters
- Landmark `geocodeQuery`: keep the existing 120-character cap
- A string over the cap is cut on a word boundary. If the model call fails, the existing fallback stays

## Scope

`server/src/services/search/route2/stages/route-llm/` schemas and the three mappers (text search, nearby, landmark), plus intent `cityText` in `server/src/services/search/route2/stages/intent/`.

This story may edit those files only. Do not change Gate2 routing or the Google HTTP client.

## Acceptance criteria

- [ ] A model `textQuery` longer than 80 characters is shortened before Google is called
- [ ] A model `cityText` longer than 40 characters is shortened
- [ ] Landmark geocode stays at most 120 characters
- [ ] A normal short query such as `pizza on Allenby` is unchanged
- [ ] Unit tests cover the long-string cut

## Agents

`-1 → 0 → 1 → 2 → 3`
