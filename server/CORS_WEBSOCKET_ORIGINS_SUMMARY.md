# CORS + WebSocket Origin Security - Quick Reference

**Date:** 2026-01-24  
**Status:** ✅ Complete

---

## What Changed

Unified origin allowlist for CORS and WebSocket using single env variable `FRONTEND_ORIGINS`.

---

## Files Modified

| File | Lines | Description |
|------|-------|-------------|
| **NEW:** `lib/security/origin-validator.ts` | 135 | Shared origin validation with logging |
| `config/env.ts` | +15 | Parse `FRONTEND_ORIGINS`, forbid `*` in prod |
| `app.ts` | +40 | CORS using unified validator + logging |
| `infra/websocket/websocket-manager.ts` | +10/-50 | Use unified validator (simplified) |

**Total:** ~240 lines added, ~50 lines removed (net +190)

---

## Configuration

### Minimal .env Example

```bash
# Development
NODE_ENV=development
FRONTEND_ORIGINS=http://localhost:4200

# Production
NODE_ENV=production
FRONTEND_ORIGINS=https://app.going2eat.food,https://www.going2eat.food
```

### Wildcard Subdomain

```bash
# Allows app.example.com, admin.example.com, etc.
FRONTEND_ORIGINS=https://*.going2eat.food
```

### Backward Compatibility

Old env variables still work (deprecated):
```bash
CORS_ALLOWED_ORIGINS=https://app.example.com  # Still works
ALLOWED_ORIGINS=https://app.example.com       # Still works
```

---

## Testing

### Local (Dev)

```bash
# 1. Start server
npm run dev

# 2. Test CORS
curl -I http://localhost:3000/api/v1/healthz \
  -H "Origin: http://localhost:4200"

# Expected: 200 OK with CORS headers
```

### Production (ECS)

```bash
# 1. Check logs for initialization
# CloudWatch Logs → Search: "CORS: Initialized"
# Should show: originsCount=2, originsSummary="https://app.going2eat.food, ..."

# 2. Test valid origin
curl -I https://api.going2eat.food/api/v1/healthz \
  -H "Origin: https://app.going2eat.food"

# Expected: 200 OK with CORS headers

# 3. Test invalid origin (should reject)
curl -I https://api.going2eat.food/api/v1/healthz \
  -H "Origin: https://evil.com"

# Expected: CORS error
```

### ECS CloudWatch Logs Query

```cloudwatch
fields @timestamp, msg, context, origin, reason
| filter msg like /Origin validation/
| sort @timestamp desc
| limit 100
```

**Look for:**
- ✅ `Origin validation: Allowed` (legitimate traffic)
- ⚠️ `Origin validation: Rejected (not in allowlist)` (blocked attacks)

---

## Security Guarantees

### Production

✅ **Wildcard `*` forbidden** (throws error on startup)  
✅ **Credentials enabled** (secure cookies)  
✅ **Strict allowlist** (exact match or `*.domain`)  
✅ **WebSocket HTTPS enforced** (via ALB `X-Forwarded-Proto`)  
✅ **Comprehensive logging** (origin + reason, no data leaks)

### Development

✅ **Permissive by default** (if no `FRONTEND_ORIGINS` set)  
✅ **Wildcard allowed** (for local testing)  
✅ **Localhost without origin** (WebSocket-friendly)

---

## Log Examples

### Successful Connection

```json
{
  "level": "debug",
  "msg": "Origin validation: Allowed",
  "context": "cors",
  "origin": "https://app.going2eat.food"
}
```

### Blocked Connection

```json
{
  "level": "warn",
  "msg": "Origin validation: Rejected (not in allowlist)",
  "context": "websocket",
  "origin": "https://evil.com",
  "allowlistCount": 2,
  "isProduction": true
}
```

### Initialization

```json
{
  "level": "info",
  "msg": "CORS: Initialized",
  "originsCount": 2,
  "originsSummary": "https://app.going2eat.food, https://www.going2eat.food",
  "credentialsEnabled": true
}
```

---

## Migration Checklist

- [ ] Add `FRONTEND_ORIGINS` to `.env` (local)
- [ ] Add `FRONTEND_ORIGINS` to ECS task definition (production)
- [ ] Test in staging environment
- [ ] Deploy to production
- [ ] Verify logs in CloudWatch (search "Origin validation")
- [ ] Monitor for unexpected rejections
- [ ] (Optional) Remove old `CORS_ALLOWED_ORIGINS` env variable

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| "FRONTEND_ORIGINS is required in production" | Add `FRONTEND_ORIGINS=https://your-domain.com` |
| "FRONTEND_ORIGINS cannot include '*' in production" | Use specific origins or `*.domain.com` |
| CORS works, WebSocket rejected | Add JWT token: `wss://...?token=YOUR_JWT` |
| Origin logged but still rejected | Check `reason` field in logs |

---

## Full Documentation

See `CORS_WEBSOCKET_ORIGINS.md` for:
- Detailed file diffs
- Comprehensive testing guide
- ECS CloudWatch Logs queries
- Security architecture

---

## Summary

**Goal:** Production-safe CORS + WebSocket origin allowlist  
**Result:** ✅ Unified, secure, well-logged

**Key wins:**
- 🔒 Production safe (no wildcard, credentials enabled)
- 🔄 Backward compatible (old env vars work)
- 📊 Comprehensive logging (origin + decision)
- 🛠️ Dev-friendly (permissive defaults)
- 📝 Well-documented (testing + troubleshooting)
