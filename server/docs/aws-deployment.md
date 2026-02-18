# AWS Deployment Checklist (Cookie-Only Auth)

Deploying the API to AWS (ECS/EC2/App Runner, etc.) with **cookie-only** session auth. Frontend is assumed at `https://www.going2eat.food` or `https://app.going2eat.food`, API at `https://api.going2eat.food`.

---

## Required environment variables (server)

Set these in your task definition / environment (e.g. ECS Task Definition, `.env` on EC2, or Parameter Store).

| Variable | Required | Notes |
|----------|----------|--------|
| `NODE_ENV` | Yes | `production` |
| `JWT_SECRET` | Yes | ≥ 32 characters (used for legacy JWT; keep set) |
| `SESSION_COOKIE_SECRET` | Yes | ≥ 32 characters, **must differ from JWT_SECRET** – used to sign session cookie |
| `SESSION_COOKIE_TTL_SECONDS` | No | Default `3600` (1 hour) |
| `FRONTEND_ORIGINS` | Yes | Comma-separated exact origins, e.g. `https://www.going2eat.food,https://app.going2eat.food` – no wildcards in prod |
| `OPENAI_API_KEY` | Yes | For assistant/LLM |
| `GOOGLE_API_KEY` | Yes | For search/features |
| `BRAVE_SEARCH_API_KEY` | Yes | For provider deep links |
| `REDIS_URL` | Yes* | For WS tickets and job store; e.g. ElastiCache URL |

\* If you use Redis for job store / WS auth (`ENABLE_REDIS_JOBSTORE=true`).

---

## Cookie-only auth: cross-subdomain (API vs app)

If the **API** is on `api.going2eat.food` and the **frontend** is on `app.going2eat.food` or `www.going2eat.food`, the browser treats that as cross-origin. So the session cookie must be sent cross-site:

| Variable | Value | Purpose |
|----------|--------|---------|
| `COOKIE_DOMAIN` | `.going2eat.food` | Cookie is sent to all `*.going2eat.food` (including API and app) |
| `COOKIE_SAMESITE` | `None` | Allow cookie on cross-origin requests (required when domain is shared but origins differ) |

**Important:** With `SameSite=None`, the cookie is only sent over HTTPS. The server already sets `Secure` in production.

If API and frontend are the **same origin** (e.g. same domain and port), you can leave `COOKIE_DOMAIN` empty and use default `COOKIE_SAMESITE=Lax`.

---

## Optional / feature env vars

- `ENABLE_REDIS_JOBSTORE=true` – use Redis for search jobs
- `ENABLE_REDIS_CACHE=true` – use Redis for caches
- `REDIS_JOB_TTL_SECONDS`, `GOOGLE_CACHE_TTL_SECONDS` – TTLs
- `CACHE_INTENT=true`, `INTENT_CACHE_TTL_SECONDS` – intent cache
- `FEATURE_SSE_ASSISTANT=true` – SSE assistant (recommended)
- `ASSISTANT_SSE_TIMEOUT_MS=20000` – SSE timeout
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` – rate limiting
- `DEBUG_KEY` – only if you need `/api/v1/debug/*` in prod

---

## Frontend (Angular production build)

- Build with `ng build --configuration=production`.
- `environment.production.ts` already sets:
  - `apiUrl`: `https://api.going2eat.food`
  - `wsBaseUrl`: `wss://api.going2eat.food`
  - `authMode`: `cookie_only`
  - `features.useSseAssistant`: `true`
- Deploy the built artifacts to S3 + CloudFront, or your app host; ensure the app is served over **HTTPS** from the same origins you put in `FRONTEND_ORIGINS`.

---

## CORS and cookies checklist

1. **FRONTEND_ORIGINS** – Must include every origin the browser uses (e.g. `https://app.going2eat.food`). No `*` in production.
2. **HTTPS** – API and frontend must use HTTPS in prod (cookies with `Secure` and `SameSite=None`).
3. **Credentials** – Frontend already uses `withCredentials: true` for API calls so the session cookie is sent.
4. **Cookie domain** – For `api.` vs `app.` subdomains, set `COOKIE_DOMAIN=.going2eat.food` and `COOKIE_SAMESITE=None`.

---

## Quick copy-paste (production, cross-subdomain)

```bash
NODE_ENV=production
JWT_SECRET=<at-least-32-chars>
SESSION_COOKIE_SECRET=<at-least-32-chars-different-from-jwt>
SESSION_COOKIE_TTL_SECONDS=3600
FRONTEND_ORIGINS=https://www.going2eat.food,https://app.going2eat.food
COOKIE_DOMAIN=.going2eat.food
COOKIE_SAMESITE=None

OPENAI_API_KEY=<your-key>
GOOGLE_API_KEY=<your-key>
BRAVE_SEARCH_API_KEY=<your-key>
REDIS_URL=redis://your-elasticache-endpoint:6379
ENABLE_REDIS_JOBSTORE=true
ENABLE_REDIS_CACHE=true
```

Replace placeholders and add any optional vars (rate limits, debug, etc.) as needed.
