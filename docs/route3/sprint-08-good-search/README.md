# Sprint 08 — Show results, then narrow

Not Route3. Plain text stays the only way to search. No chips.

Today a food word with no GPS and no city returns `LOCATION_REQUIRED` and zero places (`textsearch-location.guard.ts`). People do not read that, and they do not turn location on. They retype the same word.

This sprint still runs the search and shows places. The helper is the question already asked today (`MISSING_LOCATION`: enable location, or write a city or area). Same message, same question. It sits above the list. It never replaces the list.

| # | Story |
|---|--------|
| 1 | [STORY_01_search_without_location.md](./STORY_01_search_without_location.md) |
| 2 | [STORY_02_narrow_helper.md](./STORY_02_narrow_helper.md) |

Run story 1, then 2. Story 2 needs results from story 1.

```text
--g2e-agent -1 sprint 8 story 1
```
