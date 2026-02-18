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
REDIS_URL=rediss://your-elasticache-endpoint:6379
ENABLE_REDIS_JOBSTORE=true
ENABLE_REDIS_CACHE=true
```

Replace placeholders and add any optional vars (rate limits, debug, etc.) as needed.

---

## Redis (ElastiCache) – "Redis connection required for WS_REQUIRE_AUTH=true"

The server **exits on boot** if `WS_REQUIRE_AUTH=true` (default) and it cannot connect to Redis. Your logs show `redis_boot_status: FAILED` and `redisEnabled: false` – so the connection to `REDIS_URL` is failing.

### Why it works locally but not on AWS

| | **Local** | **Prod (AWS)** |
|---|-----------|----------------|
| **REDIS_URL** | `redis://localhost:6379` | `rediss://master.food-redis-cluster.xxx.cache.amazonaws.com:6379` |
| **TLS** | No (`redis://`) | Yes (`rediss://`) – ElastiCache in-transit encryption |
| **Network** | Same machine | ECS task → ElastiCache over VPC (different host) |
| **DNS** | localhost | AWS internal hostname – **resolves only inside the VPC** |

So locally: no TLS, same box → connection succeeds. On AWS: TLS + another host in the VPC → connection can fail if:

1. **TLS/SNI** – ElastiCache expects the client to send the hostname in the TLS handshake (SNI). The code now sets `tls.servername` to the URL hostname for `rediss://` so SNI is correct.
2. **Security groups** – ElastiCache must allow **inbound TCP 6379** from your ECS task security group (not 0.0.0.0/0).
3. **VPC** – ECS and ElastiCache must be in the same VPC (or have routing); the task must use VPC DNS so the cache hostname resolves.
4. **Timeout** – First connection can be slow; boot uses 8s timeout and 3 retries in prod.

### What to check

1. **Security groups**
   - ECS task (or EC2) **outbound**: allow TCP to the ElastiCache security group (or CIDR of the cache subnet) on port **6379**.
   - ElastiCache **inbound**: allow TCP **6379** from the ECS task security group (or the ALB/task CIDR). No 0.0.0.0/0.

2. **VPC and subnets**
   - ECS tasks and ElastiCache must be able to reach each other (same VPC, or peered; routing so that the task’s subnet can reach the cache subnet).

3. **REDIS_URL format**
   - **TLS (in-transit encryption):** use `rediss://` (double s). Example:  
     `rediss://master.food-redis-cluster.xxxx.eun1.cache.amazonaws.com:6379`
   - **No TLS:** `redis://...:6379`
   - **With AUTH (Redis 6):**  
     `rediss://:YOUR_AUTH_TOKEN@master.xxxx.cache.amazonaws.com:6379`

4. **Timeouts and retries**
   - Boot uses **3 attempts** by default and a longer connect timeout in production (8s). If ElastiCache is slow to respond or DNS is slow, set:
   - `REDIS_CONNECT_TIMEOUT_MS=10000` (10s)
   - `REDIS_BOOT_RETRIES=5`
   - `REDIS_BOOT_DELAY_MS=3000` (delay between retries)

5. **Logs**
   - After the next deploy, if it still fails, the process will log **lastConnectionError** (e.g. `ECONNREFUSED`, `ETIMEDOUT`) and a short hint. Search logs for `redis_required_but_unavailable` and `lastConnectionError`.

### Optional: run without Redis (not for production)

Only for temporary/dev: set `WS_REQUIRE_AUTH=false`. WebSocket auth will be disabled. Do **not** use in production.

---

## SSE assistant stream: 504 and CORS in prod

If the **EventSource** request to `/api/v1/stream/assistant/:requestId` returns **504 Gateway Timeout** or a **CORS error**:

1. **504** – Usually the load balancer (ALB) or API Gateway closed the connection because no data was received within its **idle timeout** (often 60s). The server now sends an SSE **keepalive comment** every 15s and uses a longer response timeout (2 min) for this route so the stream is not closed by the app or gateway.
2. **CORS** – If the response is a 504 from the **gateway** (not from Node), the gateway does not add CORS headers, so the browser may report "CORS error". Fixing the 504 (keepalive + timeout) usually fixes this. Ensure **FRONTEND_ORIGINS** includes the exact origin (e.g. `https://app.going2eat.food`) with no extra spaces.

**AWS:** If you use **ALB**, consider increasing the **idle timeout** (e.g. to 120s or more) for the target group or listener that serves the API. If you use **API Gateway**, note its integration timeout limit (e.g. 29s for REST APIs) and consider using HTTP API or a longer timeout if supported.
