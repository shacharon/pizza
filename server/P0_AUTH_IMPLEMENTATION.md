# P0 Security Implementation - HTTP API Authentication

## Modified Files

1. **server/src/middleware/auth.middleware.ts** (NEW)
   - JWT authentication middleware
   - `authenticateJWT()` - requires valid JWT
   - `optionalJWT()` - allows requests without JWT

2. **server/src/config/env.ts**
   - Added `validateJwtSecret()` function
   - Crashes on startup if JWT_SECRET missing/dev-default in production
   - Returns jwtSecret in config

3. **server/src/routes/v1/index.ts**
   - Applied `authenticateJWT` to `/search` routes
   - Applied `authenticateJWT` to `/analytics` routes
   - Applied search rate limiter (100 req/min)

4. **server/src/controllers/search/search.controller.ts**
   - Uses authenticated `sessionId` from JWT
   - Changed 400 to 401 for missing auth

5. **server/src/controllers/analytics/analytics.controller.ts**
   - Binds events to `userId`/`sessionId` from JWT
   - GET/DELETE filter by authenticated user (IDOR fix)
   - All endpoints require authentication

6. **server/package.json**
   - Added `jsonwebtoken` dependency
   - Added `@types/jsonwebtoken` dev dependency

## Environment Variables

Required in production:
```bash
JWT_SECRET=<32+ character secret>
```

Development default (auto-used if not set):
```
dev-secret-change-in-production
```

Production fail-fast checks:
- Missing JWT_SECRET → crash
- JWT_SECRET equals dev default → crash
- JWT_SECRET < 32 chars → crash

## Verification Commands

### 1. Generate JWT Token

```bash
# Install jwt-cli or use Node.js:
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { sessionId: 'test-session-123', userId: 'user-456' },
  process.env.JWT_SECRET || 'dev-secret-change-in-production',
  { expiresIn: '24h' }
);
console.log(token);
"
```

### 2. Test Protected Search (Without Auth - Should Fail)

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32,"lng":34}}'

# Expected: 401 Unauthorized
# {"error":"Unauthorized","code":"MISSING_AUTH","traceId":"..."}
```

### 3. Test Protected Search (With Auth - Should Succeed)

```bash
TOKEN="<token-from-step-1>"

curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"pizza","userLocation":{"lat":32,"lng":34}}'

# Expected: 200 with search results
```

### 4. Test Rate Limiting (Should Block After 100 Requests)

```bash
TOKEN="<token-from-step-1>"

for i in {1..105}; do
  STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
    -X POST http://localhost:3000/api/v1/search \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"query":"test"}')
  echo "Request $i: HTTP $STATUS"
done

# Expected: First 100 return 200, remaining return 429
```

### 5. Test Analytics IDOR Protection

```bash
# User 1 token
TOKEN1=$(node -e "console.log(require('jsonwebtoken').sign({sessionId:'user1',userId:'u1'},'dev-secret-change-in-production',{expiresIn:'24h'}))")

# User 2 token
TOKEN2=$(node -e "console.log(require('jsonwebtoken').sign({sessionId:'user2',userId:'u2'},'dev-secret-change-in-production',{expiresIn:'24h'}))")

# User 1 creates event
curl -X POST http://localhost:3000/api/v1/analytics/events \
  -H "Authorization: Bearer $TOKEN1" \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{"foo":"bar"}}'

# User 2 tries to query (should see 0 events)
curl http://localhost:3000/api/v1/analytics/events \
  -H "Authorization: Bearer $TOKEN2"

# Expected: {"total":0,"limit":100,"events":[]}

# User 1 queries (should see own event)
curl http://localhost:3000/api/v1/analytics/events \
  -H "Authorization: Bearer $TOKEN1"

# Expected: {"total":1,"limit":100,"events":[{...}]}
```

### 6. Test JWT Secret Validation (Production)

```bash
# Remove JWT_SECRET and run
NODE_ENV=production node dist/server/src/server.js

# Expected: Crash with error
# [P0 Security] JWT_SECRET is required in production

# Set dev default and run
JWT_SECRET="dev-secret-change-in-production" NODE_ENV=production node dist/server/src/server.js

# Expected: Crash with error
# [P0 Security] JWT_SECRET cannot be dev default in production

# Set short secret and run
JWT_SECRET="short" NODE_ENV=production node dist/server/src/server.js

# Expected: Crash with error
# [P0 Security] JWT_SECRET must be at least 32 characters in production
```

## Security Guarantees

✅ All HTTP API endpoints protected with JWT
✅ req.sessionId ONLY from verified JWT
✅ Search rate limited (100 req/min per IP+session)
✅ JWT secret validated on startup (production)
✅ Analytics events scoped to authenticated user
✅ IDOR protection on analytics read/delete

## Build & Deploy

```bash
cd server
npm install
npm run build
npm start
```
