# Handoff: Agent 3 — QA — Story 02

**Agent:** 3 QA  
**Story:** [STORY_02_search_text_is_data.md](../../STORY_02_search_text_is_data.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** pass

---

## Summary

Route2 is still the live path. `pizza on Allenby` reaches the model and Google unchanged, and Gate returns `YES`. `weather today` returns `NO` and stops. The fixed line and the 25-word cap are proven by the unit test: the user-message body is not written to the API log.

The API process restarted at 19:47:41, after `frameSearchAsData` was in the call sites. These searches ran at 19:50. There is no `ROUTE3_ENABLED` flag.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/llm/truncate-llm-words.ts` | reviewed, not edited |
| Gate, intent, base filters, mappers, post-constraints, assistant, rewriter | reviewed, not edited |

---

## Decisions (do not reverse without discussion)

- The line and the 25-word cut are the unit test. The live search shows the short query still reaches Gate and Google on Route2.
- Gate `foodSignal` on these two calls was `YES` and `NO`. The schema is still only `NO`, `UNCERTAIN`, and `YES`.

---

## Route2 safety

- [x] Flag off: `meta.source` is `route2` for the food search, `route2_gate_stop` for the non-food search
- [x] Logs say `pipelineVersion: route2`
- [x] `ROUTE3_ENABLED` does not exist

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/llm/truncate-llm-words.test.ts` from `server/`
- [x] Result: pass (5)
- [x] `frameSearchAsData('pizza on Allenby')` is the fixed line, a newline, then `pizza on Allenby`
- [x] A 40-word string is still 25 words after that line and still ends at `w25`

`POST /api/v1/auth/token`, then `POST /api/v1/search?mode=sync` on `http://localhost:3000`:

| Query | Results | Source | Gate |
|-------|---------|--------|------|
| `pizza on Allenby` | 8 | `route2` | `foodSignal` `YES`, route `CONTINUE`, confidence 0.95. Google `textQuery` is `pizza on Allenby` |
| `weather today` | 0 | `route2_gate_stop` | `foodSignal` `NO`, route `STOP`, confidence 1, reason `not_food_related` |

- [x] A short search still reaches the model
- [x] Gate still returns only `NO`, `UNCERTAIN`, or `YES`
- [x] The search after the fixed line is still at most 25 words

---

## Open questions / next agent

None. Story 02 is done.

**Next:** `--g2e-agent -1 sprint 10 story 3`
