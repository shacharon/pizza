# Production Cookie + SSE Setup Guide

## Architecture

### Development (Same Origin via Proxy) ✅
- **Frontend**: `http://localhost:4200` (Angular dev server)
- **Backend**: `http://localhost:3000` (Express)
- **Cookie Domain**: Empty (host-only, no COOKIE_DOMAIN env var needed)
- **Proxy**: Angular proxy forwards `/api` and `/ws` to backend
- **Result**: Same-origin → cookies work automatically

### Production (Two Options)

#### Option A: Same Domain (RECOMMENDED) ✅
**Setup:**
- **Frontend**: `https://app.example.com` (static hosting: Netlify/Vercel/S3+CloudFront)
- **Backend**: `https://app.example.com/api` (reverse proxy: Nginx/CloudFront)

**Configuration:**
```bash
# Backend .env (production)
COOKIE_DOMAIN=  # Empty or omit = host-only cookie
COOKIE_SAMESITE=Lax
```

**Frontend environment.production.ts:**
```typescript
export const environment = {
  production: true,
  apiUrl: '',  // Empty = same origin
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://app.example.com',
  features: { useSseAssistant: true }
};
```

**Nginx Example:**
```nginx
server {
  listen 443 ssl;
  server_name app.example.com;

  # Frontend (static files)
  location / {
    root /var/www/angular-app;
    try_files $uri $uri/ /index.html;
  }

  # Backend API
  location /api/ {
    proxy_pass http://localhost:3000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  # WebSocket
  location /ws {
    proxy_pass http://localhost:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

**Result**: Same origin → cookies work, no CORS needed

---

#### Option B: Subdomain (If Separate Deployments)

**Setup:**
- **Frontend**: `https://app.example.com`
- **Backend**: `https://api.example.com`

**Configuration:**
```bash
# Backend .env (production)
COOKIE_DOMAIN=.example.com  # Parent domain (note the leading dot)
COOKIE_SAMESITE=None  # Required for cross-site cookies
# Secure flag is REQUIRED (auto-enabled in production)
```

**Backend CORS (server/src/config/cors.ts or app.ts):**
```typescript
app.use(cors({
  origin: 'https://app.example.com',  // Specific origin (NEVER use '*' with credentials)
  credentials: true  // Allow cookies
}));
```

**Frontend environment.production.ts:**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.example.com',
  apiBasePath: '/api/v1',
  wsBaseUrl: 'wss://api.example.com',
  features: { useSseAssistant: true }
};
```

**Frontend HTTP Service (ensure credentials):**
```typescript
// All HTTP requests must include:
{ withCredentials: true }

// EventSource (SSE) must include:
new EventSource(url, { withCredentials: true })
```

**Result**: Cross-origin with shared parent domain cookie

---

## Security Checklist

### Required for Production:
- [ ] `SESSION_COOKIE_SECRET` is strong (32+ chars, crypto-random)
- [ ] `SESSION_COOKIE_SECRET` ≠ `JWT_SECRET` (different secrets)
- [ ] `Secure` flag enabled (auto in production if `NODE_ENV=production`)
- [ ] `HttpOnly` flag enabled (always on)
- [ ] HTTPS/WSS only (no HTTP/WS)
- [ ] If cross-origin: `COOKIE_SAMESITE=None` + `COOKIE_DOMAIN=.example.com`
- [ ] If same-origin: `COOKIE_SAMESITE=Lax` (default) + `COOKIE_DOMAIN=` (empty)
- [ ] CORS allows specific origin, not `*` (if using credentials)

### Never in Production:
- ❌ `COOKIE_DOMAIN=localhost`
- ❌ `COOKIE_SAMESITE=Lax` with cross-origin setup
- ❌ CORS `origin: '*'` with `credentials: true`
- ❌ Missing `Secure` flag on HTTPS

---

## Testing

### Development (After Changes):
```bash
# Backend (server will auto-reload)
cd server
npm run dev

# Frontend (MUST restart to load proxy config)
cd llm-angular
ng serve  # Proxy now active!
```

**Verify Cookie:**
1. Open DevTools (F12) → Application → Cookies → `http://localhost:4200`
2. After calling `/api/v1/auth/session`, you should see:
   - Name: `session`
   - Domain: `localhost:4200` (or just `localhost`)
   - HttpOnly: ✓
   - Secure: (empty in dev)
   - SameSite: Lax

**Verify SSE:**
1. Run a search
2. Check browser Network tab → `assistant/req-xxx` → 200 OK (not 401)
3. Check server logs: `hasCookieHeader: true`, `sessionCookieVerifyOk: true`

### Production (Pre-Deploy Checklist):
1. Set `COOKIE_DOMAIN` correctly (or leave empty if same-origin)
2. Verify `environment.production.ts` has correct `apiUrl`
3. Build: `ng build --configuration=production`
4. Test cookie on staging first
5. Monitor logs for `auth_failed_no_credentials` errors

---

## Troubleshooting

### Issue: 401 on SSE in Production
**Causes:**
- Cookie domain mismatch (`COOKIE_DOMAIN` incorrect)
- CORS not allowing credentials
- Frontend not sending `withCredentials: true`
- Cookie expired or signature invalid

**Debug:**
```bash
# Backend logs (look for):
sse_auth_debug { hasCookieHeader, hasSessionCookie, sessionCookieVerifyOk }

# Browser DevTools → Application → Cookies
# Verify cookie exists and Domain matches request URL
```

### Issue: Cookie not being set
**Causes:**
- `COOKIE_SAMESITE=Lax` with cross-origin requests (must be `None`)
- Missing `Secure` flag on HTTPS cross-origin
- CORS not allowing credentials

---

## Migration Path (Existing Deployments)

1. **Update Backend .env:**
   ```bash
   # If same-origin deployment:
   COOKIE_DOMAIN=  # Empty or remove line
   COOKIE_SAMESITE=Lax
   
   # If cross-origin deployment:
   COOKIE_DOMAIN=.example.com
   COOKIE_SAMESITE=None
   ```

2. **Update Frontend environment:**
   - Same-origin: Set `apiUrl: ''`
   - Cross-origin: Keep full URL

3. **Deploy backend first** (backward compatible)
4. **Deploy frontend** (new SSE code active)
5. **Monitor** for 401 errors on SSE endpoint
