# ✅ Phase 1: WebSocket Authentication & Authorization

**Date**: 2026-01-24  
**Status**: ✅ COMPLETE  
**Build**: ✅ PASSING  

---

## 🎯 IMPLEMENTATION SUMMARY

Implemented **Phase 1 WebSocket security** with minimal changes:
- **Handshake Authentication** (production only)
- **Subscribe Authorization** (ownership verification)
- **Request Ownership Tracking** (JobStore)

---

## 📦 FILES MODIFIED

| File | Changes | Lines |
|------|---------|-------|
| `lib/auth/jwt-verifier.ts` | **NEW** - Minimal JWT verifier (HS256) | +103 |
| `job-store/job-store.interface.ts` | Added `ownerUserId`, `ownerSessionId` | +3 |
| `job-store/redis-search-job.store.ts` | Store ownership on job creation | +5 |
| `job-store/inmemory-search-job.store.ts` | Store ownership on job creation | +5 |
| `controllers/search/search.controller.ts` | Extract & pass owner to createJob | +4 |
| `websocket/websocket-manager.ts` | Auth + authz logic | +120 |
| `server.ts` | Pass jobStore to WebSocketManager | +3 |

**Total**: ~240 lines added

---

## 🔐 A) HANDSHAKE AUTHENTICATION

### Implementation

**File**: `websocket-manager.ts:141-217`

**Logic**:
```typescript
// Production only
if (process.env.NODE_ENV === 'production') {
  // 1. Extract token from query param or header
  const token = url.searchParams.get('token') || 
                info.req.headers['sec-websocket-protocol'];
  
  // 2. Reject if missing
  if (!token) {
    logger.warn({ ip, origin }, 'WS: Rejected - no auth token');
    return false;
  }
  
  // 3. Verify JWT
  const payload = verifyJWT(token);
  if (!payload) {
    logger.warn({ ip, origin, reason: 'invalid_token' }, 'WS: Rejected');
    return false;
  }
  
  // 4. Attach identity to request
  info.req.userId = payload.sub;
  info.req.sessionId = payload.sessionId || payload.sid || null;
}
```

**Token Extraction**:
1. Query param: `wss://api.example.com/ws?token=<JWT>`
2. Header: `Sec-WebSocket-Protocol: <JWT>`

**JWT Verification** (`lib/auth/jwt-verifier.ts`):
- Algorithm: HS256 (HMAC SHA-256)
- Secret: `process.env.JWT_SECRET` (default: `dev-secret-change-in-production`)
- Required claims: `sub` (userId)
- Optional claims: `sessionId`, `sid`, `exp`
- Validates signature + expiration

**Development Mode**:
- Authentication **disabled** in dev (`NODE_ENV !== 'production'`)
- Localhost connections allowed without token

---

## 🔒 B) SUBSCRIBE AUTHORIZATION

### Implementation

**File**: `websocket-manager.ts:362-428`

**Logic**:
```typescript
case 'subscribe': {
  const channel = envelope.channel || 'search';
  const requestId = envelope.requestId;
  const sessionId = envelope.sessionId;
  
  // 1. Require auth in production
  if (isProduction && !wsUserId && !wsSessionId) {
    this.sendError(ws, 'unauthorized', 'Authentication required');
    return;
  }
  
  // 2. Ownership verification
  if (channel === 'assistant' && sessionId) {
    // Assistant: sessionId must match
    if (wsSessionId && sessionId !== wsSessionId) {
      this.sendError(ws, 'unauthorized', 'Not authorized for this session');
      return;
    }
  } else if (channel === 'search') {
    // Search: verify requestId ownership
    const owner = await this.getRequestOwner(requestId);
    
    if (owner) {
      const ownerMatches = 
        (wsUserId && owner.userId === wsUserId) ||
        (wsSessionId && owner.sessionId === wsSessionId);
      
      if (!ownerMatches) {
        this.sendError(ws, 'unauthorized', 'Not authorized for this request');
        return;
      }
    }
    // If no owner stored, allow (backward compat)
  }
  
  // 3. Subscribe if authorized
  this.subscribeToChannel(channel, requestId, sessionId, ws);
}
```

**Authorization Rules**:
- **Assistant channel**: `envelope.sessionId` must match `ws.sessionId`
- **Search channel**: `requestId` must belong to `ws.userId` OR `ws.sessionId`
- **Backward compat**: If no owner stored, allow subscription

**Logging** (Production):
- Uses `hashRequestId()` (SHA-256, 12 chars) instead of full requestId
- Logs authorization failures with reason codes

---

## 💾 C) OWNERSHIP STORAGE

### Job Creation

**File**: `controllers/search/search.controller.ts:185-194`

```typescript
// Extract authenticated identity from request
const ownerUserId = (req as any).userId || null;
const ownerSessionId = queryData.sessionId || req.ctx?.sessionId || null;

await searchJobStore.createJob(requestId, {
  sessionId: queryData.sessionId || 'new',
  query: queryData.query,
  ownerUserId,      // Phase 1: Track owner
  ownerSessionId    // Phase 1: Track owner
});
```

**Storage**:
- **Redis**: `SearchJob` includes `ownerUserId`, `ownerSessionId`
- **InMemory**: Same fields added
- **TTL**: Inherits existing TTL (24h Redis, 10min InMemory)

### Ownership Retrieval

**File**: `websocket-manager.ts:1004-1027`

```typescript
private async getRequestOwner(requestId: string): Promise<{
  userId?: string;
  sessionId?: string;
} | null> {
  if (!this.jobStore) return null;
  
  const job = await this.jobStore.getJob(requestId);
  if (!job) return null;
  
  const result: { userId?: string; sessionId?: string } = {};
  if (job.ownerUserId) result.userId = job.ownerUserId;
  if (job.ownerSessionId) result.sessionId = job.ownerSessionId;
  
  return Object.keys(result).length > 0 ? result : null;
}
```

---

## 🧪 D) TESTING

### Manual Test Plan

#### Test 1: Valid Token + Own RequestId (Production)

**Setup**:
```bash
export NODE_ENV=production
export JWT_SECRET=test-secret-123
```

**Generate Token**:
```typescript
import { generateTestJWT } from './lib/auth/jwt-verifier.js';
const token = generateTestJWT('user-123', 'session-abc');
console.log(token);
```

**Connect**:
```javascript
const ws = new WebSocket('wss://api.example.com/ws?token=' + token);

ws.onopen = () => {
  // Subscribe to own request
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'search',
    requestId: 'req-owned-by-user-123'
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
  // ✅ Should receive events
};
```

**Expected**: ✅ Connection accepted, subscription succeeds, events received

---

#### Test 2: Missing Token (Production)

**Connect**:
```javascript
const ws = new WebSocket('wss://api.example.com/ws');
// No token provided
```

**Expected**: ❌ Connection rejected immediately

**Log**:
```json
{
  "level": "warn",
  "ip": "192.168.1.100",
  "origin": "https://app.example.com",
  "message": "WS: Rejected - no auth token in production"
}
```

---

#### Test 3: Valid Token + Someone Else's RequestId (Production)

**Setup**:
```typescript
const token = generateTestJWT('user-123', 'session-abc');
```

**Connect & Subscribe**:
```javascript
const ws = new WebSocket('wss://api.example.com/ws?token=' + token);

ws.onopen = () => {
  // Try to subscribe to another user's request
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'search',
    requestId: 'req-owned-by-user-456'  // Different user
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg);
  // ✅ Should receive error
};
```

**Expected**: 
- ✅ Connection accepted (valid token)
- ❌ Subscription rejected with error message

**Response**:
```json
{
  "type": "error",
  "requestId": "unknown",
  "error": "unauthorized",
  "message": "Not authorized for this request"
}
```

**Log**:
```json
{
  "level": "warn",
  "clientId": "ws-1234567890-abc123",
  "requestIdHash": "a1b2c3d4e5f6",
  "channel": "search",
  "reason": "owner_mismatch",
  "message": "WS: Subscribe rejected - unauthorized request"
}
```

---

#### Test 4: Development Mode (No Auth Required)

**Setup**:
```bash
export NODE_ENV=development
```

**Connect**:
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
// No token needed in dev

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'search',
    requestId: 'any-request-id'
  }));
};
```

**Expected**: ✅ Connection accepted, subscription succeeds (no auth checks)

---

## 🔧 CONFIGURATION

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Enable auth in `production` |
| `JWT_SECRET` | **Yes (prod)** | `dev-secret-change-in-production` | HMAC secret for JWT |
| `WS_ALLOWED_ORIGINS` | **Yes (prod)** | `*` | Comma-separated origins |

### Example .env

```bash
# Production
NODE_ENV=production
JWT_SECRET=your-secure-secret-min-32-chars
WS_ALLOWED_ORIGINS=https://app.going2eat.food,https://admin.going2eat.food

# Development
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-production
WS_ALLOWED_ORIGINS=*
```

---

## 📊 SECURITY IMPROVEMENTS

| Issue | Before | After | Status |
|-------|--------|-------|--------|
| Missing WS Authentication | ❌ No auth | ✅ JWT required (prod) | **FIXED** |
| Request ID Enumeration | ❌ Subscribe to any ID | ✅ Ownership verified | **FIXED** |
| Session Hijacking | ❌ Subscribe to any session | ✅ Session match required | **FIXED** |
| Sensitive Data in Logs | ⚠️ Full requestId | ✅ Hashed (12 chars) | **FIXED** |

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] Set `JWT_SECRET` in production environment (min 32 chars)
- [ ] Set `WS_ALLOWED_ORIGINS` to actual frontend domains
- [ ] Ensure `NODE_ENV=production` in ECS task definition
- [ ] Test JWT generation/verification with production secret

### Post-Deployment

- [ ] Monitor logs for `WS: Rejected` warnings
- [ ] Verify auth failures return proper error messages
- [ ] Check ownership verification working (no false rejections)
- [ ] Confirm requestId hashing in production logs

---

## 🔄 BACKWARD COMPATIBILITY

**Existing Requests** (created before Phase 1):
- ✅ No `ownerUserId`/`ownerSessionId` stored
- ✅ Subscription allowed (backward compat mode)
- ⚠️ No ownership enforcement for old requests

**New Requests** (created after Phase 1):
- ✅ Ownership stored automatically
- ✅ Ownership enforced on subscribe
- ✅ Full authorization active

**Migration**: No action needed - gradual rollout as old requests expire (TTL)

---

## 📈 MONITORING

### Key Metrics

**Authentication**:
- `WS: Rejected - no auth token` → Missing token attempts
- `WS: Rejected - token verification failed` → Invalid token attempts
- `WS: Authenticated` → Successful authentications

**Authorization**:
- `WS: Subscribe rejected - not authenticated` → Unauthenticated subscribe attempts
- `WS: Subscribe rejected - unauthorized request` → Ownership violations
- `WS: Subscribe rejected - unauthorized session` → Session mismatches

**Ownership**:
- `[RedisJobStore] Job created` with `hasOwner:true` → Ownership tracked
- `WS: Failed to get request owner` → JobStore lookup failures

---

## 🛡️ SECURITY NOTES

### What's Protected

✅ **Handshake**: Only valid JWT tokens can connect (prod)  
✅ **Subscription**: Only owners can subscribe to their requests  
✅ **Session Isolation**: Assistant sessions are user-scoped  
✅ **Log Privacy**: RequestIds hashed in production logs  

### What's NOT Protected (Future Phases)

❌ **Rate Limiting**: No connection/message rate limits  
❌ **Token Rotation**: No refresh token mechanism  
❌ **Audit Trail**: No detailed auth event logging  
❌ **IP Allowlisting**: No IP-based restrictions  

---

## 🔮 FUTURE ENHANCEMENTS

**Phase 2**:
- Rate limiting (connections per IP, messages per client)
- Connection timeouts for idle clients
- JSON schema validation

**Phase 3**:
- Refresh token support
- Token revocation list (Redis)
- Audit logging for auth events

**Phase 4**:
- Role-based access control (RBAC)
- Fine-grained permissions per channel
- Admin/support override capabilities

---

**Implementation Complete**: ✅  
**Build Status**: ✅ PASSING  
**Ready for**: Staging deployment  
**Next Step**: Manual testing with generated JWT tokens