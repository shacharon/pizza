# Handoff: Agent -1 — Preflight — Story 01

**Agent:** -1 preflight  
**Story:** [STORY_01_food_typo_still_searches.md](../../STORY_01_food_typo_still_searches.md)  
**Sprint:** sprint-09-gate-and-near-me  
**Date:** 2026-09-27  
**Status:** complete  
**Verdict:** ready

---

## Summary

Server story on Going2Eat (`angular-piza`), not Dating and not Route3. Size **S**.

Gate2 already maps `YES` → `CONTINUE`, `UNCERTAIN` → `ASK_CLARIFY`, and `NO` → `STOP` in `applyDeterministicRouting`. That mapping stays. The prompt is `GATE2_SYSTEM_PROMPT` in `gate2.stage.ts`, version `gate2_v8`. It treats a clear food word as `YES` and a generic “near me” with no food word as `UNCERTAIN`. A near-miss such as `itlain` or `piza` is not in the examples, so the model can refuse it.

This story may edit that prompt only, and bump the version. Do not change the routing function, the schema, Intent, or Google. Do not lower a confidence cutoff so that `UNCERTAIN` searches.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-09-gate-and-near-me/handoffs/story-01-food-typo-still-searches/agent--1-preflight.md` | created |
| `server/src/services/search/route2/stages/gate2.stage.ts` | N/A (later agents; prompt only) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- Allowed edit: `GATE2_SYSTEM_PROMPT` and `GATE2_PROMPT_VERSION` in `gate2.stage.ts`. Bump the version off `gate2_v8`.
- Do not edit `applyDeterministicRouting`, the JSON schema, Intent, or Google.
- Do not lower confidence numbers. `UNCERTAIN` still asks. `NO` still stops.
- Add examples so a word that is almost food is `YES` / `CONTINUE`: `itlain next to me`, `piza`, `restarents`. Add a sex query with no food intent that is `NO` / `STOP`.
- Keep these as they are:
  - `what's open near me` with no food-like word → `UNCERTAIN` / `ASK_CLARIFY`
  - sex, porn, profanity with no food intent, weather, news, tourism → `NO` / `STOP`
  - `pizza` and `Italian next to me` → `YES` / `CONTINUE`
- No `llm-angular` edits. Story 02 (near-me fence) is a different story.

---

## Route2 safety

- [x] Routing code, Intent, and Google stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] The Gate2 prompt text and its version are the exception this story allows

---

## Tests / verification

- [x] Command: read story, sprint README, epic, and `GATE2_SYSTEM_PROMPT` plus `applyDeterministicRouting` in `gate2.stage.ts`
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 9 story 1`
