# Sprint 0 - Baseline and safety net

**Story ID:** FOOD-CR-P0
**Estimate:** 0.5 day (1 dev)
**Risk:** None (no production code changes)
**Depends on:** nothing
**Blocks:** Phases 1-6 (they need a before/after to prove "no regression")

## User story

As a developer refactoring the food app, I want a recorded baseline of build, lint, typecheck and test results for `server/` and `llm-angular/`, so that every later phase can prove it did not make anything worse.

## Why

The code review could not run `tsc`, lint or tests. Project rules say "Lint/Test/Build must pass before suggesting merge", but we do not know today's state. Without a baseline, a red test in Phase 2 cannot be told apart from an old failure.

## Scope

In:
- Run and record results for both projects.
- Record size and smell metrics so progress is measurable.
- Add a baseline file to the repo.

Out:
- Fixing any failure (only record it; fixes are separate tickets).
- Any refactor.

## Tasks

1. `server/`: run `npx tsc --noEmit`, the project lint command, and the test command. Save pass/fail counts and the list of failing tests.
2. `llm-angular/`: run `ng build` (or the configured build), lint, and `jest`. Save the same data.
3. Record metrics (non-test source only):
   - Files over 400 lines (list with line counts).
   - Count of `any` (`as any`, `: any`) per project.
   - Count of `console.*` per project.
   - Count of imports of `server.js` from `services/` and `controllers/`.
   - Number of tracked files under `llm-angular/src` outside `app/`.
4. Write `docs/sprints/baseline.md` with the commands used, date, commit SHA and the numbers above.
5. For each pre-existing failure, create a ticket or tag it `known-failing` so later PRs do not get blamed.
6. Decide the CI gate: which commands must be green on every phase PR.

## Acceptance criteria

- [ ] `docs/sprints/baseline.md` exists with commit SHA, date, commands and results for both projects.
- [ ] Every failing check has a linked ticket or an explicit "known failing" mark.
- [ ] The metrics listed in task 3 are recorded as numbers, not descriptions.
- [ ] The phase PR gate (commands that must pass) is written down and agreed.

## Definition of done

Baseline committed, reviewed, and referenced from the Phase 1 and Phase 2 stories.

## Risks

- Tests may need Redis or API keys. Note which ones and run them with mocks or skip flags; do not change tests in this phase.
- Flaky tests: run the suite twice and mark tests that differ between runs.
