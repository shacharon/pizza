# Story 01 — A food typo still searches

**Sprint 09**

## How loose

Do not lower the confidence number. `UNCERTAIN` always asks, and `NO` always stops. The looseness is one case only.

A word that is almost a food word counts as food, so the search runs.

- `itlain next to me`, `piza`, `restarents` → `YES`, route `CONTINUE`
- `what's open near me` with no food-like word → stays `UNCERTAIN`, route `ASK_CLARIFY`
- Sex, porn, profanity with no food intent, weather, news, tourism → `NO`, route `STOP`

## Scope

Update the Gate2 prompt in `server/src/services/search/route2/stages/gate2.stage.ts` only. Bump the prompt version. Add examples for a cuisine typo (`itlain`) and for a sex query that must stop.

This story is allowed to edit that prompt. Do not change routing code, Intent, or Google.

## Acceptance criteria

- [ ] `itlain next to me` is `foodSignal` YES and route CONTINUE
- [ ] A generic near-me line with no food-like word is still UNCERTAIN / ASK_CLARIFY
- [ ] A sex or other clearly non-food query is NO / STOP
- [ ] `pizza` and `Italian next to me` still CONTINUE

## Agents

`-1 → 0 → 1 → 2 → 3`
