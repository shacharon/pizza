# Handoff: Agent -1 — Preflight — Story 01

**Agent:** -1 preflight  
**Story:** [STORY_01_cap_model_strings.md](../../STORY_01_cap_model_strings.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

Server story on Going2Eat (`angular-piza`), not Dating and not a Route3 graph. Size **S**.

The model output strings that become the Google query and the city have no character maximum. Landmark `geocodeQuery` already stops at 120. This story cuts the long model strings on a word boundary before they are used. It does not rewrite Gate2, Intent routing, or the Google HTTP client.

Today:

- `TextSearchLLMResponseSchema.textQuery` is `z.string().min(1)` with no max (`schemas.ts` and `static-schemas.ts`).
- Intent `cityText` is `z.string().min(1).nullable().optional()` with no max (`intent.types.ts`). Both return paths in `intent.stage.ts` pass `llmResult.cityText` through.
- `LandmarkMappingSchema.geocodeQuery` is already `min(1).max(120)`. A 121-character value is rejected in `schemas.test.ts`.
- Nearby `keyword` is already `max(80)` in the Zod schema and the static schema. That is not the uncapped Google `textQuery`.
- `truncateWordsForLlm` keeps the first 25 words of the **user** query before it is sent to a model. That is Story 02. Do not change that 25-word cut here.
- When the text-search model call fails, `buildDeterministicMapping` stays. Nearby and landmark already have their own fallbacks. Leave those fallbacks in place.
- After a successful text-search parse, the mapper may append `intent.cityText` onto `textQuery`. The 80-character cut is on the model string before Google sees it. The architect decides whether that cut is before or after the existing city append. Do not remove the append.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-10-llm-guard/handoffs/story-01-cap-model-strings/agent--1-preflight.md` | created |
| `server/src/services/search/route2/stages/route-llm/` schemas and the three mappers | N/A (later agents) |
| `server/src/services/search/route2/stages/intent/` `cityText` only | N/A (later agents) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- Allowed edits only:
  - `server/src/services/search/route2/stages/route-llm/` schemas and `textsearch.mapper.ts`, `nearby.mapper.ts`, `landmark.mapper.ts`
  - `cityText` handling under `server/src/services/search/route2/stages/intent/`
- Caps: Google `textQuery` 80 characters, `cityText` 40 characters, landmark `geocodeQuery` stays at most 120.
- A string over the cap is cut on a word boundary. A short query such as `pizza on Allenby` stays as written.
- If the model call fails, the existing fallback for that mapper stays.
- Do not edit Gate2, Intent route selection, the Google HTTP client, prompts, or `truncateWordsForLlm`.
- Unit tests cover the long-string cut. No `llm-angular` edits.

---

## Route2 safety

- [x] Gate2, Intent routing, and the Google client stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] Schemas, the three route-llm mappers, and intent `cityText` are the exception this story allows

---

## Tests / verification

- [x] Command: read story, sprint README, epic, `schemas.ts`, `static-schemas.ts`, intent `cityText` return paths, and the text-search fallback
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect. One design point sits in the summary: where the 80-character cut sits relative to the existing city append on `textQuery`.

**Next:** `--g2e-agent 0 sprint 10 story 1`
