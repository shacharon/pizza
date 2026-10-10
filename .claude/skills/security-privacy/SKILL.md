---
name: security-privacy
description: Security and privacy rules for Going2Eat — auth/session claims, ownership checks, client IP, rate limits and LLM budget, secrets, PII in logs and prompts, prompt injection, CORS/cookies, SSRF. Load when designing, writing or reviewing anything touching auth, sessions, logging, external input, model prompts or HTTP endpoints.
---

# Security & privacy — Going2Eat

Known open issues (do not reintroduce, fix when in scope): `documentation/06-tech-issues-and-debt.md` SEC-01…SEC-12.

## 1. Auth & sessions
- **Only verified claims grant anything.** Use `jwt.verify` with a pinned algorithm. `jwt.decode` is for logging/diagnostics only. (SEC-11: auto-refresh re-signed claims from a cookie whose signature failed.)
- **Never sign identifiers chosen by the client.** A session id comes from the server or from an already-verified token. (SEC-12: `/auth/token` signs any `sessionId`.)
- Refreshing an expired token: `jwt.verify(..., { ignoreExpiration: true })` — signature still required.
- Tokens in HttpOnly, Secure, SameSite cookies. Don't add new tokens to `localStorage`.

## 2. Ownership & authorization
- Every resource keyed by request/job/thread (`requestId`, LangGraph `thread_id`, SSE stream) checks it belongs to the caller's verified session.
- **Fail closed**: not found, store error or missing session → deny (403/404), never allow. (Today the SSE ownership validator fails open and `GET /search/:requestId` has no check.)
- Ids are unguessable (UUID v4 / random 128-bit), but unguessability is not authorization.

## 3. Client IP, rate limits, budgets
- Behind the ALB: `app.set('trust proxy', 1)` and use `req.ip`. **Never take the first `X-Forwarded-For` value** — the client controls it.
- Rate-limit session-minting endpoints (`/auth/bootstrap`, `/auth/token`) per IP.
- LLM cost: per-session budget **plus** per-IP and global daily caps; requests without a session are rejected, not pooled.
- Every LangGraph run has a recursion limit and a max number of model calls.

## 4. Secrets
- Secrets only from env/SSM via `config/`. Never in code, tests, docs, examples, logs or commit messages.
- If you find a secret in the repo: report its location and type only (never the value) and flag rotation.
- Placeholders look like `<set-in-env>`, never real-looking strings.

## 5. Personal data (PII)
Search text + location + stable session id = personal data (GDPR / Israeli privacy law).
- Logs: no raw query text by default (use `lib/telemetry/query-sanitizer.ts` or a hash), coordinates rounded to ~2 decimals, session ids truncated, no IPs in app logs unless needed for abuse handling.
- Prompts: send the model only what the task needs; no session ids, no precise coordinates unless required for the call.
- Never commit logs, reports or data exports (`server/logs/`, `aws-daily-report/`).
- Tracing (LangSmith or similar) sends prompts to a third party — only with explicit owner approval and sanitised inputs.

## 6. LLM / prompt injection
- User text, reviews and provider pages are **untrusted data**: put them in clearly delimited fields, tell the model they are data, and never let them alter instructions or tool choice.
- Validate all model output with zod; allow-list anything that becomes a URL, HTML, DB key or redirect.
- Never render model output as raw HTML in Angular (no `innerHTML` / `bypassSecurityTrust*`).

## 7. HTTP surface
- zod-validate body, query and params; reject unknown fields on write endpoints.
- CORS: explicit allow-list from config, the same list for HTTP and WebSocket; never `origin: true` with `credentials: true` (SEC-06).
- Outbound fetches built from user/model data (photos proxy, provider links): allow-list hosts, block private IP ranges, set timeouts and size limits (SSRF).
- Errors: no stack traces or internal messages in responses; log them server-side with `requestId`.

## Reviewer checklist
- [ ] Access decisions use verified claims only; no client-chosen ids signed.
- [ ] Ownership checked and fails closed.
- [ ] `req.ip` with trust proxy; rate limits/budgets on new endpoints and model calls.
- [ ] No secrets; no raw PII in logs, prompts, fixtures or docs.
- [ ] Untrusted text delimited; model output validated and never rendered as HTML.
- [ ] CORS/SSRF rules respected on new endpoints and outbound calls.
