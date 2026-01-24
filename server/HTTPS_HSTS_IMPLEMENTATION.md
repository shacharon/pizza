# HTTPS + HSTS Implementation Summary

**Date:** 2026-01-24  
**Status:** ✅ Complete

---

## Overview

Enforced HTTPS + HSTS across the application stack with:
- Infrastructure plan for ALB HTTPS listeners
- HSTS header middleware (production only)
- Cookie security guidelines for future implementation

**Constraint:** No application logic changed. Only infrastructure documentation and response headers middleware.

---

## Files Touched

### 1. **NEW:** `server/src/middleware/security-headers.middleware.ts`

**Purpose:** Production-only HSTS header middleware

**Diff:**
```typescript
+/**
+ * Security Headers Middleware
+ * 
+ * Sets production security headers:
+ * - HSTS (Strict-Transport-Security) for HTTPS enforcement
+ * 
+ * Note: This middleware assumes HTTPS termination happens at the ALB.
+ * The backend does not need to run HTTPS directly.
+ */
+
+import { Request, Response, NextFunction } from 'express';
+
+export function securityHeadersMiddleware(
+  req: Request,
+  res: Response,
+  next: NextFunction
+): void {
+  // HSTS: Force HTTPS for 1 year, include subdomains
+  // Only apply in production (ALB terminates HTTPS)
+  if (process.env.NODE_ENV === 'production') {
+    res.setHeader(
+      'Strict-Transport-Security',
+      'max-age=31536000; includeSubDomains'
+    );
+  }
+
+  /**
+   * Cookie Security Note:
+   * Currently, this application does not set cookies.
+   * 
+   * If cookies are added in the future (e.g., session cookies):
+   * - Set `Secure` flag when NODE_ENV=production
+   * - Set `HttpOnly` flag to prevent XSS
+   * - Set `SameSite=Strict` or `SameSite=Lax` as appropriate
+   * 
+   * Example:
+   *   res.cookie('sessionId', value, {
+   *     secure: process.env.NODE_ENV === 'production',
+   *     httpOnly: true,
+   *     sameSite: 'strict',
+   *   });
+   */
+
+  next();
+}
```

---

### 2. **MODIFIED:** `server/src/app.ts`

**Purpose:** Integrate security headers middleware

**Diff:**
```diff
 import { requestContextMiddleware } from './middleware/requestContext.middleware.js';
 import { httpLoggingMiddleware } from './middleware/httpLogging.middleware.js';
 import { errorMiddleware } from './middleware/error.middleware.js';
+import { securityHeadersMiddleware } from './middleware/security-headers.middleware.js';
 import { createV1Router } from './routes/v1/index.js';

 export function createApp() {
   const app = express();
   const config = getConfig();

   // Security & perf
   app.use(helmet());
+  app.use(securityHeadersMiddleware); // HSTS + security headers (production only)
   app.use(compression());
   app.use(express.json({ limit: '1mb' }));
```

**Location:** Added after `helmet()` but before `compression()` to ensure security headers are set early.

---

### 3. **NEW:** `docs/INFRASTRUCTURE_HTTPS_HSTS.md`

**Purpose:** Complete infrastructure plan for ALB HTTPS configuration

**Key Sections:**
- ✅ Architecture diagram (ALB → ECS)
- ✅ ALB listener 443 configuration (with ACM certificate)
- ✅ ALB listener 80 configuration (HTTP → HTTPS redirect)
- ✅ Backend HSTS header implementation
- ✅ Cookie security guidelines
- ✅ Security considerations (TLS policy, certificate management)
- ✅ Verification steps
- ✅ Deployment checklist
- ✅ Rollback plan

**Highlights:**
- Terraform examples for ALB listeners
- TLS policy recommendation: `ELBSecurityPolicy-TLS13-1-2-2021-06`
- HSTS parameters: `max-age=31536000; includeSubDomains`
- Cookie security template for future use

---

## Behavior

### Development (`NODE_ENV !== 'production'`)

- ❌ No HSTS header added
- ✅ Application runs on HTTP (localhost:3000)
- ✅ No breaking changes to local development

### Production (`NODE_ENV=production`)

- ✅ HSTS header added to all responses:
  ```
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  ```
- ✅ Clients will remember to use HTTPS for 1 year
- ✅ ALB terminates TLS; backend receives HTTP traffic

---

## Verification Steps

### 1. Local Development (HTTP - No HSTS)

```bash
# Start server locally
cd server
npm run dev

# Test endpoint - should NOT have HSTS header
curl -I http://localhost:3000/healthz | grep -i strict-transport

# Expected: (no output - header not present)
```

### 2. Production (HTTPS + HSTS)

```bash
# Test HTTP redirect (ALB listener 80)
curl -I http://yourdomain.com/healthz

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://yourdomain.com/healthz

# Test HTTPS with HSTS header (ALB listener 443 → backend)
curl -I https://yourdomain.com/healthz

# Expected:
# HTTP/2 200
# strict-transport-security: max-age=31536000; includeSubDomains
```

### 3. Certificate Validation

```bash
# Check TLS certificate
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com < /dev/null 2>&1 | grep -A 2 "Certificate chain"

# Should show valid certificate chain from ACM
```

### 4. Browser Test

1. Open DevTools → Network tab
2. Visit `http://yourdomain.com/healthz`
3. Verify:
   - ✅ Status: 301 Moved Permanently
   - ✅ Location: https://yourdomain.com/healthz
4. Follow redirect to `https://yourdomain.com/healthz`
5. Check Response Headers:
   - ✅ `strict-transport-security: max-age=31536000; includeSubDomains`

---

## Cookie Security (Future)

**Current Status:** Application does not set cookies.

**If cookies are added**, ensure they use the `Secure` flag in production:

```typescript
// Example: Setting a secure cookie
res.cookie('sessionId', value, {
  secure: process.env.NODE_ENV === 'production', // ✅ HTTPS only in prod
  httpOnly: true,                                 // ✅ Prevent XSS
  sameSite: 'strict',                             // ✅ CSRF protection
  maxAge: 3600000,                                // 1 hour
});
```

**Why this matters:**
- `Secure` flag prevents cookies from being sent over HTTP
- Protects session tokens from man-in-the-middle attacks
- Complements HSTS by ensuring cookies respect HTTPS-only policy

---

## ALB Configuration Checklist

Use `docs/INFRASTRUCTURE_HTTPS_HSTS.md` for detailed instructions.

**Pre-deployment:**
- [ ] Request ACM certificate for domain
- [ ] Validate ACM certificate (DNS or email)
- [ ] Certificate covers all required domains/subdomains

**ALB Configuration:**
- [ ] Create HTTPS listener (443) with ACM certificate
- [ ] Set TLS policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`
- [ ] Forward to backend target group (port 3000)
- [ ] Create HTTP listener (80) with redirect to 443 (HTTP_301)

**Backend Deployment:**
- [ ] Deploy updated code with security middleware
- [ ] Set `NODE_ENV=production` in ECS task definition
- [ ] Verify HSTS header in production response

**DNS & Security:**
- [ ] Point DNS to ALB
- [ ] Security group allows 80/443 inbound
- [ ] Backend security group allows ALB traffic

**Verification:**
- [ ] HTTP redirects to HTTPS (301)
- [ ] HTTPS returns 200 with HSTS header
- [ ] Certificate valid (check with browser/openssl)
- [ ] No mixed content warnings

---

## Security Improvements

### What Changed

1. **HTTPS Enforcement (ALB Level)**
   - All HTTP traffic (port 80) → permanent redirect to HTTPS (301)
   - Clients learn to always use HTTPS

2. **HSTS Header (Backend Level)**
   - Browsers remember to use HTTPS for 1 year
   - Protects against protocol downgrade attacks
   - Applies to all subdomains (`includeSubDomains`)

3. **Future-Proof Cookie Security**
   - Guidelines for `Secure` flag if cookies are added
   - Prevents cookies from leaking over HTTP

### What Didn't Change

- ✅ No application logic modified
- ✅ No database changes
- ✅ No API contract changes
- ✅ Local development unaffected (HTTP still works)

---

## Rollback Plan

If issues occur after deployment:

1. **Emergency: Disable HSTS**
   ```bash
   # Set NODE_ENV to development (removes HSTS header)
   # Update ECS task definition environment variable
   NODE_ENV=development
   ```

2. **Temporary: Allow HTTP**
   ```hcl
   # Change ALB listener 80 from redirect to forward
   default_action {
     type             = "forward"  # Was: "redirect"
     target_group_arn = aws_lb_target_group.backend.arn
   }
   ```

3. **Investigation**
   - Check ALB target health
   - Verify ACM certificate is valid
   - Review security group rules
   - Check backend logs for errors

---

## References

- **Infrastructure Plan:** `docs/INFRASTRUCTURE_HTTPS_HSTS.md`
- **Middleware:** `server/src/middleware/security-headers.middleware.ts`
- **Integration:** `server/src/app.ts` (line 9, 21)

**External Documentation:**
- [AWS ALB HTTPS Listeners](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html)
- [OWASP HSTS](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
- [MDN Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)

---

## Summary

✅ **Goal Achieved:** HTTPS + HSTS enforced  
✅ **Constraints Met:** No app logic changed, only infra docs + headers middleware  
✅ **Tasks Complete:**
  1. ✅ ALB HTTPS plan documented (listener 443 + 80 redirect)
  2. ✅ HSTS header added (production only)
  3. ✅ Cookie security guidelines documented

**Files Touched:** 3 (1 new middleware, 1 modified app.ts, 1 new docs)  
**Lines Changed:** ~240 lines added (middleware + docs), 2 lines modified (app.ts)  
**Breaking Changes:** None  
**Local Development Impact:** None (HSTS only in production)
