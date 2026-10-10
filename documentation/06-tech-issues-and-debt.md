# 06 - Technical Issues and Debt Register

- Date: 2026-10-05
- Branch inspected: `refactor/phase-1-hygiene` (HEAD `2c11e9c`, working tree dirty: `.gitignore`, `server/logs/*`, `llm-angular/reports/*`)
- Method: read-only. Used `git ls-files`, `git grep`, file reads, `npx tsc --noEmit` on both projects. No `npm install`, `npm audit` or `npm outdated` was run, because they need network access. Secret values are **never** shown here. Only the location and type are given.
- Related: `docs/sprints/baseline.md` (Phase 0 numbers, 2026-09-30), `docs/sprints/phase-1-hygiene.md`, `docs/sprints/phase-1-diff-report.md` (untracked), `docs/sprints/phase-2-composition-root.md`.

## TL;DR

1. **There are live-looking credentials in git.** A Google API key (`AIza...`, 39 chars) appears in two docs. A Brave Search API key is hard-coded in `server/test-brave-providers.js`. Treat both as leaked: rotate them first, then remove them from the files. History still holds them.
1b. **Two auth bugs allow session takeover** (SEC-11, SEC-12): the cookie auto-refresh re-signs claims from a cookie whose signature failed, and `POST /auth/token` signs any `sessionId` the client sends.
2. **Committed logs hold personal data.** `server/logs/` tracks 32 files (about 2.1 MB). They contain 643 raw `"query"` fields (many in Hebrew), 173 lat/lng pairs and session IDs. Commit `c985269` added them on purpose.
3. **Rate limits and the LLM cost cap can be bypassed.** The rate-limit key is the *first* `X-Forwarded-For` value, and the client controls that value. The LLM budget is "40 calls per session per day". Sessions can be minted freely, and every request with no session shares one `nosession` bucket.
4. **The photos route sends credentialed CORS to any origin** (`origin: true` + `credentials: true`).
5. **The server keeps running after `uncaughtException`.** It logs the error and continues in a possibly corrupted state.
6. **CI does not work and does not test.** Bitbucket uses `node:18` (EOL). The only real step runs `npm run qa`, and its script `src/services/search/qa/run-qa.ts` does not exist. CI never runs unit tests, typecheck or the frontend build.
7. **The test suites mostly fail or never run.** Server `npm test` runs 8 files (9 known failures). 129 of 156 tracked server test files are run by no script, and 15 import `vitest`, which is not installed. Front Jest: 100 of 120 suites fail (Jasmine/Karma-style specs under Jest).
8. **A stale copy of the server lives in `llm-angular/src`** (322 tracked files: 314 shared with `server/src`, 105 of them diverged). Jest still picks it up.
9. **Repo hygiene is poor.** There are 7 empty junk files at the root, 3 zips, a tracked Jest report, 405 tracked `.md` files and 82 loose files in the `server/` and `llm-angular/` roots.
10. **Typecheck is clean** (0 errors in both projects). The deeper debt is design: 7 imports of `server.js` from services/controllers (a cycle), process-local state that blocks scale-out, 369 + 115 uses of `any`, and 5 files of 800 lines or more.

## Severity legend

| Level | Meaning |
|---|---|
| **P0** | Critical / security. Fix now (same day): leaked secrets, data exposure, exploitable abuse. |
| **P1** | High. Real risk to correctness, cost, security posture or delivery. Fix in the next sprint. |
| **P2** | Medium. Maintainability or robustness debt that slows the team down or will bite under load. |
| **P3** | Low. Cleanup and polish. |

Effort: **S** < 0.5 day, **M** 0.5 to 2 days, **L** > 2 days.

## Summary table

| ID | Sev | Area | Title | Effort |
|---|---|---|---|---|
| SEC-01 | P0 | Secrets | Google API key committed in two docs | S (+ rotation) |
| SEC-02 | P0 | Secrets | Brave Search API key hard-coded in `server/test-brave-providers.js` | S (+ rotation) |
| SEC-03 | P0 | Privacy | Server logs with user queries, coordinates and session IDs are tracked in git | S (+ history purge M) |
| SEC-11 | P0 | Auth | Cookie auto-refresh re-signs claims from a cookie whose signature failed | S |
| SEC-12 | P0 | Auth | `POST /auth/token` signs any client-supplied `sessionId` (session takeover) | S |
| SEC-04 | P1 | Security | Rate-limit key trusts the client-controlled first `X-Forwarded-For` hop | S |
| SEC-05 | P1 | Cost / abuse | LLM daily budget is per session; sessions are free to mint; `nosession` bucket is shared | M |
| SEC-06 | P1 | Security | `/api/v1/photos` reflects any Origin with `credentials: true` | S |
| SEC-07 | P2 | Security | JWT stored in `localStorage` (readable by XSS) | M |
| SEC-08 | P2 | Security | `/auth/bootstrap` and `/auth/token` have no dedicated rate limiter | S |
| SEC-09 | P3 | Security | Legacy hard-coded JWT fallback `'dev-secret-change-in-production'` in `jwt-verifier.ts` | S |
| SEC-10 | P3 | Secrets | AWS account ID in `.cursor/aws-deploy.json`; weak sample JWT secrets in docs/scripts | S |
| REL-01 | P1 | Reliability | `uncaughtException` handler logs and keeps serving | S |
| REL-02 | P2 | Performance | `summaryGenStateByRequestId` Map grows forever (one entry per request) | S |
| REL-03 | P2 | Performance | In-memory fallbacks (`memoryCounts`, rate limiter, job store, WS state) are per-process and some are unbounded | M |
| REL-04 | P3 | Reliability | Empty `catch {}` blocks in `googleCacheService.ts` | S |
| CI-01 | P1 | CI | Bitbucket QA step calls a script file that does not exist | S |
| CI-02 | P1 | CI | CI runs no unit tests, no `tsc`, no front build or tests | M |
| CI-03 | P2 | Tooling | Node version drift: CI `node:18` (EOL), `.nvmrc` 20, Docker `node:24-alpine` | S |
| TST-01 | P1 | Tests | Server: 129 of 156 test files are run by no script; 15 need `vitest` (not installed); 9 known failures | M |
| TST-02 | P1 | Tests | Front: Jest + Karma/Jasmine mixed; 100/120 suites fail; Jest also collects the stale server copy | M |
| HYG-01 | P1 | Repo | Stale duplicated server tree in `llm-angular/src` (322 files, 105 diverged) | M |
| HYG-02 | P2 | Repo | Generated and binary files tracked (zips, Jest report, `body.json`); `.gitignore` gaps | S |
| HYG-03 | P3 | Repo | 7 zero-byte junk files at the repo root | S |
| HYG-04 | P3 | Docs | 405 tracked `.md` files; 276 outside `docs/`; 55 inside `src/` trees | M |
| DEP-01 | P2 | Deps | Unused deps: `langchain`, `@langchain/openai`, `seedrandom`, `rimraf` (server); `leaflet`, `ngx-typed-js` (front) | S |
| DEP-02 | P2 | Deps | Front has both Jest and Karma/Jasmine stacks | S |
| DEP-03 | P2 | Deps | Front has both Tailwind v3 (`tailwindcss` 3.4.17, used) and `@tailwindcss/postcss` v4 (unused); two tailwind configs | S |
| DEP-04 | P3 | Deps | `@types/ioredis` (stub; ioredis ships types) and `@types/*` / `ts-node` in prod `dependencies` | S |
| DEP-05 | P3 | Deps | Vulnerability / outdated status unknown (audit not run offline) | S |
| ARC-01 | P2 | Architecture | Services and controllers import `wsManager` from `server.ts` (circular dependency, 7 sites) | M (Phase 2) |
| ARC-02 | P2 | Architecture | Process-local state (WS subscriptions, job store fallback, in-memory request store) blocks horizontal scale | L |
| CQ-01 | P2 | Code quality | `any`: 369 in `server/src`, 115 in `llm-angular/src/app` (non-test) | L |
| CQ-02 | P2 | Code quality | Large files: 11 non-test files over 500 lines, top one 1047 | L |
| CQ-03 | P3 | Code quality | `console.*` in prod code: 58 server, 227 front (117 `console.log`) | M |
| CQ-04 | P3 | Code quality | 12 TODOs in server (3 are unfinished geocoding/hint stubs in code); no lint script in either project | S |
| LLM-01 | P3 | LLM safety | Prompt-injection mitigations exist but are partial (free-text assistant output) | M |

---

## P0 - Critical

### SEC-01 - Google API key committed in two docs (P0, S + rotation)

**Evidence**
- `new-docs/ASSISTANT_NARRATOR_FIX_SUMMARY.md:41`: `GOOGLE_API_KEY=AIza****` (REDACTED)
- `new-docs/GOOGLE_PLACES_TIMEOUT_FIX.md:135`: `GOOGLE_API_KEY=AIza****` (REDACTED)
- Both values are the same string (same SHA-1). The length is 39 characters, which is the real Google API key format. It contains no placeholder markers (`xxx`, `your`, `...`).

**Impact.** Anyone with repo access, or any future leak of the repo, can use this key to call Google Places/Maps on the project's bill. If the key is not restricted by API and referrer/IP, it can be used for any enabled Google API.

**Recommended fix**
1. Check in Google Cloud Console whether the key is live. If it is, **rotate it**, then add API and IP restrictions to the new key.
2. Replace the value in both docs with `GOOGLE_API_KEY=<set-in-env>`.
3. Optionally purge it from history (`git filter-repo --replace-text`). Rotation is the real fix; a purge alone is not enough.
4. Add a secret scanner (gitleaks or trufflehog) as a pre-commit hook and a CI step (see CI-02).

### SEC-02 - Brave Search API key hard-coded (P0, S + rotation)

**Evidence**
- `server/test-brave-providers.js:10`: `const BRAVE_API_KEY = 'BSA****';` (REDACTED, 27 chars). The comment above it says "Your Brave API key from .env", so the real `.env` value was copied in.
- Added in commit `50aa205` (2026-02-14).

**Impact.** Billable third-party key exposure, the same risk as SEC-01.

**Recommended fix.** Rotate the key in the Brave dashboard. Change the script to read `process.env.BRAVE_API_KEY` and exit if it is missing. Move the script to `server/scripts/manual/` (Phase 1 task C).

### SEC-03 - Server logs with user data tracked in git (P0, S; history purge M)

**Evidence**
- `git ls-files server/logs` shows 32 files: 30 `*.log.gz` (2026-01-18 to 2026-09-29), plus `server.log` and `server.log.txt`. Total about 2.1 MB.
- Commit `c985269` "Save the local API logs on this machine" (2026-09-29) added them on purpose.
- Content scan of all tracked logs (64,557 lines, counts only):
  - 643 `"query":"..."` fields (raw search text);
  - 3,698 lines containing Hebrew text;
  - 173 `"lat":` / `"lng":` pairs (user coordinates);
  - session IDs on most request lines.
  - All IP fields seen are loopback (no public IPs found).
- The working tree shows `server/logs/server.log` and `server.log.txt` as modified, and 4 new untracked `.gz` files. Every run creates churn.
- `.gitignore` has no `logs/`, `*.log` or `*.gz` rule. The new uncommitted `.gitignore` change adds only `aws-daily-report/`, and its comment says those files also "contain real user search text". `aws-daily-report/` is correctly untracked (0 files).

**Impact.** Location plus free-text search history plus a stable session ID is personal data under GDPR / Israeli privacy law. It is copied to every clone and every CI runner. Even if these are mostly developer test searches, nothing stops production-like data from landing here.

**Recommended fix**
1. `git rm -r --cached server/logs` and add `logs/`, `*.log`, `*.log.gz`, `*.log.txt` to `.gitignore` (already Phase 1 task B).
2. Decide whether to purge history (`git filter-repo --path server/logs --invert-paths`). This needs a force-push and team coordination.
3. Make the logger write outside the repo by default (for example `LOG_DIR` env), or keep `logs/` ignored.
4. Hash or truncate `query`, and round lat/lng, in persistent logs. A `query-sanitizer.ts` exists in `server/src/lib/telemetry/`; apply it to file logs too.

### SEC-11 - Cookie auto-refresh trusts unverified claims (P0, S)

*Added after review; verified in code. Also described in `04-backend.md`.*

**Evidence.** `server/src/middleware/auto-refresh-expired-cookie.middleware.ts`:
- `cookieNeedsRefresh()` reads the cookie with `jwt.decode` (line 47, no signature check). If `jwt.verify` throws (line 66-76, *invalid signature*), it returns `needsRefresh: true` **together with the decoded, unverified claims**.
- The middleware then takes `sessionId` and `userId` from those claims (lines 150-151). If the session exists in the Redis session store it is reused (line 155), and a new, validly signed cookie is issued for it (line 170). `userId` is carried over without any check.

**Impact.** An attacker who knows or guesses a victim's `sessionId` can forge an unsigned cookie with it and receive a valid signed cookie for that session. Every job, WebSocket and SSE ownership check is keyed on `sessionId`, so this is a session takeover. Any `userId` is also accepted.

**Recommended fix.** Only carry claims over when the signature is valid and the token is merely expired: `jwt.verify(token, secret, { algorithms: ['HS256'], ignoreExpiration: true })`. On a signature failure, discard the claims and mint a brand-new session.

### SEC-12 - `/auth/token` signs a client-chosen sessionId (P0, S)

**Evidence.** `server/src/controllers/auth/token.controller.ts:76`: `const sessionId = parseResult.data.sessionId || generateSessionId();`, then `jwt.sign(...)` at line 83. The route is public.

**Impact.** Same as SEC-11: anyone can get a valid token for a known `sessionId`. Session IDs are partly shown in logs (see SEC-03, R11 in `02-system-architecture.md`).

**Recommended fix.** Ignore the client-supplied `sessionId`. Only re-issue a token for a session the caller already proves it owns (valid signed cookie or valid existing JWT). Otherwise generate a new one.

---

## P1 - High

### SEC-04 - Rate limiting trusts a spoofable `X-Forwarded-For` (P1, S)

**Evidence.** `server/src/middleware/rate-limit.middleware.ts:174-189` (`getClientIp`):
```ts
const firstIp = forwarded.split(',')[0]?.trim();
if (firstIp) return firstIp;
```
No `app.set('trust proxy', ...)` exists anywhere in `server/src`. The same `getClientIp` keys the global (300/min), search (30/min), restaurants (60/min), feedback (10/min) and photo limiters.

**Impact.** Behind an AWS ALB, the *left-most* XFF value is whatever the client sent; the ALB *appends* the real IP. An attacker who rotates `X-Forwarded-For: <random>` gets a fresh bucket on every request. This defeats all IP rate limits, including the protection in front of LLM and Google Places calls.

**Recommended fix.** Set `app.set('trust proxy', <number of hops>)` (for example `1` for ALB only) and use `req.ip`. Or take the right-most untrusted hop. Add a unit test that sends a forged XFF header.

### SEC-05 - LLM cost cap can be bypassed (P1, M)

**Evidence.** `server/src/lib/llm/session-model-budget.ts`:
- `MODEL_CALLS_PER_SESSION_DAY = 40`; key = `llm-budget:${sessionId || 'nosession'}:${utcDay}`.
- Called from `server/src/llm/openai.provider.ts:89, 457, 527` with `opts?.sessionId`.
- `POST /api/v1/auth/bootstrap` and `POST /api/v1/auth/token` mint sessions/tokens with no per-route limiter (`routes/v1/index.ts`; only the global limiter applies, and that limiter is bypassable per SEC-04).

**Impact**
- An abuser mints a new session every 40 calls, so the per-session cap does not limit spend.
- Every caller with no session ID shares one `nosession` counter. One noisy client can exhaust it and block every legitimate sessionless call for the rest of the UTC day.

**Recommended fix.** Add an IP-based (correct IP, see SEC-04) and global daily LLM budget next to the per-session one. Rate-limit `/auth/bootstrap` and `/auth/token` (for example 10 per minute per IP). Reject model calls that have no session instead of sharing a bucket.

### SEC-06 - Photos route allows credentialed CORS from any origin (P1, S)

**Evidence.** `server/src/app.ts` (photo routes block):
```ts
app.use('/api/v1/photos', cors({ ...corsCommon, origin: true }));
```
`corsCommon` has `credentials: true`. With `origin: true`, the `cors` package reflects the request Origin, so any site gets `Access-Control-Allow-Origin: <its origin>` + `Access-Control-Allow-Credentials: true`.

**Impact.** The photo endpoint returns public image bytes, so direct data exposure is low. But it turns `/api/v1/photos` into an open, credentialed proxy to Google Places Media on the project's key. That is a cost-abuse surface (limited only by the spoofable limiter in SEC-04), and it is a bad pattern that is easy to copy to other routes.

**Recommended fix.** Use `credentials: false` for photos. Images do not need cookies, and `<img>` tags do not need CORS at all. Keep `Cross-Origin-Resource-Policy: cross-origin`.

### REL-01 - Process continues after `uncaughtException` (P1, S)

**Evidence.** `server/src/server.ts:349-359`:
```ts
process.on('uncaughtException', (error) => {
  logger.fatal(...);
  // DO NOT call shutdown() here - log and continue
});
```

**Impact.** Node documents that after an uncaught exception the process is in an undefined state (half-written sockets, leaked locks, a corrupted in-memory Map). Continuing can produce wrong results silently. Keeping going for `unhandledRejection` (lines 335-347) is a defensible choice; for `uncaughtException` it is not.

**Recommended fix.** On `uncaughtException`: log, start graceful shutdown with a hard timeout, and exit non-zero. ECS/Docker restarts the task. The Dockerfile already has a `HEALTHCHECK`.

### CI-01 - Bitbucket QA step runs a missing script (P1, S)

**Evidence**
- `bitbucket-pipelines.yml` step "QA Regression Tests": `cd server && npm ci && npm run qa`.
- `server/package.json`: `"qa": "tsx src/services/search/qa/run-qa.ts"`.
- `server/src/services/search/qa/` does not exist (`ls`: No such file or directory), and no tracked file matches `run-qa` or `/qa/`.
- The only other step is `scripts/check-legacy-imports.sh`, a grep for 5 legacy import patterns.

**Impact.** Every pipeline run either fails at the QA step or has been ignored. In practice the repo has no working CI gate.

**Recommended fix.** Remove the QA step or restore the harness. Replace it with the real gate from CI-02.

### CI-02 - No real test, typecheck or build gate in CI (P1, M)

**Evidence**
- Bitbucket runs only the legacy-import grep and the broken QA step (CI-01).
- `amplify.yml` runs `npm ci && npm run build:prod` for the front, with no tests.
- There is no `lint` script in either `package.json` (also noted in `docs/sprints/baseline.md`).
- The front has no CI coverage at all except the Amplify production build.

**Impact.** Regressions reach `main` and production unnoticed. The Phase 0 "PR gate" in `baseline.md` exists only on paper.

**Recommended fix.** Use one Bitbucket pipeline with parallel steps:
1. server `npm ci && npx tsc --noEmit && npm test`
2. front `npm ci && npx ng build --configuration=production && npx jest --ci`, gated against the baseline counts until TST-02 is fixed
3. gitleaks secret scan

Use `node:20` or `node:24` to match runtime (CI-03).

### TST-01 - Server tests are mostly orphaned or broken (P1, M)

**Evidence**
- 156 tracked `*.test.ts` / `*.spec.ts` files under `server/` (53 in `server/tests/`, 103 under `server/src/**`).
- `npm test` lists 8 explicit files. Of all 156 files, 138 are named in no `package.json` script; `test:ws` uses a glob covering 9 more. So **129 test files are never run by any script.**
- 15 server test files `import ... from 'vitest'`, and `vitest` is not a dependency.
- Known failures per `docs/sprints/baseline.md`: 9 of 39 tests. `tests/intent.test.ts` and `tests/agent.reducer.test.ts` import `src/services/intent.js` and `src/agent/reducer.js`, which no longer exist (verified: `src/agent` and `src/services/intent.ts` are absent). Two photo tests use `require` inside ESM.

**Impact.** Most of the test investment gives no protection. Broken tests train people to ignore red results.

**Recommended fix.** Change `test` to discover tests (`node --test --import tsx "src/**/*.test.ts" "tests/**/*.test.ts"`). Port or delete the 15 vitest files. Delete the tests for removed modules. Fix the `require` usage. Then run the full set in CI.

### TST-02 - Front test stack is mixed and mostly red (P1, M)

**Evidence**
- `llm-angular/package.json`: `"test": "jest --watch"`, but `angular.json` → `test.builder` is `@angular-devkit/build-angular:karma`, and devDeps include `karma`, `karma-*`, `jasmine-core`, `@types/jasmine` alongside `jest`, `jest-preset-angular`, `ts-jest`.
- 51 spec files in `src/app`: 11 reference `jasmine`, 19 use Jasmine-style `jasmine.`/bare `spyOn(`.
- Baseline (`docs/sprints/baseline.md`): Jest 120 suites, 100 failed; 679 tests, 281 failed. Top errors: `jasmine is not defined` (246), `spyOn is not defined` (60), `Cannot find module 'vitest'` (12).
- `jest.config.ts` has no `roots` / `testPathIgnorePatterns`, so Jest also collects the stale server copy under `llm-angular/src/{controllers,services,infra,...}` (HYG-01).

**Recommended fix.** Standardize on Jest: convert `jasmine.createSpyObj` / `spyOn` to `jest.fn()` / `jest.spyOn`, set `roots: ['<rootDir>/src/app']`, remove the Karma builder and devDeps (DEP-02). Deleting the stale tree (HYG-01) alone removes many failing suites.

### HYG-01 - Duplicated, stale server tree inside the Angular app (P1, M)

**Evidence**
- `git ls-files llm-angular/src` outside `app/`, `environments/`, `assets/`: `services` 183, `controllers` 36, `lib` 34, `infra` 28, `llm` 8, `middleware` 8, `config` 6, `utils` 3, `scripts` 2, plus `server.ts`, `app.ts`, `routes`, `contracts`, `search-async`, `.vscode`, `controllers.zip`.
- Comparison (this audit): 314 of these paths also exist in `server/src`; **209 are byte-identical, 105 differ**.
- `docs/sprints/phase-1-diff-report.md` (untracked) lists the diverged files. Almost all are "server newer"; 4 are "REVIEW" (`contracts/search.contracts.ts`, `assistant-sse.orchestrator.ts`, `assistant-sse/models.ts`, `search-response.dto.ts`). The last one was ported in commit `fca0ad7`.
- Not built: `llm-angular/tsconfig.app.json` compiles only `src/main.ts`, and nothing in `src/app` imports these folders. The Dockerfile copies only `server/src` and `llm-angular/shared`.
- It is still *used* by Jest (TST-02), and it inflates the baseline metrics: 459 `any` and 281 `console.*` for llm-angular in `baseline.md`, versus 115 and 227 in `src/app` alone.
- Last commit touching the copy: `e24529a` (2026-03-08).

**Impact.** Developers and AI assistants edit the wrong copy (commit `fca0ad7` shows a fix had landed only in the dead copy). Searches, reviews and metrics are polluted, and the test suite is red because of it.

**Recommended fix.** Finish Phase 1 task A. Resolve the 3 remaining REVIEW files, `git rm -r` the server folders from `llm-angular/src`, keep `main.ts`, `index.html`, `styles.scss`, `environments/`, and confirm `ng build` + Jest. Add the legacy-import fence for `llm-angular/src/{services,controllers,...}` so the tree cannot come back.

---

## P2 - Medium

### SEC-07 - JWT kept in `localStorage` (P2, M)

**Evidence.** `llm-angular/src/app/core/auth/auth.service.ts:138, 150` (`localStorage.getItem/setItem(TOKEN_STORAGE_KEY, ...)`). The session ID is also stored in `localStorage` (`auth.service.ts:171, 238`; `api-session.interceptor.ts:35-39`). The server already supports a signed, `httpOnly` session cookie (`controllers/auth/bootstrap.controller.ts:47-55`).

**Impact.** Any XSS (including through a third-party script) can steal the bearer token. No `[innerHTML]` or `bypassSecurityTrust*` was found in `src/app`, which lowers the current risk.

**Recommended fix.** Use cookie-only auth for the browser (docs `COOKIE_ONLY_*` in `llm-angular/` suggest this was already planned). Keep bearer JWT only for non-browser clients.

### SEC-08 - Auth endpoints have no dedicated limiter (P2, S)

**Evidence.** `routes/v1/index.ts` mounts `/auth` with no limiter. `controllers/auth/bootstrap.controller.ts:30` (`POST /`) and `token.controller.ts:51` (`POST /token`) are open. Only the global 300/min limiter applies, and it is spoofable (SEC-04).

**Fix.** Add a low per-IP limiter on `/auth/bootstrap` and `/auth/token`. This also supports SEC-05.

### REL-02 - Unbounded Map per request (P2, S)

**Evidence.** `server/src/services/search/route2/assistant/assistant-llm.service.ts:28`: `const summaryGenStateByRequestId = new Map<string, 'RUNNING' | 'DONE'>();`. It has 3 `.set` calls (lines 172, 307, 328) and **no** `.delete`/`.clear`.

**Impact.** It leaks one entry per search request for the life of the process. That is small per entry but grows without limit, and becomes a slow memory leak in a long-lived ECS task.

**Fix.** Delete the entry on DONE (or after a short TTL), or use the existing `CacheManager` with TTL.

### REL-03 - Per-process in-memory fallbacks (P2, M)

**Evidence**
- `lib/llm/session-model-budget.ts:9`: `memoryCounts` Map is used when Redis is absent or fails. Keys include the day, but nothing ever deletes them, so it is unbounded over uptime.
- `middleware/rate-limit.middleware.ts:45`: in-memory store when Redis is absent. It has cleanup.
- Other module-level Maps (26 `new Map` sites in non-test `server/src`), e.g. `infra/websocket/assistant-ws.publisher.ts:37` `sessions`, `services/assistant/assistant-llm-rewriter.service.ts:74-76` (`cache`, `inFlightCalls`, `requestStats`). Each has a `delete` path, but none has a size cap.

**Impact.** If Redis fails or is off, limits become per-instance (N instances multiply the limit) and memory grows.

**Fix.** Add a max-size/LRU guard to every module-level Map. Treat Redis as required in production, failing closed for the budget.

### CI-03 - Node version drift (P2, S)

**Evidence.** `bitbucket-pipelines.yml`: `image: node:18` (Node 18 is end-of-life since April 2025). `.nvmrc`: `20`. `server/Dockerfile`: `node:24-alpine` (both stages). Server `@types/node` is `^24`.

**Fix.** Choose one major version (24 to match production), use it in `.nvmrc`, CI and `engines` in both `package.json` files.

### HYG-02 - Generated and binary artifacts tracked (P2, S)

**Evidence**
- Zips: `llm-angular/front.zip` (129,620 B, commit `628e7c4` "wip"), `llm-angular/src/controllers.zip` and `server/src/controllers.zip` (124,103 B each, inside source trees).
- Jest HTML report: `llm-angular/reports/index.html`, `reports/jest-html-reporters-attach/index/{index.js,result.js}`. `result.js` is modified in the working tree after every test run.
- `server/body.json` (76 B request sample).
- `.gitignore` covers `dist/` and `coverage/` (correctly untracked: 0 files) but not `reports/`, `logs/`, `*.log*`, `*.zip`.
- Pack size: 13.85 MiB.

**Fix.** Phase 1 task B: `git rm --cached` these files and add `logs/ *.log *.log.gz *.log.txt reports/ *.zip` to `.gitignore`.

### DEP-01 - Unused dependencies (P2, S)

**Evidence** (no import in non-test source):
- server `dependencies`: `langchain`, `@langchain/openai` (0 references in `server/`; the code uses the `openai` SDK directly in `llm/openai.provider.ts`), `seedrandom`, `rimraf` (used only by the `clean` script, so it belongs in devDeps).
- front `dependencies`: `leaflet`, `ngx-typed-js` (0 references in `src/app` or `angular.json`).

**Impact.** A larger attack surface and install size. LangChain pulls in a large transitive tree into the production Docker image (`npm ci --omit=dev`).

**Fix.** `npm uninstall` them. Move `rimraf` to devDeps.

### DEP-02 - Two front test frameworks (P2, S)

See TST-02. Remove `karma`, `karma-chrome-launcher`, `karma-coverage`, `karma-jasmine`, `karma-jasmine-html-reporter`, `jasmine-core`, `@types/jasmine` after converting specs. Also switch `angular.json` `test` to Jest or remove it.

### DEP-03 - Two Tailwind majors (P2, S)

**Evidence.** Installed: `tailwindcss` 3.4.17 and `@tailwindcss/postcss` 4.1.13. `postcss.config.js` uses the v3 `tailwindcss` plugin, and `styles.scss` uses v3 `@tailwind base/components/utilities`. Both `tailwind.config.js` and `tailwind.config.ts` exist; v3 resolves `.js` first, so the `.ts` file is dead.

**Fix.** Remove `@tailwindcss/postcss` and `tailwind.config.ts`, or migrate to v4 properly.

### ARC-01 - Services import the entry point (circular dependency) (P2, M)

**Evidence.** `wsManager` is imported from `server.js` in:
- `controllers/search/search.controller.ts:18`
- `infra/websocket/assistant-ws.publisher.ts:9`
- `infra/websocket/search-ws.publisher.ts:2`
- `services/search/route2/route2.orchestrator.ts:23`
- `services/search/route2/enrichment/provider/provider-worker.ts:39`
- `provider-job-queue.ts:197, 264` (dynamic `await import`)

`services/search/job-store/index.ts:89` exports `searchJobStore` as a `Proxy`.

**Impact.** Import-order bugs, hard-to-test modules, `services → server → app → controllers → services` cycle. Already planned in `docs/sprints/phase-2-composition-root.md`.

**Fix.** Phase 2: a composition root / container, a `RealtimePublisher` interface, and a lint rule that bans `server.js` imports.

### ARC-02 - Horizontal-scale blockers (P2, L)

**Evidence.** WebSocket subscriptions (`infra/websocket/subscription-manager.ts`, `backlog-manager.ts`, `pending-subscriptions.ts`), the in-memory request store (`infra/state/in-memory-request-store.ts`), the in-memory job store fallback (`services/search/job-store/inmemory-search-job.store.ts`), the WS ticket memory store (`lib/ws-ticket-memory-store.ts`) and analytics events (`controllers/analytics/analytics.controller.ts:16-24`, capped at 1000, lost on restart) are all process-local.

**Impact.** More than one API instance breaks WS delivery and job polling unless sticky sessions and Redis are always on.

**Fix.** Phase 3 (Redis pub/sub for WS fan-out, Redis-only job/ticket stores in production).

### CQ-01 - Heavy `any` usage (P2, L)

**Evidence** (regex `as any|: any|<any>`, non-test files): `server/src` 369, `llm-angular/src/app` 115. The baseline used a slightly different regex: 380 server / 459 llm-angular including the stale copy. Server `tsconfig` is `strict` with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, so most of these `any` casts are escape hatches. Example: `app.ts` JSON error handler `(err: any, req: any, res: any, next: any)`.

**Fix.** Add `@typescript-eslint/no-explicit-any` as a warning, use a ratchet in CI, and reduce it per module during Phase 4.

### CQ-02 - Very large files (P2, L)

Non-test `.ts` over 500 lines:

| Lines | File |
|---|---|
| 1047 | `llm-angular/src/app/features/unified-search/components/restaurant-card/restaurant-card.component.ts` |
| 882 | `server/src/controllers/stream/assistant-sse/assistant-sse.orchestrator.ts` |
| 881 | `llm-angular/src/app/facades/search.facade.ts` |
| 826 | `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts` |
| 824 | `llm-angular/src/app/core/services/i18n.service.ts` |
| 675 | `server/src/services/search/route2/stages/google-maps/text-search.handler.ts` |
| 667 | `server/src/services/search/route2/route2.orchestrator.ts` |
| 665 | `server/src/services/search/route2/enrichment/provider/provider-verifier-utils.ts` |
| 586 | `server/src/llm/openai.provider.ts` |
| 564 | `server/src/infra/websocket/websocket-manager.ts` |
| 536 | `server/src/services/search/route2/enrichment/provider-deeplink-resolver.ts` |

The production build also warns that `search-page.component.scss` is 15.26 kB, over the 12 kB budget (`baseline.md`).

**Fix.** Phase 4 decomposition. Start with the SSE orchestrator, which also holds Redis lock code per the Phase 2 story, and with `restaurant-card`.

---

## P3 - Low

### SEC-09 - Hard-coded dev JWT fallback (P3, S)
`server/src/lib/auth/jwt-verifier.ts:29, 90`: `process.env.JWT_SECRET || 'dev-secret-change-in-production'`. The functions are marked `@deprecated ... ONLY FOR TESTS`, and no non-test file imports them (verified). `config/env.ts:81-108` blocks this default in prod/staging. **Fix:** delete `jwt-verifier.ts` or move it to test helpers.

### SEC-10 - Infra identifiers and sample secrets in tracked files (P3, S)
- `.cursor/aws-deploy.json:7`: ECR registry including the 12-digit AWS account ID (redacted here). An account ID is not a secret, but it should not be published.
- Sample JWT secrets (dev placeholders such as `dev-se...`, `this-i...`, `minimu...`) in `server/VERIFICATION_IDOR.ps1:11`, `new-docs/COMMIT_SUMMARY.md:59,75`, `new-docs/VERIFICATION_GUIDE.md:16`, `new-docs/AUTH_HARDENING_COMPLETE.md:163,166`, `new-docs/LOCAL_RESTART_AUTH_FIX.md:196,198`. They look like placeholders. Confirm none is used in a real environment.
- Only `server/.env.example` is tracked. No real `.env` file is tracked (good).

### REL-04 - Swallowed errors (P3, S)
`server/src/lib/cache/googleCacheService.ts:128, 150`: `catch { }`. Add at least a debug log.

### HYG-03 - Junk files at the repo root (P3, S)
`[builder`, `cd`, `tsc`, `docker`, `CACHED`, `server@1.0.0`, `redis-admin-task.json` are all tracked, and all are the empty blob `e69de29`. They look like shell redirection accidents. Delete them (Phase 1 task C).

### HYG-04 - Documentation sprawl (P3, M)
- 405 tracked `.md` files: `new-docs/` 166, `docs/` 111, `llm-angular/` 66, `server/` 57, plus 5 at the root (`DISTANCE_LAYOUT_SUMMARY.md`, `PRODUCTION_COOKIE_SETUP.md`, `PROVIDER_REFACTORING_SUMMARY.md`, `STREAMING_DEBUG.md`, and `COMMIT_MESSAGE_HARDENING.txt` / `LANGUAGE_FIX_EXAMPLE_PAYLOAD.json`).
- 276 `.md` files live outside `docs/` (excluding READMEs). 24 sit inside `server/src` and 31 inside `llm-angular/src`.
- Loose root files: 44 in `server/` (for example 24 `test-*.{js,ps1,sh,bat}` helpers, `VERIFICATION_IDOR.ps1`, `PRODUCTION_ENV_CORS.txt`, `env.performance.txt`) and 38 in `llm-angular/`.
- Most are one-off "fix summary" notes that are now stale. They mislead readers and AI tools.

**Fix.** Move the few still-valid docs into `documentation/` or `docs/`, archive the rest in a single `docs/archive/` folder (or delete them), and move scripts to `server/scripts/manual/`.

### DEP-04 - Type packages in prod dependencies (P3, S)
`server/package.json` `dependencies` includes `@types/ioredis` (ioredis 5 ships its own types; the `@types` package is a deprecated stub) and `@types/ws`. `devDependencies` include `ts-node`, which is unused next to `tsx`. Move or remove them. Also `--legacy-peer-deps` is used in the Dockerfile (`npm ci --legacy-peer-deps`), which hides peer conflicts.

### DEP-05 - Vulnerability status unknown (P3, S)
`npm audit` / `npm outdated` were not run in this audit because they need network access. Run `npm audit --omit=dev` in both projects in CI (CI-02) and record the result.

### CQ-03 - `console.*` in production code (P3, M)
Non-test counts: `server/src` 58 (29 `console.log`; hotspots `scripts/cleanup-*-legacy-cache.ts`, `assistant-llm.service.ts` (6), `utils/fetch-with-timeout.ts` (3)); `llm-angular/src/app` 227 (117 `console.log`). The server has a pino `structured-logger`, and the front has `shared/utils/safe-logger`. Replace the raw `console` calls and add a lint rule.

### CQ-04 - TODOs and missing lint (P3, S)
- 12 TODO markers in `server/src` (0 FIXME/HACK). 7 are in `wolt/*.md` docs. In code: `route2.orchestrator.ts:591` (hint cache never resolved, passes `new Set()`) and `shared/shared-filters.tighten.ts:66, 81, 90` (text parsing and geocoding not implemented, return `null`).
- 3 in `llm-angular/src/app` (1 FIXME).
- Neither project has an ESLint config or a `lint` script.

**Fix.** Add `angular-eslint` and `typescript-eslint` with a baseline, then gate new code.

### LLM-01 - Prompt-injection hardening is partial (P3, M)
**What exists (good):** user text is wrapped by `frameSearchAsData()` (`lib/llm/truncate-llm-words.ts:12`, 30 call sites) with a "search text is data" line. It is cut to 25 words (`truncateWordsForLlm`), the query is limited to 500 chars by zod (`search-request.dto.ts:26`), structured calls use `response_format: json_schema, strict: true` (`llm/openai.provider.ts:226-231`), and the assistant reply is capped (`ASSISTANT_REPLY_MAX_CHARS`).

**Residual risk:** the assistant stream (`assistant-llm.service.ts`) returns free text built from the user query. A crafted query can still steer the wording (brand risk, off-topic replies). No output classifier or deny-list is visible.

**Fix.** Add an output check, at least a short allow/deny pattern pass and a language check, before publishing assistant text. Add a red-team test set to CI.

---

## What was checked and found OK

- Typecheck: `server` `npx tsc --noEmit -p .` gives **0 errors**. `llm-angular` `npx tsc --noEmit -p tsconfig.app.json` gives **0 errors** (exit 0 for both, 2026-10-05).
- No `.env` with real values is tracked. `dist/`, `coverage/`, `node_modules/`, `.angular/` are untracked.
- Photos proxy SSRF: `photos.controller.ts` rebuilds the reference as `places/${placeId}/photos/${photoId}`, checks it with `/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/`, uses the fixed host `https://places.googleapis.com/v1/`, a 10 s timeout and its own rate limiter. Low SSRF risk.
- Outbound timeouts: the OpenAI provider uses `AbortController` with a timeout. Brave/CSE clients use abort controllers with `clearTimeout`. `fetch-with-timeout.ts` is used for Google. The HTTP server sets 30 s request/response timeouts.
- WebSocket `maxPayload` is 64 KB (`websocket-manager.ts:112`).
- Redis TLS uses `rejectUnauthorized: true` (`lib/redis/redis-client.ts:31-42`).
- Cookies: the session cookie is `httpOnly`, `secure` in production, and `SameSite` is configurable (default `Lax`) (`bootstrap.controller.ts:47-55`).
- Prod config fails fast on a missing or short `JWT_SECRET` and on `SESSION_COOKIE_SECRET == JWT_SECRET` (`config/env.ts`).
- Error middleware hides stack traces and raw messages in production (`middleware/error.middleware.ts`).
- Debug routes: `/api/v1/debug/env` returns 403 in production. `/debug/prod-config` needs `DEBUG_KEY`. `/debug/redis` is off in production unless `ENABLE_DEBUG_REDIS=true`.
- Front: no `[innerHTML]` / `bypassSecurityTrust*` in `src/app`. The production environment forces `https://` / `wss://`.

---

## Branch `refactor/phase-1-hygiene` - status vs plan

| Phase / task | Status | Evidence |
|---|---|---|
| Phase 0 - baseline | **Done** | `docs/sprints/baseline.md` committed in `5524cd6` |
| Phase 1 A1-A2 - diff report for diverged files | **Done, not committed** | `docs/sprints/phase-1-diff-report.md` is untracked (103 rows, 4 REVIEW) |
| Phase 1 A2 - port valuable changes | **Partial** | `fca0ad7` ported `requestLocationPermission`; 3 REVIEW files remain unresolved in the report |
| Phase 1 A3-A5 - remove duplicate tree | **Not started** | 322 files still tracked under `llm-angular/src` outside `app/` |
| Phase 1 B - untrack generated files + `.gitignore` | **Not started** | logs/zips/reports still tracked; uncommitted `.gitignore` change adds only `aws-daily-report/` |
| Phase 1 C - orphan `google-maps.stage.new.ts`, loose files, root junk | **Not started** | junk files and loose scripts still present |
| Phase 2 - composition root | **Not started** | 7 `server.js` imports remain (ARC-01) |
| Unrelated work on this branch | - | `2c11e9c` adds a `landing_open` analytics feature. This mixes feature work into a hygiene branch; consider moving it to its own branch/PR. |
| Untracked `docs/infra/` | - | New infra docs not yet committed |

---

## Suggested remediation plan

### Sprint A - "Stop the bleeding" (about 3 to 4 dev-days)
1. **SEC-01, SEC-02:** rotate the Google and Brave keys today; scrub the files; add gitleaks (pre-commit + CI).
2. **SEC-03, HYG-02, HYG-03:** finish Phase 1 task B and junk removal; `.gitignore` for logs/reports/zips; decide on the history purge with the team (one coordinated `git filter-repo` covering logs, zips and the two keys).
3. **SEC-04, SEC-06, SEC-08:** `trust proxy` + `req.ip`; `credentials:false` on photos; limiter on `/auth/*`.
4. **REL-01, REL-02:** exit on `uncaughtException`; fix the request-state Map leak.
5. **CI-01, CI-03:** delete the dead QA step; move CI to Node 24; add server `tsc --noEmit` and the front production build as blocking steps.

### Sprint B - "Make tests mean something" (about 5 dev-days)
1. **HYG-01:** Phase 1 task A, removing the duplicate server tree from `llm-angular/src` (resolve the last 3 REVIEW files first).
2. **TST-02, DEP-02:** convert Jasmine specs to Jest, set `roots`, remove Karma. Target: front Jest green.
3. **TST-01:** test discovery glob for the server; port or delete the vitest files; remove the dead tests; fix the ESM `require`.
4. **CI-02:** make server tests and front Jest blocking in Bitbucket; add `npm audit --omit=dev` (report-only at first, DEP-05).
5. **SEC-05:** IP-based and global LLM daily budget; reject sessionless model calls.
6. **DEP-01, DEP-03, DEP-04:** remove unused deps and the second Tailwind.

### Sprint C - "Structure" (about 5 to 8 dev-days)
1. **ARC-01:** Phase 2 composition root; remove `server.js` imports and the `searchJobStore` Proxy; add a lint rule.
2. **CQ-04, CQ-01, CQ-03:** add ESLint to both projects with `no-explicit-any` and `no-console` as ratcheted warnings.
3. **REL-03, ARC-02:** size caps on module Maps; Redis required in production; plan Phase 3 (Redis pub/sub WS fan-out).
4. **SEC-07:** move browser auth to cookie-only.
5. **HYG-04:** consolidate docs into `documentation/` + `docs/archive/`.
6. **CQ-02:** start splitting `assistant-sse.orchestrator.ts` and `restaurant-card.component.ts`.
