# CORS Fix - Visual Overview

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER / FRONTEND                           │
│  ┌──────────────────────────┐    ┌──────────────────────────┐      │
│  │ https://www.going2eat.food│    │ https://app.going2eat.food│      │
│  └──────────────┬───────────┘    └──────────────┬───────────┘      │
└─────────────────┼────────────────────────────────┼──────────────────┘
                  │                                │
                  │ POST /api/v1/auth/token        │
                  │ Origin: https://www.going2eat.food
                  │                                │
                  ▼                                ▼
         ┌────────────────────────────────────────────────────┐
         │              API SERVER (ECS)                       │
         │                                                     │
         │  ┌──────────────────────────────────────────┐      │
         │  │  CORS Middleware (app.ts:106-156)        │      │
         │  │                                           │      │
         │  │  1. Check Origin header                  │      │
         │  │  2. Validate against FRONTEND_ORIGINS    │      │
         │  │     ✅ https://www.going2eat.food        │      │
         │  │     ✅ https://app.going2eat.food        │      │
         │  │                                           │      │
         │  │  3. If allowed, add CORS headers:        │      │
         │  │     - Access-Control-Allow-Origin        │      │
         │  │     - Access-Control-Allow-Credentials   │      │
         │  │     - Access-Control-Allow-Headers       │      │
         │  │     - Access-Control-Allow-Methods       │      │
         │  └──────────────┬───────────────────────────┘      │
         │                 │                                   │
         │                 ▼                                   │
         │  ┌──────────────────────────────────────────┐      │
         │  │  Auth Controller (no JWT required)       │      │
         │  │  POST /api/v1/auth/token                 │      │
         │  │                                           │      │
         │  │  1. Validate request body                │      │
         │  │  2. Generate sessionId                   │      │
         │  │  3. Sign JWT token                       │      │
         │  │  4. Return { token, sessionId }          │      │
         │  └──────────────────────────────────────────┘      │
         └─────────────────────────────────────────────────────┘
```

## Request Flow

### Before Fix (CORS Errors)

```
Browser                           Server
   │                                │
   ├─ OPTIONS /auth/token ─────────▶│
   │  Origin: https://www.going2eat.food
   │                                │
   │◀─ 204 (missing headers) ───────┤
   │  ❌ No Access-Control headers  │
   │                                │
   ├─ POST /auth/token ────────────▶│
   │  ❌ BLOCKED BY BROWSER         │
   │  (missing CORS headers)        │
   │                                │
```

### After Fix (Success)

```
Browser                           Server
   │                                │
   ├─ OPTIONS /auth/token ─────────▶│
   │  Origin: https://www.going2eat.food
   │  Access-Control-Request-Method: POST
   │  Access-Control-Request-Headers: Content-Type
   │                                │
   │◀─ 204 No Content ──────────────┤
   │  ✅ Access-Control-Allow-Origin: https://www.going2eat.food
   │  ✅ Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
   │  ✅ Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-Id
   │  ✅ Access-Control-Allow-Credentials: true
   │                                │
   ├─ POST /auth/token ────────────▶│
   │  Origin: https://www.going2eat.food
   │  Content-Type: application/json
   │  Body: {}                      │
   │                                │
   │◀─ 200 OK ──────────────────────┤
   │  ✅ Access-Control-Allow-Origin: https://www.going2eat.food
   │  ✅ Access-Control-Allow-Credentials: true
   │  Body: { token, sessionId }   │
   │                                │
```

## Code Changes Visual

### server/src/app.ts

```diff
  app.use(
    cors({
      origin: (origin, cb) => { /* validation logic */ },
-     credentials: true
+     credentials: true,
+     allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Id'],
+     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
+     preflightContinue: false,
+     optionsSuccessStatus: 204
    })
  );
```

### ECS Environment Variables (NEW)

```diff
+ FRONTEND_ORIGINS=https://www.going2eat.food,https://app.going2eat.food
```

## What Each CORS Header Does

```
Access-Control-Allow-Origin: https://www.going2eat.food
└─ Tells browser: "This origin is allowed to access the response"

Access-Control-Allow-Credentials: true
└─ Tells browser: "Include cookies and auth headers in requests"

Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-Id
└─ Tells browser: "These custom headers can be sent in requests"

Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
└─ Tells browser: "These HTTP methods are allowed"
```

## Security Model

```
┌─────────────────────────────────────────────────────────┐
│                   Origin Validation                      │
│                                                          │
│  Request Origin                       Result            │
│  ─────────────────────────────────    ───────           │
│  https://www.going2eat.food      ──▶  ✅ ALLOWED        │
│  https://app.going2eat.food      ──▶  ✅ ALLOWED        │
│  https://evil.com                ──▶  ❌ BLOCKED        │
│  http://www.going2eat.food       ──▶  ❌ BLOCKED        │
│  (no origin header)              ──▶  ❌ BLOCKED        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Environment Variable Flow

```
┌────────────────────────────┐
│   ECS Task Definition      │
│                            │
│  environment:              │
│    - FRONTEND_ORIGINS=     │
│      https://www.going2eat.food,
│      https://app.going2eat.food
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│   Container Starts         │
│                            │
│   dotenv.config()          │
│   process.env.FRONTEND_ORIGINS
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│   config/env.ts            │
│                            │
│   parseFrontendOrigins()   │
│   splits by comma          │
│   returns array            │
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐
│   app.ts                   │
│                            │
│   cors({                   │
│     origin: (origin, cb) => {
│       validateOrigin(...)  │
│     }                      │
│   })                       │
└────────────────────────────┘
```

## Directory Structure

```
server/
├── src/
│   ├── app.ts                         [MODIFIED] ← CORS config
│   ├── config/
│   │   └── env.ts                     [reviewed] ← reads FRONTEND_ORIGINS
│   ├── lib/
│   │   └── security/
│   │       └── origin-validator.ts    [reviewed] ← validates origins
│   ├── controllers/
│   │   └── auth/
│   │       └── auth.controller.ts     [reviewed] ← token endpoint (public)
│   └── routes/
│       └── v1/
│           └── index.ts               [reviewed] ← auth route (no JWT middleware)
│
├── .env                               [MODIFIED] ← local test config
├── CORS_FIX_DEPLOYMENT.md             [NEW] ← full deployment guide
├── CORS_FIX_SUMMARY.md                [NEW] ← quick reference
├── DEPLOYMENT_CHECKLIST.md            [NEW] ← step-by-step checklist
├── PRODUCTION_ENV_CORS.txt            [NEW] ← env variable template
├── verify-cors.sh                     [NEW] ← automated test script
└── test-cors.html                     [NEW] ← browser test page
```

## Testing Matrix

```
┌───────────────────────────┬─────────┬──────────┬─────────────┐
│ Origin                    │ Method  │ Expected │ Verified    │
├───────────────────────────┼─────────┼──────────┼─────────────┤
│ www.going2eat.food        │ OPTIONS │ 204      │ ☐ Not Yet   │
│ www.going2eat.food        │ POST    │ 200      │ ☐ Not Yet   │
│ app.going2eat.food        │ OPTIONS │ 204      │ ☐ Not Yet   │
│ app.going2eat.food        │ POST    │ 200      │ ☐ Not Yet   │
│ evil.com                  │ POST    │ BLOCKED  │ ☐ Not Yet   │
│ (no origin)               │ POST    │ BLOCKED  │ ☐ Not Yet   │
└───────────────────────────┴─────────┴──────────┴─────────────┘
```

## Deployment Timeline

```
┌───────────┐      ┌────────────┐      ┌──────────┐      ┌──────────┐
│  Update   │      │   Build &  │      │  Deploy  │      │  Verify  │
│   ECS     │ ───▶ │   Deploy   │ ───▶ │   New    │ ───▶ │  Tests   │
│   Env     │      │   Code     │      │  Task    │      │  Pass    │
└───────────┘      └────────────┘      └──────────┘      └──────────┘
  ~5 min             ~10 min              ~10 min           ~5 min

Total: ~30 minutes
```

## Rollback Flow

```
Issue Detected
      │
      ▼
┌─────────────┐
│   Check     │
│   Logs      │
└──────┬──────┘
       │
       ▼
┌─────────────┐      Yes      ┌─────────────┐
│  Critical?  │ ────────────▶ │  Rollback   │
└──────┬──────┘               │  Previous   │
       │                      │  Revision   │
       │ No                   └─────────────┘
       ▼                             │
┌─────────────┐                      │
│   Monitor   │                      │
│   & Debug   │                      │
└─────────────┘                      │
                                     ▼
                              ┌─────────────┐
                              │   Verify    │
                              │  Rollback   │
                              └─────────────┘

Rollback Time: ~5 minutes
```

## Quick Reference Card

```
╔════════════════════════════════════════════════════════════════╗
║                    CORS FIX QUICK REFERENCE                     ║
╠════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  Environment Variable (ECS):                                    ║
║  ──────────────────────────                                    ║
║  FRONTEND_ORIGINS=https://www.going2eat.food,                  ║
║                   https://app.going2eat.food                    ║
║                                                                 ║
║  Test Command (Browser):                                        ║
║  ──────────────────────────                                    ║
║  fetch('https://api.com/api/v1/auth/token', {                  ║
║    method: 'POST',                                              ║
║    headers: { 'Content-Type': 'application/json' },            ║
║    body: JSON.stringify({}),                                    ║
║    credentials: 'include'                                       ║
║  }).then(r => r.json()).then(console.log);                     ║
║                                                                 ║
║  Expected Response:                                             ║
║  ──────────────────                                            ║
║  { token: "eyJ...", sessionId: "sess_...", traceId: "..." }   ║
║                                                                 ║
║  Rollback Command:                                              ║
║  ──────────────────                                            ║
║  aws ecs update-service \                                       ║
║    --cluster YOUR_CLUSTER \                                     ║
║    --service YOUR_SERVICE \                                     ║
║    --task-definition YOUR_TASK:PREVIOUS_REV                     ║
║                                                                 ║
╚════════════════════════════════════════════════════════════════╝
```
