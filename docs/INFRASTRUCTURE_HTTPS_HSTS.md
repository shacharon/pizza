# HTTPS + HSTS Infrastructure Plan

**Last Updated:** 2026-01-24  
**Status:** Implementation Ready

---

## Overview

This document outlines the infrastructure plan to enforce HTTPS across the application stack using AWS Application Load Balancer (ALB) and HSTS headers in the backend.

---

## Architecture

```
┌─────────┐
│ Client  │
└────┬────┘
     │ HTTPS (443)
     ▼
┌──────────────────────────────┐
│  ALB (Application Load       │
│  Balancer)                   │
├──────────────────────────────┤
│ Listener 443 (HTTPS)         │◀── ACM Certificate
│   → Forward to Target Group  │
│                              │
│ Listener 80 (HTTP)           │
│   → Redirect to 443          │
└──────────────┬───────────────┘
               │ HTTP (ALB terminates TLS)
               ▼
┌──────────────────────────────┐
│  ECS Task (Backend)          │
│  - Express app on port 3000  │
│  - HSTS header middleware    │
└──────────────────────────────┘
```

---

## ALB Configuration Plan

### 1. HTTPS Listener (Port 443)

**Prerequisites:**
- ACM (AWS Certificate Manager) certificate for your domain
- Certificate must be in the same region as the ALB
- Certificate must include all required domains/subdomains

**Configuration:**
```yaml
Listener:
  Port: 443
  Protocol: HTTPS
  SSL Policy: ELBSecurityPolicy-TLS13-1-2-2021-06 (recommended)
  
  Certificates:
    - CertificateArn: arn:aws:acm:REGION:ACCOUNT:certificate/CERT_ID
  
  DefaultActions:
    - Type: forward
      TargetGroupArn: arn:aws:elasticloadbalancing:REGION:ACCOUNT:targetgroup/NAME/ID
```

**Terraform Example:**
```hcl
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}
```

### 2. HTTP Listener (Port 80) - Redirect to HTTPS

**Configuration:**
```yaml
Listener:
  Port: 80
  Protocol: HTTP
  
  DefaultActions:
    - Type: redirect
      RedirectConfig:
        Protocol: HTTPS
        Port: 443
        StatusCode: HTTP_301  # Permanent redirect
```

**Terraform Example:**
```hcl
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}
```

---

## Backend (Express) Configuration

### HSTS Header

The backend adds the `Strict-Transport-Security` header in **production only**.

**Implementation:** `server/src/middleware/security-headers.middleware.ts`

```typescript
if (process.env.NODE_ENV === 'production') {
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
}
```

**Why only in production?**
- In local development, apps typically run on `http://localhost`
- HSTS would break local development by forcing HTTPS
- ALB only exists in production/staging environments

**HSTS Parameters:**
- `max-age=31536000`: 1 year (31,536,000 seconds)
- `includeSubDomains`: Apply to all subdomains
- No `preload` directive (can be added later if needed for HSTS preload list)

---

## Cookie Security

**Current Status:** The application does not currently set cookies.

**Future Requirements (if cookies are added):**

When `NODE_ENV=production`:
- ✅ `Secure` flag: Cookie only sent over HTTPS
- ✅ `HttpOnly` flag: Prevent JavaScript access (XSS protection)
- ✅ `SameSite=Strict` or `Lax`: CSRF protection

**Example:**
```typescript
res.cookie('sessionId', value, {
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 3600000, // 1 hour
});
```

---

## Security Considerations

### 1. Certificate Management

- **Auto-renewal:** ACM handles automatic renewal
- **Validation:** Use DNS validation (recommended) or email validation
- **Wildcard certificates:** Consider `*.yourdomain.com` for subdomains

### 2. TLS Policy

- **Recommended:** `ELBSecurityPolicy-TLS13-1-2-2021-06`
- Supports TLS 1.2 and 1.3 only (no TLS 1.0/1.1)
- Balances security and compatibility

### 3. HSTS Considerations

- **Initial max-age:** Start with shorter duration (e.g., 1 week) for testing
- **Production max-age:** 1 year (31536000 seconds)
- **Preload list:** Optional; requires careful planning (hard to undo)

### 4. ALB Security Group

Ensure ALB security group allows:
- Inbound: `0.0.0.0/0:443` (HTTPS from internet)
- Inbound: `0.0.0.0/0:80` (HTTP for redirect)
- Outbound: ECS security group on backend port (3000)

---

## Verification Steps

### 1. HTTPS Redirect (HTTP → HTTPS)

```bash
# Should return 301 redirect to HTTPS
curl -I http://yourdomain.com/healthz

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://yourdomain.com/healthz
```

### 2. HTTPS Connection

```bash
# Should return 200 with HSTS header
curl -I https://yourdomain.com/healthz

# Expected:
# HTTP/2 200
# strict-transport-security: max-age=31536000; includeSubDomains
```

### 3. Certificate Validation

```bash
# Check certificate details
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com < /dev/null

# Should show:
# - Valid certificate chain
# - Certificate matches domain
# - TLS 1.2 or 1.3
```

### 4. HSTS Header in Production

```bash
# Production request
curl -I https://api.yourdomain.com/api/v1/healthz | grep -i strict-transport

# Expected (production):
# strict-transport-security: max-age=31536000; includeSubDomains

# Expected (development - no HSTS):
# (no strict-transport-security header)
```

---

## Deployment Checklist

- [ ] ACM certificate requested and validated
- [ ] ALB listener 443 created with ACM certificate
- [ ] ALB listener 80 configured with redirect to 443
- [ ] Backend security middleware deployed (production)
- [ ] DNS points to ALB
- [ ] Verification: HTTP redirects to HTTPS (301)
- [ ] Verification: HTTPS returns HSTS header (production)
- [ ] Verification: Certificate valid and matches domain
- [ ] Security group rules allow 80/443 inbound
- [ ] Monitor: Check ALB access logs for any HTTP traffic not redirecting

---

## Rollback Plan

If issues arise:
1. Remove HSTS header by setting `NODE_ENV=development` (emergency)
2. Revert to HTTP listener forwarding (not redirecting) temporarily
3. Check ALB target health and certificate validity
4. Review security group rules

---

## References

- [AWS ALB HTTPS Listeners](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html)
- [AWS ACM](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html)
- [OWASP HSTS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
- [MDN Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
