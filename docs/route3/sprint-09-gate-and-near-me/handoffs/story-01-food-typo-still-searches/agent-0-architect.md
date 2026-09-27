# Handoff: Agent 0 — Architect — Story 01

**Agent:** 0 architect  
**Story:** [STORY_01_food_typo_still_searches.md](../../STORY_01_food_typo_still_searches.md)  
**Sprint:** sprint-09-gate-and-near-me  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No new pipeline files. No Angular.

`applyDeterministicRouting` already maps `YES` → `CONTINUE`, `UNCERTAIN` → `ASK_CLARIFY`, and `NO` → `STOP`. Leave that function and the JSON schema alone. A near-miss food word searches only if the prompt classifies it as `YES`.

Edit `GATE2_SYSTEM_PROMPT` in `gate2.stage.ts`. Set `GATE2_PROMPT_VERSION` to `gate2_v9`. Do not lower any confidence number.

---

## Files to add

None.

## Graph

Not Route3. No nodes, no edges.

## Stay on Route2

Keep calling `executeGate2Stage`. Do not replace the stage. The prompt hash is already derived from the prompt string. Do not edit that hash code.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/services/search/route2/stages/gate2.stage.ts` | prompt text and `GATE2_PROMPT_VERSION` only |
| `server/src/services/search/route2/stages/gate2.prompt.test.ts` | created; asserts the version and the new example lines |
| `llm-angular/` | N/A |
| `route3/` | N/A |
| `gate2-query-validity.ts` | N/A |

---

## Decisions (do not reverse without discussion)

- Do not edit `applyDeterministicRouting`, `Gate2LLMSchema`, `GATE2_JSON_SCHEMA`, Intent, or Google.
- Do not change the existing confidence bands (`0.90-1.0`, `0.45-0.65`, `0.95-1.0`, `NO 1.0`).
- A typo of a food or cuisine word is still `YES` in the clear-food band, not a new lower band and not `UNCERTAIN`.

### Prompt additions

Under the YES list, add this line and do not rewrite the rest of the prompt:

```text
4) A misspelling of a food, cuisine, or restaurant word (about one or two letters off) is still YES. Examples: itlain, piza, restarents.
```

Under NO, add sex and porn next to the existing non-food list. Keep profanity with no food intent as `NO`.

Append these examples. Leave the current examples in place:

```text
"itlain next to me" -> {"foodSignal":"YES","confidence":0.92}
"piza" -> {"foodSignal":"YES","confidence":0.95}
"restarents" -> {"foodSignal":"YES","confidence":0.92}
"Italian next to me" -> {"foodSignal":"YES","confidence":0.95}
"what's open near me" -> {"foodSignal":"UNCERTAIN","confidence":0.55}
"sex near me" -> {"foodSignal":"NO","confidence":1.0}
```

`pizza` stays the existing YES example. `what's open near me` has no food-like word, so it stays `UNCERTAIN`. `sex near me` has no food intent, so it is `NO`.

---

## Route2 safety

- [x] Routing function, Intent, and Google untouched
- [x] `ROUTE3_ENABLED` default remains false (not touched)
- [x] Schema unchanged, so `YES` still continues, `UNCERTAIN` still asks, `NO` still stops

---

## Tests / verification

Export `GATE2_PROMPT_VERSION` and `GATE2_SYSTEM_PROMPT` if the test needs them. Run:

`node --test --import tsx src/services/search/route2/stages/gate2.prompt.test.ts`

- [ ] Version is `gate2_v9`
- [ ] The prompt contains the six new example lines above
- [ ] The prompt still contains the `pizza` YES example and the Hebrew “מה פתוח עכשיו” UNCERTAIN example
- [ ] Confidence bands in the prompt are unchanged

Agent 3 calls the live gate (or one search) for `itlain next to me` (YES / CONTINUE), `what's open near me` (UNCERTAIN / ASK_CLARIFY), and `sex near me` (NO / STOP). `pizza` still continues.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 9 story 1`
