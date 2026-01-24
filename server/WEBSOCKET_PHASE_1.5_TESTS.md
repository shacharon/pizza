# WebSocket Phase 1.5 - Manual Test Instructions

## Overview
These tests validate production-hardened WebSocket authorization for search subscriptions.

## Prerequisites
- Install `wscat`: `npm install -g wscat`
- Server running on `localhost:3000` (or configured port)
- Valid JWT token (get from login endpoint)

## Test Cases

### Test 1: Production - No Token (Connection Rejected)
**Goal:** Verify unauthenticated connections are blocked in production.

```bash
# Set production mode
NODE_ENV=production npm start

# In another terminal, attempt connection without token
wscat -c ws://localhost:3000/ws

# Expected: Connection should be rejected immediately
# Log should show: "WS: Rejected - no auth token in production"
```

---

### Test 2: Production - Valid Token + Foreign requestId (Unauthorized)
**Goal:** Verify users cannot subscribe to other users' search requests.

#### Step 2a: User A creates search request
```bash
# Login as User A and get JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"userA@example.com","password":"password"}' \
  > tokenA.json

# Extract token
TOKEN_A=$(cat tokenA.json | jq -r .token)

# Create async search request
curl -X POST "http://localhost:3000/api/v1/search?mode=async" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_A" \
  -d '{"query":"pizza near me"}' \
  > requestA.json

# Extract requestId
REQUEST_ID=$(cat requestA.json | jq -r .requestId)
echo "User A's requestId: $REQUEST_ID"
```

#### Step 2b: User B attempts to subscribe
```bash
# Login as User B
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"userB@example.com","password":"password"}' \
  > tokenB.json

TOKEN_B=$(cat tokenB.json | jq -r .token)

# User B attempts to subscribe to User A's request
wscat -c "ws://localhost:3000/ws?token=$TOKEN_B"

# Once connected, send:
{"type":"subscribe","channel":"search","requestId":"<REQUEST_ID from Step 2a>"}

# Expected: Server responds with:
# {"type":"error","error":"unauthorized","message":"Not authorized for this request"}
# Log should show: "WS: Subscribe rejected - unauthorized request (user mismatch)"
```

---

### Test 3: Production - Ownerless requestId (Unauthorized)
**Goal:** Verify legacy/malformed requests without owner are blocked.

#### Step 3a: Create ownerless request (simulate old data)
```bash
# Connect to Redis and manually create a job without owner fields
redis-cli
> HSET "search:job:req-TEST-999" requestId "req-TEST-999"
> HSET "search:job:req-TEST-999" status "PENDING"
> HSET "search:job:req-TEST-999" query "test query"
# Note: ownerUserId and ownerSessionId are NOT set
> HGET "search:job:req-TEST-999" ownerUserId
(nil)
```

#### Step 3b: Attempt to subscribe
```bash
# Login and get valid token
TOKEN=$(curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r .token)

# Connect and subscribe
wscat -c "ws://localhost:3000/ws?token=$TOKEN"

# Send:
{"type":"subscribe","channel":"search","requestId":"req-TEST-999"}

# Expected: Server responds with:
# {"type":"error","error":"unauthorized","message":"Not authorized for this request"}
# Log should show: "WS: Subscribe rejected - owner missing"
```

---

### Test 4: Development - Ownerless Allowed (Backward Compatibility)
**Goal:** Verify dev mode allows ownerless subscriptions for easier testing.

```bash
# Set development mode
NODE_ENV=development npm start

# In another terminal, create request without auth
curl -X POST "http://localhost:3000/api/v1/search?mode=async" \
  -H "Content-Type: application/json" \
  -d '{"query":"test pizza"}' \
  > requestDev.json

REQUEST_ID=$(cat requestDev.json | jq -r .requestId)

# Connect without token (dev allows no-origin localhost)
wscat -c ws://localhost:3000/ws

# Subscribe
{"type":"subscribe","channel":"search","requestId":"<REQUEST_ID>"}

# Expected: Subscription succeeds
# Server responds with progress updates as search executes
# Log should show: "websocket_subscribed" (no rejection)
```

---

## Expected Log Patterns

### Production - Rejected Connection (Test 1)
```
WS: Connection rejected { ip: '127.0.0.1', origin: undefined, reason: 'no auth token in production' }
```

### Production - User Mismatch (Test 2)
```
WS: Subscribe rejected - unauthorized request (user mismatch) {
  clientId: 'ws-...',
  channel: 'search',
  requestIdHash: 'a1b2c3d4e5f6',
  reason: 'user_mismatch'
}
```

### Production - Owner Missing (Test 3)
```
WS: Subscribe rejected - owner missing {
  clientId: 'ws-...',
  channel: 'search',
  requestIdHash: 'a1b2c3d4e5f6',
  reason: 'owner_missing'
}
```

### Development - Allowed (Test 4)
```
websocket_subscribed {
  clientId: 'ws-...',
  channel: 'search',
  requestId: 'req-...'
}
```

---

## Cleanup
```bash
# Remove test data from Redis
redis-cli DEL "search:job:req-TEST-999"

# Remove temp files
rm tokenA.json tokenB.json requestA.json requestDev.json
```

---

## Success Criteria
✅ Test 1: Connection rejected without token in production  
✅ Test 2: User B cannot subscribe to User A's request  
✅ Test 3: Ownerless requests blocked in production  
✅ Test 4: Dev mode allows ownerless for backward compatibility
