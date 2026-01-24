# Photo Proxy Security Documentation

## Overview

This document describes the security measures implemented for the photo proxy endpoint to prevent API key leakage and abuse.

## Problem Statement

**P0 Security Issue**: Google Places API keys were exposed in client-facing photo URLs.

Example of vulnerable URL:
```
https://places.googleapis.com/v1/places/ChIJ123/photos/ABC/media?maxWidthPx=800&key=AIzaSyXXXXXXXX
```

**Risk**: Exposed API keys can be:
- Scraped and used by attackers
- Used to exhaust quota limits
- Used to make unauthorized API calls
- Difficult to rotate without breaking existing URLs

## Solution Architecture

### 1. Photo Reference Format

Instead of returning full URLs with API keys, the backend returns only photo references:

```typescript
{
  "photoReference": "places/ChIJ123/photos/ABC",
  "photoReferences": [
    "places/ChIJ123/photos/ABC1",
    "places/ChIJ123/photos/ABC2"
  ]
}
```

Clients must fetch photos through the backend proxy:

```
GET /api/v1/photos/places/ChIJ123/photos/ABC?maxWidthPx=800
```

### 2. Backend Proxy Endpoint

**Endpoint**: `GET /api/v1/photos/*`

**Flow**:
1. Client requests photo via reference (no API key needed)
2. Backend validates request (rate limit, input validation)
3. Backend fetches photo from Google with API key (server-to-server)
4. Backend streams photo to client with cache headers
5. API key never exposed to client

### 3. Security Controls

#### A. Rate Limiting

- **Limit**: 60 requests per minute per IP address
- **Implementation**: In-memory token bucket
- **Response**: `429 Too Many Requests` with `Retry-After` header

Example response headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1234567890
Retry-After: 30
```

#### B. Input Validation

Uses Zod schema validation:

```typescript
{
  photoReference: string (10-500 chars, format: places/{id}/photos/{id})
  maxWidthPx: number (100-1600, default: 800)
  maxHeightPx?: number (100-1600, optional)
}
```

**Rejected inputs**:
- Path traversal attempts (`../../`)
- XSS attempts (`<script>`)
- Invalid formats
- Out-of-range dimensions

#### C. Safe Logging

Photo references are hashed (SHA-256, 12 chars) before logging:

```typescript
photoRefHash: "a1b2c3d4e5f6"  // Instead of full reference
```

IP addresses are logged for rate limiting and abuse tracking.

#### D. Error Handling

Standard error responses with trace IDs:

```json
{
  "error": "Invalid request",
  "code": "VALIDATION_ERROR",
  "traceId": "req-123-abc",
  "details": [
    { "field": "photoReference", "message": "Invalid format" }
  ]
}
```

### 4. Response Sanitization

Both sync and async search endpoints sanitize photo URLs before returning results:

```typescript
// Before sanitization (VULNERABLE)
{
  "photoUrl": "https://places.googleapis.com/v1/.../media?key=AIzaSyXXX"
}

// After sanitization (SECURE)
{
  "photoReference": "places/ChIJ123/photos/ABC",
  "photoUrl": undefined  // Removed
}
```

### 5. Cache Strategy

**Client-side caching**:
```
Cache-Control: public, max-age=86400, immutable
```

- Photos cached for 24 hours
- Marked as `immutable` (won't change)
- `public` cache (CDN-friendly)

**Benefits**:
- Reduced load on backend
- Reduced Google API quota usage
- Faster photo loading for clients

## Implementation Files

### New Files

1. **`server/src/middleware/rate-limit.middleware.ts`**
   - In-memory rate limiter
   - Token bucket algorithm
   - IP-based tracking
   - Automatic cleanup

2. **`server/src/controllers/photos/photos.controller.ts`**
   - Photo proxy endpoint
   - Zod validation
   - Google API integration
   - Cache headers

3. **`server/tests/photos.controller.test.ts`**
   - Validation tests
   - Rate limiting tests
   - Security tests
   - Error handling tests

### Modified Files

1. **`server/src/controllers/search/search.controller.ts`**
   - Added photo URL sanitization for sync mode (line 297)
   - Already had async mode sanitization (line 388)

2. **`server/src/app.ts`**
   - Added JSON SyntaxError handler
   - Returns 400 instead of 500 for invalid JSON

3. **`server/src/routes/v1/index.ts`**
   - Registered photo proxy route

## Testing

### Unit Tests

Run photo proxy tests:
```bash
npm test tests/photos.controller.test.ts
```

**Test coverage**:
- ✅ Input validation (valid/invalid formats)
- ✅ Rate limiting (per-IP tracking, window resets)
- ✅ Security (no key exposure, hashed logs)
- ✅ Response headers (cache, rate limit, trace ID)
- ✅ Error handling (400, 404, 429, 502)

### Integration Tests

#### Test 1: Fetch Photo via Proxy

```bash
# Get a photo reference from search results
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  | jq '.results[0].photoReference'

# Use the reference to fetch the photo
curl "http://localhost:3000/api/v1/photos/places/ChIJ.../photos/ABC?maxWidthPx=800" \
  --output test-photo.jpg

# Verify it's a valid image
file test-photo.jpg
# Expected: test-photo.jpg: JPEG image data
```

#### Test 2: Verify No API Keys in Responses

```bash
# Search and check for exposed keys
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  | grep -i "key="

# Expected: No output (no matches)
```

#### Test 3: Rate Limiting

```bash
# Send 65 requests rapidly (exceeds 60/min limit)
for i in {1..65}; do
  curl -s -w "%{http_code}\n" \
    "http://localhost:3000/api/v1/photos/places/ChIJ123/photos/ABC?maxWidthPx=800" \
    -o /dev/null
done

# Expected: First 60 return 200, remaining return 429
```

#### Test 4: Invalid Input

```bash
# Invalid photo reference
curl "http://localhost:3000/api/v1/photos/invalid-reference" \
  -H "Content-Type: application/json"

# Expected: 400 with VALIDATION_ERROR
```

#### Test 5: Invalid JSON

```bash
# Send malformed JSON
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza",'

# Expected: 400 with INVALID_JSON (not 500)
```

## Security Guarantees

### ✅ API Key Protection

- ✅ No API keys in any client-facing response
- ✅ Photo references only (no direct URLs with keys)
- ✅ Backend proxy hides key server-side
- ✅ Legacy URLs automatically sanitized

### ✅ Abuse Prevention

- ✅ Rate limiting: 60 req/min per IP
- ✅ Input validation: Zod schema enforcement
- ✅ Safe logging: Hashed references, no plain secrets
- ✅ Cache headers: Reduce backend load

### ✅ Error Handling

- ✅ Standard error format with trace IDs
- ✅ Proper status codes (400, 404, 429, 502)
- ✅ No stack traces in production
- ✅ JSON parsing errors return 400 (not 500)

## Monitoring

### Logs to Monitor

**Success logs**:
```json
{
  "requestId": "req-123-abc",
  "ip": "192.168.1.1",
  "photoRefHash": "a1b2c3d4e5f6",
  "maxWidthPx": 800,
  "contentType": "image/jpeg",
  "sizeBytes": 45678,
  "msg": "[PhotoProxy] Photo served successfully"
}
```

**Rate limit logs**:
```json
{
  "requestId": "req-123-abc",
  "ip": "192.168.1.1",
  "path": "/api/v1/photos/...",
  "count": 61,
  "limit": 60,
  "retryAfter": 30,
  "msg": "[RateLimit] Request blocked - limit exceeded"
}
```

**Error logs**:
```json
{
  "requestId": "req-123-abc",
  "ip": "192.168.1.1",
  "photoRefHash": "a1b2c3d4e5f6",
  "status": 404,
  "msg": "[PhotoProxy] Google API error"
}
```

### Metrics to Track

1. **Request volume**: Photos served per minute/hour
2. **Rate limit hits**: Number of 429 responses
3. **Error rates**: 404, 502, 500 response counts
4. **Cache hit rate**: Requests served from cache
5. **Response times**: P50, P95, P99 latencies

### Alerts to Configure

1. **High error rate**: >5% 5xx errors in 5 minutes
2. **Rate limit abuse**: >10 rate limit hits from single IP
3. **Validation errors**: >100 validation errors per hour
4. **Upstream errors**: Google API returning >5% errors

## Deployment Checklist

Before deploying to production:

- [ ] Run all tests: `npm test`
- [ ] Verify GOOGLE_API_KEY is in environment (not in code)
- [ ] Test rate limiting with load testing tool
- [ ] Verify no `key=` in any search response
- [ ] Test photo proxy with real Google photo references
- [ ] Configure monitoring alerts
- [ ] Review logs for any plain-text secrets
- [ ] Test graceful degradation (Google API down)
- [ ] Verify cache headers are correct
- [ ] Test invalid JSON returns 400 (not 500)

## Rollback Procedure

If issues are detected after deployment:

1. **Check logs** for specific errors:
   ```bash
   grep "PhotoProxy" server.log | grep -i error
   ```

2. **Temporarily disable rate limiting** (if false positives):
   - Set `maxRequests` to a very high value (10000)
   - Monitor for abuse

3. **Rollback code** if critical:
   ```bash
   git revert <commit-hash>
   npm run build
   pm2 restart server
   ```

4. **Verify rollback**:
   ```bash
   curl http://localhost:3000/healthz
   ```

## Future Enhancements

### Phase 2 (Optional)

1. **Redis-backed rate limiter** (for multi-instance deployments)
2. **ETag support** (for efficient cache revalidation)
3. **WebP format optimization** (smaller file sizes)
4. **CDN integration** (CloudFront/Cloudflare)
5. **Metrics dashboard** (Grafana/Datadog)

### Phase 3 (Long-term)

1. **Photo upload service** (host photos internally)
2. **Image resizing service** (generate multiple sizes)
3. **Progressive JPEG** (faster loading)
4. **AVIF format** (next-gen compression)

## References

- [Google Places Photos API](https://developers.google.com/maps/documentation/places/web-service/photos)
- [Rate Limiting Best Practices](https://tools.ietf.org/html/rfc6585#section-4)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)

---

**Status**: ✅ Implemented  
**Priority**: P0 (Critical)  
**Last Updated**: 2026-01-24
