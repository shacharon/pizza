# Baseline (Phase 0, FOOD-CR-P0)

- Date: 2026-09-30
- Commit SHA: `b4919581f4d578df2a9cec2daf8a363205bfd107` (working tree was dirty: uncommitted edits to `search-page.component.*`, new `hero-collapse.*`, sprint docs; no source was changed by this phase)
- Environment: Windows 10, PowerShell, Node per local install. Record only; nothing was fixed.

## server/

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | PASS, 0 errors |
| Lint | none (no `lint` script in `server/package.json`) | NOT AVAILABLE |
| Tests | `npm test` (run twice) | FAIL: 39 tests, 30 pass, 9 fail, 0 skipped; identical in both runs (no flakes) |

Failing in `npm test` (known-failing):
- `tests/agent.reducer.test.ts`: ERR_MODULE_NOT_FOUND `src/agent/reducer.js` (stale import)
- `tests/intent.test.ts`: ERR_MODULE_NOT_FOUND `src/services/intent.js` (stale import)
- `tests/places/phase1-services.test.ts`: ERR_MODULE_NOT_FOUND `.../places/session/session-manager.js`
- `tests/spec-compliance.test.ts`, `tests/street-grouping.test.ts`: file-level failure
- `tests/photos.controller.test.ts` > "should hash photo references in logs": `require is not defined` (ESM)
- `tests/photos-integration.test.ts` > "should hash photo references in logs", "should hash IP addresses in logs (optional)": `require is not defined`
- Parent suites "Logging Security" and "Security - No API Key Exposure" fail as a consequence.

Skipped (need Redis / API keys, not run): `test:integration` (`places-search-integration`), `test:unified` (`unified-search-integration`), `test:ws:e2e`, and `test:all`. `test:resolvers` and `test:ws:unit` were not in the scope of `npm test` and were not run.

## llm-angular/

| Check | Command | Result |
|---|---|---|
| Build | `npx ng build --configuration=production` | PASS (exit 0). Warning: `search-page.component.scss` exceeds budget 12.00 kB by 3.26 kB (15.26 kB) |
| Lint | none (no `lint` script in `llm-angular/package.json`) | NOT AVAILABLE |
| Tests | `npx jest --ci` (run twice; `npm test` is `--watch`, `test:ci` adds coverage) | FAIL: 120 suites (100 failed, 20 passed); 679 tests (281 failed, 398 passed); identical in both runs (no flakes) |

Main failure causes (counts of matching error lines in run 1): `jasmine is not defined` 246, `spyOn is not defined` 60, `Cannot read properties of undefined (reading 'clearAll')` 26, `Cannot find module 'vitest'` 12, other 8 or fewer each. Jest also collects server-style tests under `llm-angular/src/{services,controllers,infra,lib,llm,utils}`; these are a stray server copy inside the Angular project (see metrics). All 100 failing suites are known-failing; full list is in the jest output of this run (re-run with `npx jest --ci` to regenerate).

No ticket system was touched; all failures above are tagged **known-failing** as of this SHA.

## Metrics (tracked non-test `.ts`, excluding `.d.ts`, `tests/`, `__tests__/`, `*.test.ts`, `*.spec.ts`)

| Metric | server/ | llm-angular/ |
|---|---|---|
| Source files counted | 277 | 342 |
| `any` (`as any` + `: any`) | 380 | 459 |
| `console.*` | 66 | 281 |
| Imports of `server.js` from `services/`/`controllers/` | 3 | 3 (in the stray server copy) |
| Files over 400 lines | 14 | 16 |

Tracked files under `llm-angular/src` outside `app/`: **322**.

Files over 400 lines, server/: assistant-sse.orchestrator.ts 882; text-search.handler.ts 675; route2.orchestrator.ts 667; provider-verifier-utils.ts 665; openai.provider.ts 586; websocket-manager.ts 564; provider-deeplink-resolver.ts 536; provider-enrichment.service.ts 495; assistant-llm.service.ts 485; post-results.filter.ts 465; subscription-manager.ts 460; provider-worker.ts 447; redis-session.store.ts 407; gate2.stage.ts 405.

Files over 400 lines, llm-angular/: restaurant-card.component.ts 1047; search.facade.ts 881; i18n.service.ts 824; search-page.component.ts 822; assistant-sse.orchestrator.ts 691; text-search.handler.ts 581; openai.provider.ts 575; provider-deeplink-resolver.ts 565; websocket-manager.ts 549; provider-enrichment.service.ts 491; subscription-manager.ts 460; search-assistant.facade.ts 459; provider-worker.ts 442; search-ws.facade.ts 428; route2.orchestrator.ts 423; redis-session.store.ts 407.

Method: regex counts (`\bas any\b|:\s*any\b`, `\bconsole\.\w+`, `from '...server(.js)?'`) over `git ls-files`; approximate, use the same method in later phases.

## Proposed PR gate (every phase PR; pending team agreement)

Must be green or no worse than this baseline:
1. `server`: `npx tsc --noEmit` = 0 errors (currently green).
2. `llm-angular`: `npx ng build --configuration=production` exits 0 (currently green).
3. `server`: `npm test` has no new failures beyond the 9 listed above (30 passing must stay passing).
4. `llm-angular`: `npx jest --ci` passes count does not drop below 398 tests / 20 suites, failures do not exceed 281 / 100.
5. Metrics (`any`, `console.*`, files over 400 lines, server.js imports) must not increase.
6. Lint: no script exists; adding one is a separate ticket, not a gate yet.
