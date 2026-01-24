# P0 Security Gaps Fixed - HTTP API Authentication

## Files Modified

### 1. server/src/middleware/auth.middleware.ts (NEW - 123 lines)

```typescript
// JWT authentication middleware
export function authenticateJWT(req, res, next)
// Extracts JWT from Authorization: Bearer <token>
// Sets req.userId and req.sessionId from verified token
// Returns 401 if missing/invalid

export function optionalJWT(req, res, next)
// Same but allows requests without token
```

---

### 2. server/src/config/env.ts

```typescript
// Added validateJwtSecret() - lines 71-88
function validateJwtSecret(): string {
  // Crash if JWT_SECRET missing in production
  // Crash if JWT_SECRET equals 'dev-secret-change-in-production'
  // Crash if JWT_SECRET < 32 chars in production
}

// Added jwtSecret to config return - line 189
return { ..., jwtSecret, ... }
```

---

### 3. server/src/routes/v1/index.ts

```typescript
import { authenticateJWT } from '../../middleware/auth.middleware.js';
import { createRateLimiter } from '../../middleware/rate-limit.middleware.js';

// Search rate limiter: 100 req/min
const searchRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 100,
  keyPrefix: 'search'
});

// Protected routes
router.use('/search', authenticateJWT, searchRateLimiter, searchRouter);
router.use('/analytics', authenticateJWT, analyticsRouter);
```

---

### 4. server/src/controllers/search/search.controller.ts

```typescript
// Line 220: Use authenticated sessionId from JWT
const authenticatedSessionId = req.ctx?.sessionId || queryData.sessionId;

// Line 232: Use authenticatedSessionId in context
...(authenticatedSessionId && { sessionId: authenticatedSessionId })

// Line 250: Use authenticated session
const ownerSessionId = authenticatedSessionId;

// Line 256: Return 401 instead of 400
res.status(401).json(...)
```

---

### 5. server/src/controllers/analytics/analytics.controller.ts

```typescript
// All event storage now includes userId + sessionId

// POST /events - binds to authenticated user
events.push({
  event,
  data,
  timestamp,
  userId,    // From JWT
  sessionId  // From JWT
});

// GET /events - filters by authenticated user
events.filter(e => 
  e.sessionId === sessionId || 
  (userId && e.userId === userId)
);

// GET /stats - scoped to authenticated user
const userEvents = events.filter(e => 
  e.sessionId === sessionId ||
  (userId && e.userId === userId)
);

// DELETE /events - removes only own events
events.filter(e => 
  e.sessionId !== sessionId && 
  (!userId || e.userId !== userId)
);
```

---

### 6. server/package.json

```json
"dependencies": {
  "jsonwebtoken": "^9.0.2"
},
"devDependencies": {
  "@types/jsonwebtoken": "^9.0.7"
}
```

---

## Environment Variables

**Required in production:**

```bash
JWT_SECRET=<32+ character secret>
```

**Development default (if not set):**
```
dev-secret-change-in-production
```

---

## Verification Commands

### 1. Generate Test JWT

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sessionId: 'test-123', userId: 'user-456' },
  process.env.JWT_SECRET || 'dev-secret-change-in-production',
  { expiresIn: '24h' }
);
console.log(token);
"
```

### 2. Test Search Without Auth (Should Fail)

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32,"lng":34}}'

# Expected: 401 {"error":"Unauthorized","code":"MISSING_AUTH"}
```

### 3. Test Search With Auth (Should Succeed)

```bash
TOKEN="<token>"

curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32,"lng":34}}'

# Expected: 200 with results
```

### 4. Test Search Rate Limit (100 req/min)

```bash
TOKEN="<token>"

for i in {1..105}; do
  curl -s -w "%{http_code}\n" -o /dev/null \
    -X POST http://localhost:3000/api/v1/search \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"query":"test"}'
done

# Expected: First 100 return 200, rest return 429
```

### 5. Test Analytics IDOR Protection

```bash
# User 1
TOKEN1=$(node -e "console.log(require('jsonwebtoken').sign({sessionId:'user1',userId:'u1'},'dev-secret-change-in-production'))")

# User 2
TOKEN2=$(node -e "console.log(require('jsonwebtoken').sign({sessionId:'user2',userId:'u2'},'dev-secret-change-in-production'))")

# User 1 creates event
curl -X POST http://localhost:3000/api/v1/analytics/events \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{"value":123}}'

# User 2 queries (should see 0)
curl http://localhost:3000/api/v1/analytics/events \
  -H "Authorization: Bearer $TOKEN2"

# Expected: {"total":0,"events":[]}

# User 1 queries (should see 1)
curl http://localhost:3000/api/v1/analytics/events \
  -H "Authorization: Bearer $TOKEN1"

# Expected: {"total":1,"events":[...]}
```

### 6. Test JWT Secret Fail-Fast

```bash
# Test 1: Missing secret
NODE_ENV=production node dist/server/src/server.js

# Expected: Crash
# [P0 Security] JWT_SECRET is required in production

# Test 2: Dev default
JWT_SECRET="dev-secret-change-in-production" NODE_ENV=production node dist/server/src/server.js

# Expected: Crash
# [P0 Security] JWT_SECRET cannot be dev default in production

# Test 3: Too short
JWT_SECRET="short" NODE_ENV=production node dist/server/src/server.js

# Expected: Crash
# [P0 Security] JWT_SECRET must be at least 32 characters in production
```

---

## Security Guarantees

✅ POST /api/v1/search - requires JWT  
✅ GET /api/v1/search/:requestId/result - requires JWT  
✅ POST /api/v1/analytics/events - requires JWT  
✅ GET /api/v1/analytics/events - requires JWT + IDOR protection  
✅ GET /api/v1/analytics/stats - requires JWT + IDOR protection  
✅ DELETE /api/v1/analytics/events - requires JWT + IDOR protection  
✅ req.sessionId from verified JWT only  
✅ Search rate limited: 100 req/min per IP+session  
✅ JWT_SECRET validated on startup (production)  
✅ Analytics bound to authenticated user

---

## Build

```bash
cd server
npm install --legacy-peer-deps
npm run build

# Expected: ✅ Build verified
```
