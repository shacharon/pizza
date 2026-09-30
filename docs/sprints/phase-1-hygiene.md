# Sprint 1 - Repo hygiene and duplicate removal

**Story ID:** FOOD-CR-P1
**Estimate:** 0.5 to 1 day (1 dev)
**Risk:** Low, but verify before deleting (105 files diverged between the two copies)
**Depends on:** Phase 0 baseline
**Blocks:** Phase 2 (so nobody edits the wrong copy of a file)

## User story

As a developer, I want one source of truth for server code and a clean repository, so that I never edit a dead copy, and so that reviews, searches and size metrics show only real code.

## Why

- `llm-angular/src` contains 322 tracked server files (`controllers`, `services`, `infra`, `llm`, `middleware`, `lib`, ...). 209 are identical to `server/src`; 105 have diverged. No build config or dependency references them.
- Generated and binary files are tracked: `llm-angular/front.zip`, `server/body.json`, `server/logs/*.log`, `llm-angular/reports/jest-html-reporters-attach/...`. They create noise in every `git status`.
- `google-maps.stage.new.ts` is referenced nowhere.
- About 40 loose docs and scripts sit in `server/` and `llm-angular/` roots, plus junk at the repo root (`tsc`, `cd`, `CACHED`, `[builder`, `server@1.0.0`).

## Scope

In:
- Remove the duplicated server tree from `llm-angular/src`.
- Untrack generated files and update `.gitignore`.
- Delete the orphaned file.
- Tidy loose files (move or delete).

Out:
- Any change to files in `server/src` other than deleting the orphan.
- Any Angular app code under `llm-angular/src/app`.

## Tasks

### A. Safe removal of the duplicated tree (separate commit)
1. List files that exist in `llm-angular/src/**` (outside `app/`) but not in `server/src` (expected: 8). Review each; move anything valuable to `server/src`.
2. For the 105 diverged files, produce a diff report. For each, decide: server copy is newer/equal (expected), or port the change to `server/src` first. Attach the report to the PR.
3. Check what `llm-angular/src/app` and `main.ts` import from outside `app/`. Keep what Angular really needs. In particular keep `environments/` (Angular file replacements) and `main.ts`, `index.html`, styles and assets. Confirm `config/`, `contracts/`, `lib/`, `utils/` and `scripts/` are not used by the app before removing them.
4. `git rm -r` the verified server-only directories.
5. Run the Angular build and jest to confirm nothing depended on them.

### B. Untrack generated files (separate commit)
1. `git rm --cached` for `llm-angular/front.zip`, `server/body.json`, `server/logs/**`, `llm-angular/reports/**`.
2. Add to `.gitignore`: `logs/`, `*.log`, `*.log.gz`, `*.log.txt`, `reports/`, `*.zip`.
3. Confirm `git status` no longer shows log or report churn after running the app and tests.
4. Note: history still contains these files; purging history is out of scope.

### C. Orphans and loose files (separate commit)
1. Delete `server/src/services/search/route2/stages/google-maps.stage.new.ts` after a final repo-wide search for references.
2. Move the loose `.md` files into `docs/` (keep their names), and the `test-*.ps1/.sh/.js` helpers into `server/scripts/manual/`. Delete anything obsolete (ask owner if unsure).
3. Delete junk at the repo root (`tsc`, `cd`, `CACHED`, `[builder`, `server@1.0.0`) after checking each is empty or accidental.

## Acceptance criteria

- [ ] No tracked source files under `llm-angular/src` outside `app/`, `environments/` and Angular entry files.
- [ ] A written diff report for the 105 diverged files is attached to the PR, with each resolved.
- [ ] Angular build, lint and jest results equal the Phase 0 baseline or better.
- [ ] Server typecheck, lint and tests equal the Phase 0 baseline or better.
- [ ] `git status` is clean after running the server and the test suites.
- [ ] Repository root contains no accidental files.
- [ ] Docker build for the API image still works (nothing copied from deleted paths).

## Definition of done

Three small commits (or three PRs), reviewed, green on the Phase 0 gate.

## Risks and mitigation

- A recent fix lives only in the `llm-angular` copy. Mitigation: task A2 diff report before deleting.
- `amplify.yml` or `bitbucket-pipelines.yml` references a deleted path. Mitigation: search both for each removed path.
- Someone has local work in the duplicate tree. Mitigation: announce the merge window.
