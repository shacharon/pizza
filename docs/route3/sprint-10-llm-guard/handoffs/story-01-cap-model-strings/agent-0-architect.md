# Handoff: Agent 0 — Architect — Story 01

**Agent:** 0 architect  
**Story:** [STORY_01_cap_model_strings.md](../../STORY_01_cap_model_strings.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No graph nodes. No Angular. No schema `maxLength` on the strings that are cut.

`textQuery` and `cityText` pass validation with no character maximum, so a long model string is used as written. Cut those two after a successful parse, on a word boundary. Landmark `geocodeQuery` already rejects past 120 characters. Nearby `keyword` already rejects past 80. Leave those rejects in place.

The 80-character cut on `textQuery` runs before the existing city append. The append stays.

---

## Files to add

| Path | Purpose |
|------|---------|
| `server/src/services/search/route2/stages/route-llm/cap-model-string.ts` | `capModelString` and the two caps |
| `server/src/services/search/route2/stages/route-llm/cap-model-string.test.ts` | Word-boundary cases |

## Graph

Not Route3. No nodes, no edges. `ROUTE3_ENABLED` stays unset / false.

## Stay on Route2

Keep `executeIntentStage` and `executeTextSearchMapper`. Do not replace them. Gate2, the Google HTTP client, prompts, and `truncateWordsForLlm` stay imported and unchanged.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/route-llm/cap-model-string.ts` | created |
| `server/src/services/search/route2/stages/route-llm/cap-model-string.test.ts` | created |
| `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts` | cap `textQuery` on the success path, before the city append |
| `server/src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts` | one case: a long model `textQuery` is shortened |
| `server/src/services/search/route2/stages/intent/intent.stage.ts` | cap `cityText` on both success returns |
| `nearby.mapper.ts`, `landmark.mapper.ts`, `schemas.ts`, `static-schemas.ts` | N/A |
| `llm-angular/`, `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Caps: `textQuery` 80, `cityText` 40. Length is JavaScript string length.
- Do not add Zod `.max` or JSON Schema `maxLength` on `textQuery` or `cityText`. A max there rejects the parse and takes the failure path. This story shortens a successful model string.
- Do not edit `LandmarkMappingSchema` or `NearbyMappingSchema`. `geocodeQuery` stays `max(120)` and still rejects 121 characters. Nearby `keyword` stays `max(80)`.
- Do not edit `nearby.mapper.ts` or `landmark.mapper.ts`.
- Do not edit `buildDeterministicMapping`, `createFallbackResult`, prompts, Gate2, or the Google client.
- Do not change `truncateWordsForLlm` (25 words on the user query). That is story 2.
- `intent.stage.ts` may import `capModelString` from `../route-llm/cap-model-string.ts`. No other new intent → route-llm import.

### Cut

```ts
export const MODEL_TEXT_QUERY_MAX_CHARS = 80;
export const MODEL_CITY_TEXT_MAX_CHARS = 40;

export function capModelString(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  const head = trimmed.slice(0, maxChars);
  const breakAt = head.lastIndexOf(' ');
  if (breakAt <= 0) {
    return head;
  }
  return head.slice(0, breakAt).trimEnd();
}
```

A string at or under the cap is returned trimmed. `pizza on Allenby` has no extra space, so it stays `pizza on Allenby`. A longer string is cut at the last space inside the cap. A single token with no space inside the cap is cut at `maxChars`. The result is never longer than `maxChars` and never empty for a non-empty input.

### Where it runs

Intent, both success returns (the `NEARBY` without location branch, and the normal return). Not the `catch` fallback:

```ts
const cityText = llmResult.cityText
  ? capModelString(llmResult.cityText, MODEL_CITY_TEXT_MAX_CHARS)
  : undefined;
```

Text search, success path only, immediately after region/language override and before the city-append block:

```ts
mapping.textQuery = capModelString(mapping.textQuery, MODEL_TEXT_QUERY_MAX_CHARS);
```

Then the existing append of `intent.cityText` stays. The city is already at most 40 characters. The final Google string may be the capped query plus that city. Do not cap again after the append, or the city can be chopped off.

---

## Route2 safety

- [x] Gate2, Intent route selection, and the Google client stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [x] Landmark 120 and nearby keyword 80 stay reject-on-overflow
- [ ] `textsearch.mapper.ts` success path and intent `cityText` returns are the edits this story allows

---

## Tests / verification

Run:

```text
node --test --import tsx src/services/search/route2/stages/route-llm/cap-model-string.test.ts src/services/search/route2/stages/route-llm/__tests__/textsearch-mapper.test.ts src/services/search/route2/stages/route-llm/schemas.test.ts
```

from `server/`.

- [ ] `capModelString('pizza on Allenby', 80)` is `pizza on Allenby`
- [ ] A string longer than 80 with spaces is cut at the last space inside 80, and the result length is ≤ 80
- [ ] A single token longer than 80 is cut to 80 characters
- [ ] The same three cases hold for a cap of 40
- [ ] Mocked text-search LLM returns a `textQuery` longer than 80; the mapping `textQuery` is the capped string. With `intent.cityText` set to a short city that is not already in the query, that city is still appended after the cap
- [ ] Existing `schemas.test.ts` case `rejects geocodeQuery too long` still passes

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 10 story 1`
