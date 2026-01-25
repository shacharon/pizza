# Complete Authentication System Documentation

## Overview

This document describes the end-to-end JWT-based authentication system for the Going2Eat application, covering both Angular frontend and Node.js backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Angular 19)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────┐             │
│  │  AuthService     │────────▶│  localStorage   │             │
│  │  - getToken()    │         │  g2e_jwt: JWT   │             │
│  │  - refreshToken()│         │  api-session-id │             │
│  │  - clearToken()  │         └─────────────────┘             │
│  └────────┬─────────┘                                          │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────┐         ┌─────────────────┐             │
│  │ Auth Interceptor │────────▶│  HTTP Requests  │             │
│  │ (Functional)     │         │  + Bearer Token │             │
│  └──────────────────┘         └────────┬────────┘             │
│                                         │                       │
│  ┌──────────────────┐                  │                       │
│  │ WS Client Service│──────────────────┘                       │
│  │ - Uses same JWT  │  (via AuthService)                       │
│  └──────────────────┘                                          │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTP/WS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js/Express)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Route Protection                      │  │
│  │  /api/v1/auth/token        → PUBLIC (generates JWT)     │  │
│  │  /api/v1/search           → PROTECTED (requires JWT)    │  │
│  │  /api/v1/analytics        → PROTECTED (requires JWT)    │  │
│  │  /api/v1/ws-ticket        → PROTECTED (requires JWT)    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────┐             │
│  │ Auth Middleware  │────────▶│  JWT Verifier   │             │
│  │ authenticateJWT()│         │  (jsonwebtoken) │             │
│  └──────────────────┘         └─────────────────┘             │
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────┐             │
│  │ Auth Controller  │────────▶│  JWT Signer     │             │
│  │ POST /token      │         │  (HS256)        │             │
│  └──────────────────┘         └─────────────────┘             │
│                                                                 │
│  ┌──────────────────┐         ┌─────────────────┐             │
│  │ WS Manager       │────────▶│  Redis Tickets  │             │
│  │ Ticket Auth      │         │  (one-time use) │             │
│  └──────────────────┘         └─────────────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Authentication (Angular)

### 1. AuthService (`llm-angular/src/app/core/auth/auth.service.ts`)

**Purpose:** Centralized JWT token management

**Key Features:**
- Fetches JWT from backend on first request
- Caches token in memory (signal)
- Persists token in localStorage (`g2e_jwt`)
- Handles automatic token refresh on 401 errors
- Prevents duplicate token fetch requests (promise caching)

**Public API:**
```typescript
class AuthService {
  // Get token (cached or fetch from backend)
  async getToken(): Promise<string>
  
  // Force refresh token (clear cache and refetch)
  async refreshToken(): Promise<string>
  
  // Clear token from memory and storage
  clearToken(): void
}
```

**Token Storage:**
- **Key:** `g2e_jwt` (localStorage)
- **Format:** JWT string (e.g., `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
- **Lifecycle:** Loaded on service init, persisted on fetch/refresh, cleared on logout

**Token Fetch Flow:**
```typescript
1. Check cache (signal) → return if available
2. Check if already fetching → reuse promise
3. Send POST /api/v1/auth/token with { sessionId? }
4. Save token to cache + localStorage
5. Update sessionId if backend provides new one
6. Return token
```

**Error Handling:**
- Network errors → thrown as `Error`
- HTTP errors → wrapped with status and statusText
- Storage errors → logged as warnings (non-blocking)

---

### 2. Auth Interceptor (`llm-angular/src/app/core/interceptors/auth.interceptor.ts`)

**Purpose:** Functional HTTP interceptor that attaches JWT to all API requests

**Type:** Angular 19 functional interceptor (not class-based)

**Behavior:**
```typescript
1. Check if API request (isApiRequest(url))
   → Skip non-API requests (e.g., assets, external URLs)

2. Check if /auth/token endpoint
   → Skip to prevent circular dependency

3. Check if Authorization header already present
   → Skip if manually provided

4. Get token from AuthService
   → await authService.getToken()

5. Clone request with Authorization header
   → Authorization: Bearer <token>

6. Send request

7. On 401 INVALID_TOKEN error:
   → Call authService.refreshToken()
   → Retry request once with new token
   → If retry fails, throw error
```

**Interceptor Chain Order (app.config.ts):**
```typescript
provideHttpClient(withInterceptors([
  authInterceptor,                 // 1st: JWT Bearer token
  apiSessionInterceptor,           // 2nd: x-session-id header
  httpTimeoutRetryInterceptor,     // 3rd: Timeout + retry
  httpErrorInterceptor             // 4th: Error normalization
]))
```

**Error Recovery:**
- 401 INVALID_TOKEN → Auto-refresh once and retry
- Other 401 errors → Propagate error
- Non-401 errors → Propagate error

---

### 3. WebSocket Client (`llm-angular/src/app/core/services/ws-client.service.ts`)

**Purpose:** WebSocket connection with ticket-based authentication

**Authentication Flow:**
```typescript
1. Get JWT from AuthService
   → await authService.getToken()

2. Request one-time ticket
   → POST /api/v1/ws-ticket with Bearer token

3. Connect to WebSocket
   → ws://localhost:3000/ws?ticket=<one-time-ticket>

4. Server verifies ticket (Redis)
   → One-time use, auto-deleted after verification
```

**Security:**
- JWT never exposed in WebSocket URL
- Tickets are one-time use only
- Tickets stored in Redis with TTL
- Uses same AuthService as HTTP (single source of truth)

**Reconnection Logic:**
- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
- Auto-resubscribe to last requestId on reconnect
- Connection status exposed via signal

---

### 4. API Configuration (`llm-angular/src/app/shared/api/api.config.ts`)

**Endpoints:**
```typescript
export const ENDPOINTS = {
  AUTH_TOKEN: `${API_BASE}/auth/token`,     // JWT generation
  SEARCH: `${API_BASE}/search`,             // Protected
  ANALYTICS_EVENTS: `${API_BASE}/analytics/events`, // Protected
  WS_TICKET: `${API_BASE}/ws-ticket`,       // Protected (for WS)
  // ... more endpoints
}
```

**Helper Functions:**
```typescript
// Check if URL is an API request
isApiRequest(url: string): boolean

// Build absolute API URL
buildApiUrl(path: string): string
```

**Environment Configuration:**
```typescript
// environment.ts (DEV)
{
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'ws://localhost:3000'
}

// environment.production.ts (PROD)
{
  production: true,
  apiUrl: 'https://api.going2eat.food',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://api.going2eat.food'
}
```

---

## Backend Authentication (Node.js)

### 1. Environment Configuration (`server/src/config/env.ts`)

**JWT Secret Validation:**
```typescript
function validateJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;
  
  // ALWAYS require >= 32 chars
  if (!jwtSecret || jwtSecret.trim() === '' || jwtSecret.length < 32) {
    throw new Error('[P0 Security] JWT_SECRET must be >= 32 characters');
  }
  
  // Production: disallow legacy dev default
  if (isProd() && jwtSecret === 'dev-secret-change-in-production') {
    throw new Error('[P0 Security] Cannot use dev default in production');
  }
  
  return jwtSecret;
}
```

**Configuration Object:**
```typescript
{
  jwtSecret: string,              // Validated JWT secret
  env: 'development' | 'production' | 'test',
  port: number,                   // Default: 3000
  enableRedisJobStore: boolean,   // For job tracking
  redisUrl: string,               // Redis connection
  frontendOrigins: string[],      // CORS origins
  corsAllowNoOrigin: boolean      // Dev mode flag
}
```

**.env File:**
```bash
# JWT Secret (>= 32 chars)
JWT_SECRET=dev_local_super_secret_change_me_32_chars_min!!

# Redis (required for WebSocket tickets)
REDIS_URL=redis://localhost:6379

# API Keys
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Node Environment
NODE_ENV=development
PORT=3000
```

---

### 2. Auth Controller (`server/src/controllers/auth/auth.controller.ts`)

**Endpoint:** `POST /api/v1/auth/token`

**Purpose:** Generate JWT tokens for client authentication

**Request:**
```typescript
// Optional: include existing sessionId for continuity
{
  sessionId?: string  // e.g., "sess_d0e91179-3ba2-447c-b80c-13ab4e66ecda"
}
```

**Response:**
```typescript
{
  token: string,      // JWT token (HS256, 30 days)
  sessionId: string,  // Session ID (generated or provided)
  traceId: string     // Request trace ID
}

// Example:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzZXNzX2QwZTkxMTc5LTNiYTItNDQ3Yy1iODBjLTEzYWI0ZTY2ZWNkYSIsImlhdCI6MTc2OTM2MzQ1NiwiZXhwIjoxNzcxOTU1NDU2fQ.abc123...",
  "sessionId": "sess_d0e91179-3ba2-447c-b80c-13ab4e66ecda",
  "traceId": "e835d808-ea2d-4ac5-95e8-8999fe76c1ca"
}
```

**JWT Payload:**
```typescript
{
  sessionId: string,  // Session identifier
  iat: number,        // Issued at (Unix timestamp)
  exp: number         // Expiration (Unix timestamp, +30 days)
}
```

**Security:**
- Public endpoint (no auth required)
- Rate limited by global middleware
- JWT signed with HS256 algorithm
- 30-day expiration
- Session ID format: `sess_<uuid>`

**Implementation:**
```typescript
router.post('/token', async (req: Request, res: Response) => {
  // 1. Validate request body (optional sessionId)
  const parseResult = TokenRequestSchema.safeParse(req.body);
  
  // 2. Generate or reuse sessionId
  const sessionId = parseResult.data.sessionId || generateSessionId();
  
  // 3. Sign JWT with HS256
  const token = jwt.sign(
    { sessionId },
    config.jwtSecret,
    { algorithm: 'HS256', expiresIn: '30d' }
  );
  
  // 4. Return token + sessionId
  return res.status(200).json({ token, sessionId, traceId });
});
```

---

### 3. Auth Middleware (`server/src/middleware/auth.middleware.ts`)

**Purpose:** Protect HTTP API endpoints with JWT verification

**Middleware:** `authenticateJWT(req, res, next)`

**Behavior:**
```typescript
1. Extract Authorization header
   → Must be "Bearer <token>"

2. Verify JWT signature
   → jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })

3. Validate claims
   → sessionId (required)
   → exp (required, checked by jwt.verify)

4. Attach to request
   → req.sessionId = decoded.sessionId
   → req.userId = decoded.userId (if present)
   → req.ctx.sessionId = decoded.sessionId

5. Call next() to continue request
```

**Error Responses:**
```typescript
// Missing Authorization header
401 {
  error: 'Unauthorized',
  code: 'MISSING_AUTH',
  traceId: string
}

// Invalid token (expired, malformed, wrong signature)
401 {
  error: 'Unauthorized',
  code: 'INVALID_TOKEN',
  traceId: string
}
```

**Request Augmentation:**
```typescript
interface AuthenticatedRequest extends Request {
  userId?: string;      // Optional user ID
  sessionId: string;    // Required session ID
  ctx: {
    sessionId: string;  // Backward compatibility
  };
}
```

**JWT Secret Validation (Startup):**
```typescript
function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Always require >= 32 chars
  if (!secret || secret.length < 32) {
    throw new Error('[P0 Security] JWT_SECRET must be >= 32 chars');
  }
  
  // Production: disallow legacy dev default
  if (isProduction && secret === 'dev-secret-change-in-production') {
    throw new Error('[P0 Security] Cannot use dev default in production');
  }
  
  return secret;
}

// Fail-fast on startup
const JWT_SECRET = requireJwtSecret();
```

---

### 4. Route Protection (`server/src/routes/v1/index.ts`)

**Protected Routes:**
```typescript
export function createV1Router(): Router {
  const router = Router();
  
  // PUBLIC: Generate JWT token
  router.use('/auth', authRouter);
  
  // PROTECTED: Require JWT authentication
  router.use('/ws-ticket', authenticateJWT, wsTicketRouter);
  router.use('/search', authenticateJWT, searchRateLimiter, searchRouter);
  router.use('/analytics', authenticateJWT, analyticsRouter);
  
  // PUBLIC: Photos proxy (no auth)
  router.use('/photos', photosRouter);
  
  return router;
}
```

**Middleware Order:**
```
Request → authenticateJWT → rateLimiter → controller
```

**Rate Limiting:**
- Search: 100 req/min per IP+session
- Global: Applied to all routes via main middleware

---

### 5. WebSocket Authentication (`server/src/infra/websocket/websocket-manager.ts`)

**Authentication Method:** Ticket-based (NOT JWT in URL)

**Why Tickets?**
- JWT tokens are sensitive and should not be in URLs
- URLs can be logged by proxies, load balancers, etc.
- Tickets are one-time use and stored in Redis
- More secure than exposing JWT in WebSocket URL

**Flow:**
```typescript
1. Client requests ticket
   → POST /api/v1/ws-ticket with Bearer JWT
   → Returns { ticket: string, expiresAt: number }

2. Client connects to WebSocket
   → ws://localhost:3000/ws?ticket=<one-time-ticket>

3. Server validates ticket
   → Redis GET ws_ticket:<ticket>
   → Parse ticket data (userId, sessionId, createdAt)
   → DELETE ticket immediately (one-time use)

4. Server attaches identity to WebSocket
   → ws.userId = ticketPayload.userId
   → ws.sessionId = ticketPayload.sessionId

5. Subsequent messages use ws.userId/sessionId
```

**Ticket Structure (Redis):**
```typescript
// Key: ws_ticket:<uuid>
// TTL: 30 seconds
// Value (JSON):
{
  userId?: string | null,
  sessionId: string,
  createdAt: number  // Unix timestamp
}
```

**Security Features:**
- Tickets expire after 30 seconds
- One-time use only (deleted after verification)
- Requires Redis for production
- Can be disabled for local dev: `WS_REQUIRE_AUTH=false`

**Origin Validation:**
```typescript
// Production: strict origin checking
const allowedOrigins = process.env.FRONTEND_ORIGINS?.split(',') || [];

// Development: allow localhost
const devDefaults = ['http://localhost:4200', 'http://127.0.0.1:4200'];

// Never allow wildcard (*) in production
if (isProduction && allowedOrigins.includes('*')) {
  throw new Error('Wildcard origins forbidden in production');
}
```

---

## Security Features

### Frontend

1. **Token Storage:**
   - localStorage key: `g2e_jwt` (not exposed)
   - Cleared on logout or auth errors
   - Not sent in URLs or query params

2. **Automatic Refresh:**
   - On 401 INVALID_TOKEN: auto-refresh once
   - Prevents token expiration issues
   - Transparent to application code

3. **WebSocket Security:**
   - Uses one-time tickets (not JWT)
   - Tickets requested via secure HTTPS
   - JWT never exposed in WebSocket URL

4. **CORS Protection:**
   - Credentials enabled for all API requests
   - Only configured origins allowed

### Backend

1. **JWT Secret Validation:**
   - Fail-fast on startup if misconfigured
   - Minimum 32 characters required
   - Production rejects dev defaults

2. **Token Verification:**
   - HS256 algorithm only (no RS256, etc.)
   - 30-day expiration enforced
   - Signature verification on every request

3. **WebSocket Tickets:**
   - One-time use only (auto-deleted)
   - 30-second TTL
   - Redis-backed for security

4. **Rate Limiting:**
   - Search: 100 req/min per IP+session
   - Global rate limiting on all routes
   - Prevents brute-force attacks

5. **Environment-Aware:**
   - Dev mode: more permissive (localhost, logging)
   - Production: strict validation, no wildcards

---

## Complete Request Flow

### HTTP API Request

```
1. Angular Component
   └─> HTTP call (e.g., searchService.search())
       └─> Auth Interceptor
           ├─> Check if API request (isApiRequest)
           ├─> Get JWT from AuthService
           │   ├─> Check cache (signal)
           │   └─> If missing: POST /api/v1/auth/token
           │       └─> Backend generates JWT (HS256, 30d)
           │           └─> Store in localStorage (g2e_jwt)
           ├─> Clone request with Authorization: Bearer <JWT>
           └─> Send to backend
               └─> Auth Middleware (authenticateJWT)
                   ├─> Extract Bearer token
                   ├─> Verify JWT signature + expiration
                   ├─> Attach sessionId to req
                   └─> Call next() → Controller
                       └─> Process request
                           └─> Return response

2. On 401 INVALID_TOKEN:
   └─> Auth Interceptor catches error
       └─> Call authService.refreshToken()
           ├─> Clear cache
           ├─> POST /api/v1/auth/token (new token)
           └─> Retry original request with new token
```

### WebSocket Connection

```
1. Angular WS Client
   └─> connect()
       ├─> Get JWT from AuthService
       │   └─> (same flow as HTTP)
       ├─> POST /api/v1/ws-ticket with Bearer JWT
       │   └─> Backend Auth Middleware verifies JWT
       │       └─> WS Ticket Controller generates ticket
       │           ├─> Store in Redis (TTL 30s)
       │           └─> Return { ticket, expiresAt }
       ├─> Connect to ws://localhost:3000/ws?ticket=<ticket>
       │   └─> Backend WebSocket Manager
       │       ├─> Validate origin
       │       ├─> Get ticket from Redis
       │       ├─> Verify ticket data
       │       ├─> DELETE ticket (one-time use)
       │       ├─> Attach userId/sessionId to WebSocket
       │       └─> Fire onopen event
       └─> Subscribe to channels (search, assistant)
           └─> Backend verifies ownership via sessionId
```

---

## Configuration Reference

### Frontend (.env or environment.ts)

```typescript
// environment.ts (Development)
{
  production: false,
  apiUrl: 'http://localhost:3000',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'ws://localhost:3000',
  environmentName: 'local'
}

// environment.production.ts (Production)
{
  production: true,
  apiUrl: 'https://api.going2eat.food',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://api.going2eat.food',
  environmentName: 'prod'
}
```

### Backend (.env)

```bash
# Required
JWT_SECRET=dev_local_super_secret_change_me_32_chars_min!!
REDIS_URL=redis://localhost:6379

# Optional
NODE_ENV=development
PORT=3000
WS_REQUIRE_AUTH=true

# CORS Origins (production)
FRONTEND_ORIGINS=https://app.going2eat.food,https://www.going2eat.food

# Development (optional, defaults to localhost)
# FRONTEND_ORIGINS=http://localhost:4200
```

---

## Testing

### Manual Testing

**1. Get JWT Token:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d "{}"

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "sessionId": "sess_d0e91179-3ba2-447c-b80c-13ab4e66ecda",
#   "traceId": "e835d808-ea2d-4ac5-95e8-8999fe76c1ca"
# }
```

**2. Use JWT for Protected Endpoint:**
```bash
curl -X POST http://localhost:3000/api/v1/search?mode=unified \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"query":"pizza near me"}'

# Response:
# {
#   "requestId": "req_abc123",
#   "traceId": "xyz789"
# }
```

**3. Verify JWT in Browser:**
```javascript
// In browser console
localStorage.getItem('g2e_jwt')
// Should return JWT token

// Make API call
fetch('http://localhost:3000/api/v1/search?mode=unified', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('g2e_jwt')}`
  },
  body: JSON.stringify({ query: 'pizza' })
})
```

### Automated Testing

**Unit Test (Backend):**
```typescript
describe('Auth Middleware', () => {
  it('should accept valid JWT', async () => {
    const token = jwt.sign(
      { sessionId: 'test-session' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '30d' }
    );
    
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockResponse();
    const next = jest.fn();
    
    authenticateJWT(req, res, next);
    
    expect(next).toHaveBeenCalled();
    expect(req.sessionId).toBe('test-session');
  });
  
  it('should reject expired JWT', async () => {
    const token = jwt.sign(
      { sessionId: 'test-session' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '-1s' }  // Already expired
    );
    
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockResponse();
    const next = jest.fn();
    
    authenticateJWT(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
```

**Integration Test (Frontend):**
```typescript
describe('AuthService', () => {
  it('should fetch token from backend', async () => {
    const authService = TestBed.inject(AuthService);
    const httpMock = TestBed.inject(HttpTestingController);
    
    const tokenPromise = authService.getToken();
    
    const req = httpMock.expectOne('/api/v1/auth/token');
    req.flush({
      token: 'test-jwt-token',
      sessionId: 'test-session',
      traceId: 'test-trace'
    });
    
    const token = await tokenPromise;
    
    expect(token).toBe('test-jwt-token');
    expect(localStorage.getItem('g2e_jwt')).toBe('test-jwt-token');
  });
});
```

---

## Troubleshooting

### Frontend Issues

**Issue: "No auth token available"**
- **Cause:** AuthService failed to fetch token from backend
- **Solution:** Check network tab for 401/500 errors on `/api/v1/auth/token`
- **Check:** Backend server running? CORS configured?

**Issue: JWT not attached to requests**
- **Cause:** Interceptor not registered or URL not recognized as API
- **Solution:** Verify `app.config.ts` has `authInterceptor` first in chain
- **Check:** URL contains `/api/` and passes `isApiRequest()` check

**Issue: WebSocket "ticket invalid or expired"**
- **Cause:** Ticket expired before connection (>30s delay)
- **Solution:** Reduce delay between ticket request and WS connect
- **Check:** Network conditions, backend Redis working

### Backend Issues

**Issue: "JWT_SECRET must be >= 32 characters"**
- **Cause:** `.env` file missing or JWT_SECRET too short
- **Solution:** Set `JWT_SECRET=<32+ character string>` in `.env`
- **Check:** `dotenv` loaded before config module

**Issue: "invalid signature"**
- **Cause:** JWT_SECRET mismatch between token generation and verification
- **Solution:** Ensure same `.env` file used, restart server after changes
- **Check:** `process.env.JWT_SECRET` in both auth controller and middleware

**Issue: "Redis connection required for WebSocket"**
- **Cause:** `WS_REQUIRE_AUTH=true` but no Redis connection
- **Solution:** Install Redis or set `WS_REQUIRE_AUTH=false` for local dev
- **Check:** `REDIS_URL=redis://localhost:6379` in `.env`

**Issue: CORS errors on /auth/token**
- **Cause:** Frontend origin not in `FRONTEND_ORIGINS`
- **Solution:** Add origin to `.env`: `FRONTEND_ORIGINS=http://localhost:4200`
- **Check:** Backend logs show origin validation

---

## Production Checklist

### Frontend

- [ ] `environment.production.ts` uses HTTPS/WSS
- [ ] No hardcoded localhost URLs
- [ ] Build with `--configuration=production`
- [ ] Source maps disabled in production build

### Backend

- [ ] `JWT_SECRET` is 32+ random characters
- [ ] `JWT_SECRET` != dev default
- [ ] `NODE_ENV=production`
- [ ] `FRONTEND_ORIGINS` set to production domains
- [ ] No wildcard (*) in `FRONTEND_ORIGINS`
- [ ] Redis URL points to production Redis
- [ ] HTTPS enabled (via ALB or reverse proxy)
- [ ] Rate limiting enabled
- [ ] Structured logging configured

### Security

- [ ] JWT expires after 30 days (configured)
- [ ] WebSocket tickets expire after 30s
- [ ] CORS credentials enabled
- [ ] Origin validation enabled
- [ ] Redis AUTH enabled (if applicable)
- [ ] TLS/SSL certificates valid
- [ ] No secrets in Git history
- [ ] Environment variables injected securely

---

## Monitoring

### Metrics to Track

**Frontend:**
- Token fetch success rate
- Token refresh rate
- 401 error rate
- WebSocket connection success rate

**Backend:**
- `/auth/token` response time
- JWT verification success rate
- WebSocket ticket generation rate
- 401 error rate per endpoint

### Logs to Monitor

**Frontend (Console):**
```
[Auth] Fetching JWT token from backend...
[Auth] ✅ JWT token acquired
[WS] Getting JWT token...
[WS] Requesting ticket...
[WS] Connected successfully
```

**Backend (Structured):**
```json
{"level":"info","msg":"[Auth] JWT token generated","sessionId":"sess_..."}
{"level":"info","msg":"[Auth] JWT verified","sessionId":"sess_...","userId":"user_..."}
{"level":"warn","msg":"[Auth] JWT verification failed","error":"invalid signature"}
{"level":"info","msg":"WS: Authenticated via ticket","sessionId":"sess_..."}
```

---

## References

### Technologies Used

- **Frontend:** Angular 19, TypeScript, RxJS
- **Backend:** Node.js, Express, TypeScript
- **Auth:** jsonwebtoken (HS256)
- **Storage:** localStorage (frontend), Redis (backend)
- **WebSocket:** ws library

### Related Documentation

- [JWT.io](https://jwt.io/) - JWT standard
- [Angular HTTP Interceptors](https://angular.io/guide/http-interceptor-use-cases)
- [Express Middleware](https://expressjs.com/en/guide/using-middleware.html)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Files Reference

**Frontend:**
- `llm-angular/src/app/core/auth/auth.service.ts`
- `llm-angular/src/app/core/interceptors/auth.interceptor.ts`
- `llm-angular/src/app/core/services/ws-client.service.ts`
- `llm-angular/src/app/shared/api/api.config.ts`
- `llm-angular/src/app/app.config.ts`

**Backend:**
- `server/src/controllers/auth/auth.controller.ts`
- `server/src/middleware/auth.middleware.ts`
- `server/src/routes/v1/index.ts`
- `server/src/config/env.ts`
- `server/src/infra/websocket/websocket-manager.ts`
- `server/.env`

---

## Status

✅ **Complete Authentication System**
- Frontend: JWT auto-fetch, auto-refresh, secure storage
- Backend: JWT generation, verification, route protection
- WebSocket: Ticket-based auth, Redis-backed
- Security: Environment-aware, production-ready
- Testing: Manual + automated test coverage
- Documentation: Complete end-to-end guide

**Last Updated:** 2026-01-25
