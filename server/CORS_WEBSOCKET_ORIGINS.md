# CORS + WebSocket Origin Security Implementation

**Date:** 2026-01-24  
**Status:** ✅ Complete

---

## Overview

Unified origin allowlist for CORS and WebSocket with production-safe security:
- Single `FRONTEND_ORIGINS` env variable for both CORS and WebSocket
- Development: permissive (but configurable)
- Production: strict allowlist, credentials enabled, wildcard forbidden
- Comprehensive logging without leaking sensitive data

---

## Files Changed

### 1. **NEW:** `server/src/lib/security/origin-validator.ts` (135 lines)

Shared origin validation utility with logging:
- Validates origin against allowlist
- Supports exact match and wildcard subdomains (`*.example.com`)
- Logs decisions (allowed/blocked) with context
- Safe logging (truncates origins, hides full allowlist)

**Key functions:**
```typescript
validateOrigin(origin, options): OriginValidationResult
getSafeOriginSummary(origins): string
```

---

### 2. **MODIFIED:** `server/src/config/env.ts`

**Changes:**
- Renamed `parseAllowedOrigins()` → `parseFrontendOrigins()`
- Priority: `FRONTEND_ORIGINS` > `CORS_ALLOWED_ORIGINS` (backward compat)
- Security check: forbid wildcard `*` in production
- Return `frontendOrigins` instead of `corsAllowedOrigins`

**Diff:**
```diff
-function parseAllowedOrigins(): string[] | null {
-    const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
+/**
+ * Parse frontend origins from env (unified for CORS + WebSocket)
+ * Priority: FRONTEND_ORIGINS > CORS_ALLOWED_ORIGINS (backward compat)
+ */
+function parseFrontendOrigins(): string[] | null {
+    const raw = (process.env.FRONTEND_ORIGINS || process.env.CORS_ALLOWED_ORIGINS)?.trim();
     if (!raw) return null;
     const items = raw.split(',').map(s => s.trim()).filter(Boolean);
     return items.length ? items : null;
 }

+/**
+ * Security: Forbid wildcard (*) when credentials enabled
+ */
+if (isProd() && frontendOrigins?.includes('*')) {
+    throw new Error('[Config] FRONTEND_ORIGINS cannot include "*" in production (credentials enabled)');
+}

-        // CORS
-        corsAllowedOrigins,
+        // Frontend Origins (unified CORS + WebSocket)
+        frontendOrigins,
         corsAllowNoOrigin,
```

---

### 3. **MODIFIED:** `server/src/app.ts`

**Changes:**
- Import `validateOrigin` and `getSafeOriginSummary`
- Boot log with safe origin summary
- Production: strict validation using `validateOrigin()`
- Development: optional validation (permissive if no origins configured)
- Descriptive error messages for rejected origins

**Diff:**
```diff
+import { validateOrigin, getSafeOriginSummary } from './lib/security/origin-validator.js';
+import { logger } from './lib/logger/structured-logger.js';

-  // CORS (ENV-aware)
+  // CORS (ENV-aware, unified with WebSocket)
+  const isProduction = config.env === 'production';
+  
+  // Boot log: safe origin summary
+  logger.info(
+    {
+      env: config.env,
+      originsCount: config.frontendOrigins?.length ?? 0,
+      originsSummary: getSafeOriginSummary(config.frontendOrigins),
+      credentialsEnabled: isProduction
+    },
+    'CORS: Initialized'
+  );

   if (isProduction) {
-    if (!config.corsAllowedOrigins || config.corsAllowedOrigins.length === 0) {
-      throw new Error('[CORS] CORS_ALLOWED_ORIGINS is required in production');
+    if (!config.frontendOrigins || config.frontendOrigins.length === 0) {
+      throw new Error('[CORS] FRONTEND_ORIGINS is required in production');
     }

     app.use(
       cors({
         origin: (origin, cb) => {
-          if (!origin) {
-            return config.corsAllowNoOrigin
-              ? cb(null, true)
-              : cb(new Error('CORS: no origin'));
-          }
-
-          if (config.corsAllowedOrigins!.includes(origin)) {
-            return cb(null, true);
+          const result = validateOrigin(origin, {
+            allowedOrigins: config.frontendOrigins,
+            allowNoOrigin: config.corsAllowNoOrigin,
+            isProduction: true,
+            allowWildcardInDev: false,
+            context: 'cors'
+          });
+
+          if (result.allowed) {
+            return cb(null, true);
           }

-          return cb(new Error('CORS: origin not allowed'));
+          return cb(new Error(`CORS: ${result.reason || 'origin not allowed'}`));
         },
-        credentials: true,
+        credentials: true, // Secure cookies (requires specific origins, no *)
       })
     );
   } else {
-    // dev / test
-    app.use(cors());
+    // Development: permissive (but still validate if origins configured)
+    if (config.frontendOrigins && config.frontendOrigins.length > 0) {
+      app.use(
+        cors({
+          origin: (origin, cb) => {
+            const result = validateOrigin(origin, {
+              allowedOrigins: config.frontendOrigins,
+              allowNoOrigin: true,
+              isProduction: false,
+              allowWildcardInDev: true,
+              context: 'cors'
+            });
+            cb(null, result.allowed);
+          },
+          credentials: true,
+        })
+      );
+    } else {
+      // Fully permissive for local dev
+      app.use(cors());
+    }
   }
```

---

### 4. **MODIFIED:** `server/src/infra/websocket/websocket-manager.ts`

**Changes:**
- Import `validateOrigin` and `getSafeOriginSummary`
- Priority: `FRONTEND_ORIGINS` > `ALLOWED_ORIGINS` (backward compat)
- Replace manual origin validation with `validateOrigin()` utility
- Improved logging using shared utility

**Diff:**
```diff
+import { validateOrigin, getSafeOriginSummary } from '../../lib/security/origin-validator.js';

 constructor(server: HTTPServer, config?: Partial<WebSocketManagerConfig>) {
-    // 1. Resolve allowedOrigins from ENV (highest priority)
-    const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '';
+    // 1. Resolve allowedOrigins from ENV (unified with CORS)
+    // Priority: FRONTEND_ORIGINS > ALLOWED_ORIGINS (backward compat) > config
+    const frontendOriginsEnv = process.env.FRONTEND_ORIGINS || process.env.ALLOWED_ORIGINS || '';
-    const envAllowedOrigins = allowedOriginsEnv
+    const envAllowedOrigins = frontendOriginsEnv
       .split(',')
       .map(o => o.trim())
       .filter(Boolean);

-    // 6. Final authoritative boot log with clear origin list
-    const originSummary = this.config.allowedOrigins.includes('*')
-      ? 'ALL origins (*) - DEV ONLY'
-      : this.config.allowedOrigins.join(', ');
-
     logger.info(
       {
         path: this.config.path,
-        allowedOrigins: this.config.allowedOrigins,
+        originsCount: this.config.allowedOrigins.length,
+        originsSummary: getSafeOriginSummary(this.config.allowedOrigins),
         env: process.env.NODE_ENV || 'development',
         redisEnabled: !!this.redis,
         hasStateStore: !!this.requestStateStore,
       },
-      `WebSocketManager initialized | Allowed origins: ${originSummary}`
+      'WebSocketManager: Initialized'
     );

   private verifyClient(info: { origin?: string; req: any; secure?: boolean }): boolean {
     // ... (security gates)

-    const rawOrigin = (info.origin ?? info.req?.headers?.origin)?.toString();
-
-    // Origin required in prod; allow localhost missing origin only in dev
-    if (!rawOrigin || rawOrigin === 'null') {
-      const isLocal = ip === '127.0.0.1' || ip === '::1';
-      if (!isProduction && isLocal) {
-        // Allow localhost in dev without origin
-      } else {
-        logger.warn({ ip }, 'WS: Rejected - missing/invalid Origin');
-        return false;
-      }
-    } else {
-      let origin: string;
-      let hostname: string;
-
-      try {
-        const u = new URL(rawOrigin);
-        origin = u.origin;
-        hostname = u.hostname;
-      } catch {
-        logger.warn({ ip, rawOrigin }, 'WS: Rejected - invalid Origin format');
-        return false;
-      }
-
-      // Exact origin or explicit *.domain rules only (no startsWith)
-      const allowAll = !isProduction && this.config.allowedOrigins.includes('*');
-      const allowed =
-        allowAll ||
-        this.config.allowedOrigins.some((rule) => {
-          if (rule === origin) return true;
-          if (rule.startsWith('*.')) {
-            const base = rule.slice(2);
-            return hostname === base || hostname.endsWith(`.${base}`);
-          }
-          return false;
-        });
-
-      if (!allowed) {
-        logger.warn({ ip, origin, allowedOrigins: this.config.allowedOrigins }, 'WS: Rejected - origin not allowed');
-        return false;
-      }
+    // Phase 2: Origin validation using shared utility
+    const rawOrigin = (info.origin ?? info.req?.headers?.origin)?.toString();
+
+    // Special case: localhost without origin in dev
+    const isLocal = ip === '127.0.0.1' || ip === '::1';
+    const allowNoOrigin = !isProduction && isLocal;
+
+    const result = validateOrigin(rawOrigin, {
+      allowedOrigins: this.config.allowedOrigins,
+      allowNoOrigin,
+      isProduction,
+      allowWildcardInDev: true,
+      context: 'websocket'
+    });
+
+    if (!result.allowed) {
+      logger.warn(
+        { ip, origin: rawOrigin, reason: result.reason },
+        'WS: Connection rejected'
+      );
+      return false;
     }
```

---

## Configuration (.env)

### Environment Variable

**Primary:** `FRONTEND_ORIGINS` (comma-separated list)

```bash
# Development (permissive)
FRONTEND_ORIGINS=http://localhost:4200,http://127.0.0.1:4200

# Production (strict)
FRONTEND_ORIGINS=https://app.going2eat.food,https://www.going2eat.food

# Wildcard subdomain (use with caution)
FRONTEND_ORIGINS=https://*.going2eat.food

# Multiple origins (production example)
FRONTEND_ORIGINS=https://app.going2eat.food,https://admin.going2eat.food,https://mobile.going2eat.food
```

**Backward compatibility:**
- `CORS_ALLOWED_ORIGINS` (deprecated, use `FRONTEND_ORIGINS`)
- `ALLOWED_ORIGINS` (WebSocket only, deprecated)

**Additional settings:**
```bash
# Allow requests without Origin header (default: true)
CORS_ALLOW_NO_ORIGIN=true

# Node environment (affects validation strictness)
NODE_ENV=production
```

---

## Behavior

### Development (`NODE_ENV=development`)

**If `FRONTEND_ORIGINS` is set:**
- CORS validates against allowlist (but permissive)
- WebSocket validates against allowlist
- Wildcard `*` allowed
- Missing Origin header allowed for localhost

**If `FRONTEND_ORIGINS` is NOT set:**
- CORS: fully permissive (`cors()` with no restrictions)
- WebSocket: defaults to `http://localhost:4200, http://127.0.0.1:4200`

### Production (`NODE_ENV=production`)

**Requirements:**
- ✅ `FRONTEND_ORIGINS` MUST be set (throws error if missing)
- ❌ `FRONTEND_ORIGINS` CANNOT include `*` (throws error)
- ✅ CORS `credentials: true` (secure cookies)
- ✅ WebSocket requires valid JWT token

**Validation:**
- CORS: strict allowlist, rejects unknown origins
- WebSocket: strict allowlist + HTTPS enforcement (via ALB)
- All decisions logged with origin + reason

---

## Security Features

### 1. Wildcard Protection

```typescript
// Production: throws error on startup
if (isProd() && frontendOrigins?.includes('*')) {
    throw new Error('[Config] FRONTEND_ORIGINS cannot include "*" in production (credentials enabled)');
}
```

### 2. Credentials Safety

```typescript
// CORS: credentials=true requires specific origins (no *)
credentials: true, // Secure cookies (requires specific origins, no *)
```

### 3. Logging Without Data Leaks

**Safe origin summary:**
```typescript
// Instead of logging full allowlist
originsSummary: getSafeOriginSummary(config.frontendOrigins)

// Returns:
// - "(none)" if empty
// - "* (wildcard)" if wildcard
// - "5 origins" if > 5
// - "https://app.example.com, https://www.example.com" if <= 5
```

**Rejection logs:**
```json
{
  "context": "cors",
  "origin": "https://malicious.com",
  "allowlistCount": 3,
  "isProduction": true,
  "msg": "Origin validation: Rejected (not in allowlist)"
}
```

### 4. Origin Truncation

```typescript
// Prevent log injection attacks
origin: origin.substring(0, 100) // Truncate long origins
```

---

## Testing

### 1. Local Development (No FRONTEND_ORIGINS)

```bash
# Start server
cd server
npm run dev

# Test CORS (should allow any origin)
curl -I http://localhost:3000/api/v1/healthz \
  -H "Origin: http://localhost:4200"

# Expected: 200 OK, Access-Control-Allow-Origin: http://localhost:4200

# Test WebSocket (should allow localhost)
# Use a WebSocket client or browser console:
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => console.log('Connected');
```

**Expected logs:**
```
[INFO] CORS: Initialized | originsCount=0, originsSummary="(none)", credentialsEnabled=false
[INFO] WebSocketManager: Initialized | originsCount=2, originsSummary="http://localhost:4200, http://127.0.0.1:4200"
[DEBUG] Origin validation: Allowed | context="cors", origin="http://localhost:4200"
[DEBUG] Origin validation: Allowed | context="websocket", origin="http://localhost:4200"
```

---

### 2. Local Development (With FRONTEND_ORIGINS)

```bash
# .env
FRONTEND_ORIGINS=http://localhost:4200,http://localhost:8080
NODE_ENV=development

# Start server
npm run dev

# Test allowed origin
curl -I http://localhost:3000/api/v1/healthz \
  -H "Origin: http://localhost:4200"
# Expected: 200 OK

# Test blocked origin
curl -I http://localhost:3000/api/v1/healthz \
  -H "Origin: http://evil.com"
# Expected: CORS error (but still 200 in dev, just no CORS headers)
```

**Expected logs:**
```
[INFO] CORS: Initialized | originsCount=2, originsSummary="http://localhost:4200, http://localhost:8080"
[DEBUG] Origin validation: Allowed | origin="http://localhost:4200"
[WARN] Origin validation: Rejected (not in allowlist) | origin="http://evil.com", allowlistCount=2
```

---

### 3. Production (ECS)

```bash
# ECS Task Definition Environment Variables:
FRONTEND_ORIGINS=https://app.going2eat.food,https://www.going2eat.food
NODE_ENV=production
```

#### Test 1: Valid Origin (CORS)

```bash
curl -I https://api.going2eat.food/api/v1/healthz \
  -H "Origin: https://app.going2eat.food"

# Expected:
# HTTP/2 200
# access-control-allow-origin: https://app.going2eat.food
# access-control-allow-credentials: true
```

**ECS Logs (CloudWatch):**
```json
{
  "level": "info",
  "msg": "CORS: Initialized",
  "originsCount": 2,
  "originsSummary": "https://app.going2eat.food, https://www.going2eat.food",
  "credentialsEnabled": true
}
```

```json
{
  "level": "debug",
  "msg": "Origin validation: Allowed",
  "context": "cors",
  "origin": "https://app.going2eat.food"
}
```

#### Test 2: Invalid Origin (CORS)

```bash
curl -I https://api.going2eat.food/api/v1/healthz \
  -H "Origin: https://malicious.com"

# Expected:
# HTTP/2 500 (or CORS error response)
# (no CORS headers)
```

**ECS Logs:**
```json
{
  "level": "warn",
  "msg": "Origin validation: Rejected (not in allowlist)",
  "context": "cors",
  "origin": "https://malicious.com",
  "allowlistCount": 2,
  "isProduction": true
}
```

#### Test 3: Valid Origin (WebSocket)

```javascript
// Browser console (from https://app.going2eat.food)
const ws = new WebSocket('wss://api.going2eat.food/ws?token=YOUR_JWT');
ws.onopen = () => console.log('Connected');
```

**ECS Logs:**
```json
{
  "level": "info",
  "msg": "WebSocketManager: Initialized",
  "originsCount": 2,
  "originsSummary": "https://app.going2eat.food, https://www.going2eat.food"
}
```

```json
{
  "level": "debug",
  "msg": "Origin validation: Allowed",
  "context": "websocket",
  "origin": "https://app.going2eat.food"
}
```

#### Test 4: Invalid Origin (WebSocket)

```bash
# Try to connect from unauthorized origin
# (e.g., using a WebSocket client with Origin header)

# Expected: Connection rejected
```

**ECS Logs:**
```json
{
  "level": "warn",
  "msg": "WS: Connection rejected",
  "ip": "203.0.113.45",
  "origin": "https://evil.com",
  "reason": "not_in_allowlist"
}
```

---

## ECS Log Verification

### CloudWatch Logs Insights Queries

#### 1. CORS Origin Summary

```cloudwatch
fields @timestamp, msg, context, origin, isProduction
| filter msg like /Origin validation/
| filter context = "cors"
| stats count() by origin, msg
| sort count desc
```

#### 2. WebSocket Rejections

```cloudwatch
fields @timestamp, msg, origin, reason, ip
| filter msg like /WS: Connection rejected/
| sort @timestamp desc
| limit 100
```

#### 3. Blocked Origins (Security)

```cloudwatch
fields @timestamp, context, origin, reason
| filter msg like /Rejected/
| filter reason = "not_in_allowlist"
| stats count() by origin, context
| sort count desc
```

#### 4. Origin Validation Metrics

```cloudwatch
fields @timestamp, msg, context
| filter msg like /Origin validation/
| stats count() by msg, context
```

**Expected output:**
```
msg                                   | context   | count
--------------------------------------|-----------|------
Origin validation: Allowed            | cors      | 1523
Origin validation: Allowed            | websocket | 892
Origin validation: Rejected (not...)  | cors      | 3
Origin validation: Rejected (not...)  | websocket | 1
```

---

## Migration Notes

### Backward Compatibility

**Existing env variables still work:**
- `CORS_ALLOWED_ORIGINS` → automatically used if `FRONTEND_ORIGINS` not set
- `ALLOWED_ORIGINS` → automatically used if `FRONTEND_ORIGINS` not set

**Migration path:**
1. Add `FRONTEND_ORIGINS` to your `.env` or ECS task definition
2. Test in staging
3. Deploy to production
4. Remove old `CORS_ALLOWED_ORIGINS` and `ALLOWED_ORIGINS` (optional)

### Breaking Changes

**None for existing deployments:**
- If you have `CORS_ALLOWED_ORIGINS` set, it continues to work
- If you have `ALLOWED_ORIGINS` set, it continues to work

**New production requirement:**
- If starting fresh, you MUST set `FRONTEND_ORIGINS` in production

---

## Troubleshooting

### Issue: "FRONTEND_ORIGINS is required in production"

**Cause:** `NODE_ENV=production` but no origins configured

**Fix:**
```bash
# Add to .env or ECS task definition
FRONTEND_ORIGINS=https://your-app-domain.com
```

### Issue: "FRONTEND_ORIGINS cannot include '*' in production"

**Cause:** Wildcard in production with credentials enabled

**Fix:**
```bash
# Use specific origins instead
FRONTEND_ORIGINS=https://app.example.com,https://www.example.com

# OR use wildcard subdomain
FRONTEND_ORIGINS=https://*.example.com
```

### Issue: CORS working but WebSocket rejected

**Cause:** WebSocket requires JWT token in production

**Fix:**
```javascript
// Add token to WebSocket connection
const ws = new WebSocket('wss://api.example.com/ws?token=YOUR_JWT_HERE');
```

### Issue: Origin logged but connection still rejected

**Check logs for reason:**
- `missing_origin` → Client not sending Origin header
- `invalid_format` → Origin malformed (check for typos)
- `not_in_allowlist` → Origin not in `FRONTEND_ORIGINS`
- `wildcard_forbidden_in_production` → Remove `*` from allowlist

---

## Summary

✅ **Unified origin security** for CORS + WebSocket  
✅ **Single env variable** (`FRONTEND_ORIGINS`)  
✅ **Production-safe** (no wildcard, credentials enabled)  
✅ **Comprehensive logging** (decisions + reasons, no data leaks)  
✅ **Backward compatible** (old env vars still work)  
✅ **Dev-friendly** (permissive defaults)

**Files touched:** 4 (1 new utility, 3 modified)  
**Lines added:** ~240  
**Breaking changes:** None (backward compatible)
