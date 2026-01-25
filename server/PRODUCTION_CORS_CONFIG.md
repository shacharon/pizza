# Production CORS Configuration - Complete Setup

## ✅ Configuration Complete

All CORS and auth/token access fixes are now implemented and ready for production deployment.

## 📋 What's Configured

### 1. Environment Variable Parsing (`server/src/config/env.ts`)

**Function: `parseFrontendOrigins()`** (Lines 54-59)
- ✅ Reads from `FRONTEND_ORIGINS` environment variable
- ✅ Falls back to `CORS_ALLOWED_ORIGINS` (backward compatibility)
- ✅ Supports comma-separated list: `https://www.going2eat.food,https://app.going2eat.food`
- ✅ Trims whitespace from each origin
- ✅ Filters out empty strings
- ✅ Returns `null` if no origins configured

### 2. Safe Boot Logging (`server/src/config/env.ts`)

**Lines 189-208**
```javascript
frontendOriginsSummary = "https://www.going2eat.food, https://app.going2eat.food"
```

Expected startup log:
```json
{
  "msg": "[Config] Loaded",
  "env": "production",
  "port": 3000,
  "frontendOriginsCount": 2,
  "frontendOrigins": "https://www.going2eat.food, https://app.going2eat.food"
}
```

**Safe Logging Rules:**
- Shows actual origins if ≤5 domains
- Shows count only if >5 domains (e.g., "12 origins")
- Shows "(none)" if not configured
- Shows "* (wildcard)" if wildcard is present (blocked in production)

### 3. CORS Middleware (`server/src/app.ts`)

**Lines 106-156**
- ✅ Uses `validateOrigin()` from `origin-validator.ts`
- ✅ Allows: `https://www.going2eat.food`
- ✅ Allows: `https://app.going2eat.food`
- ✅ Blocks all other origins in production
- ✅ Includes headers: `Content-Type`, `Authorization`, `X-Session-Id`
- ✅ Includes methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`
- ✅ Preflight OPTIONS handling with 204 status

### 4. Auth Endpoint (`server/src/controllers/auth/auth.controller.ts`)

**POST `/api/v1/auth/token`**
- ✅ Public endpoint (no JWT middleware)
- ✅ CORS enabled
- ✅ Returns JWT token and sessionId
- ✅ Accessible from allowed origins

## 🚀 Production Deployment

### Required ECS Environment Variable

```bash
FRONTEND_ORIGINS=https://www.going2eat.food,https://app.going2eat.food
```

### How to Add (Choose One Method)

#### AWS Console
1. ECS → Task Definitions → Your Task → Create new revision
2. Container Definitions → Click your container
3. Environment Variables section
4. Add: `FRONTEND_ORIGINS` = `https://www.going2eat.food,https://app.going2eat.food`
5. Save and deploy new revision

#### AWS CLI
```bash
# Get current task definition
aws ecs describe-task-definition \
  --task-definition your-task-family \
  --query taskDefinition > task-def.json

# Edit task-def.json to add FRONTEND_ORIGINS in environment array

# Register new task definition
aws ecs register-task-definition --cli-input-json file://task-def.json

# Update service
aws ecs update-service \
  --cluster your-cluster \
  --service your-service \
  --task-definition your-task-family:NEW_REVISION
```

#### Terraform
```hcl
environment = [
  {
    name  = "FRONTEND_ORIGINS"
    value = "https://www.going2eat.food,https://app.going2eat.food"
  }
]
```

## ✅ Verification Steps

### 1. Check Startup Logs

Look for this log entry:
```json
{
  "msg": "[Config] Loaded",
  "env": "production",
  "frontendOriginsCount": 2,
  "frontendOrigins": "https://www.going2eat.food, https://app.going2eat.food"
}
```

Also check for:
```json
{
  "msg": "CORS: Initialized",
  "env": "production",
  "originsCount": 2,
  "originsSummary": "https://www.going2eat.food, https://app.going2eat.food",
  "credentialsEnabled": true
}
```

### 2. Test from Browser Console

From **https://www.going2eat.food**:
```javascript
fetch('https://your-api-domain.com/api/v1/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
  credentials: 'include'
})
.then(r => r.json())
.then(data => console.log('✅ Success:', data))
.catch(err => console.error('❌ Error:', err));
```

Expected response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "sess_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "traceId": "..."
}
```

### 3. Verify CORS Headers

In Network tab, check response headers:
- ✅ `Access-Control-Allow-Origin: https://www.going2eat.food`
- ✅ `Access-Control-Allow-Credentials: true`
- ✅ `Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-Id`
- ✅ `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`

### 4. Test from Both Domains

Repeat tests from:
- ✅ https://www.going2eat.food
- ✅ https://app.going2eat.food

Both should return 200 OK with no CORS errors.

## 📊 Configuration Flow Diagram

```
ECS Environment Variable
    ↓
FRONTEND_ORIGINS=https://www.going2eat.food,https://app.going2eat.food
    ↓
process.env.FRONTEND_ORIGINS
    ↓
parseFrontendOrigins() in env.ts
    ↓
["https://www.going2eat.food", "https://app.going2eat.food"]
    ↓
config.frontendOrigins
    ↓
app.ts → cors() middleware → validateOrigin()
    ↓
Request from https://www.going2eat.food → ✅ ALLOWED
Request from https://app.going2eat.food → ✅ ALLOWED
Request from https://evil.com → ❌ BLOCKED
```

## 🔒 Security Features

1. **Explicit Allowlist** - Only specified domains allowed
2. **No Wildcards in Production** - Wildcard (*) throws error
3. **HTTPS Required** - HTTP origins rejected
4. **Safe Logging** - Origins logged safely (no secrets)
5. **Credentials Enabled** - Secure cookie/auth support
6. **Validation on Startup** - Fails fast if misconfigured

## 📁 Files Modified

1. `server/src/config/env.ts` - Enhanced boot logging with origins summary
2. `server/src/app.ts` - Added explicit CORS headers (already done)
3. `server/.env` - Added FRONTEND_ORIGINS for local testing (already done)

## 🎯 What This Achieves

- ✅ POST `/api/v1/auth/token` succeeds from www.going2eat.food
- ✅ POST `/api/v1/auth/token` succeeds from app.going2eat.food
- ✅ OPTIONS preflight requests handled properly
- ✅ All required headers allowed (Content-Type, Authorization, X-Session-Id)
- ✅ Safe logging of configuration on startup
- ✅ No CORS errors for authorized domains
- ✅ Security maintained (other origins blocked)

## 📝 Summary

The configuration is complete and production-ready. When you deploy with the `FRONTEND_ORIGINS` environment variable set in ECS, the server will:

1. Parse the comma-separated origins on startup
2. Log them safely in startup logs
3. Validate all incoming requests against the allowlist
4. Allow CORS requests from www.going2eat.food and app.going2eat.food
5. Block all other origins
6. Handle OPTIONS preflight properly
7. Return proper CORS headers in all responses

**No code changes are needed beyond what's already been implemented.**

**Next step:** Deploy to ECS with the FRONTEND_ORIGINS environment variable.

---

**Status:** ✅ Complete and Ready for Production
**Priority:** P1 (High - Blocks Frontend)
**Risk:** Low (backward compatible)
**Deployment Time:** ~30 minutes
