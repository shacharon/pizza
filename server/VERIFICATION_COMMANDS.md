# P0 Security Verification Commands

Complete set of commands to verify all security fixes are working correctly.

## Prerequisites

```bash
# Start the server
cd server
npm run dev

# Or in production mode
npm run build
npm start
```

## 1. Photo API Key Leakage Tests

### Test 1.1: Sync Search - No Keys in Response

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  > sync_response.json

# Check for API key exposure
grep -i "key=" sync_response.json
grep -i "AIza" sync_response.json

# Expected: No output (no matches)
```

### Test 1.2: Async Search - No Keys in Response

```bash
# Create async job
curl -X POST "http://localhost:3000/api/v1/search?mode=async" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_verify_123" \
  -d '{"query":"pizza tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  > async_create.json

# Extract requestId
REQUEST_ID=$(cat async_create.json | jq -r '.requestId')
echo "Request ID: $REQUEST_ID"

# Poll for result (wait 5 seconds)
sleep 5

# Get result
curl "http://localhost:3000/api/v1/search/$REQUEST_ID/result" \
  -H "X-Session-Id: sess_verify_123" \
  > async_result.json

# Check for API key exposure
grep -i "key=" async_result.json
grep -i "AIza" async_result.json

# Expected: No output (no matches)
```

### Test 1.3: Verify Photo References Format

```bash
# Check that photoReference field exists and has correct format
cat sync_response.json | jq '.results[0].photoReference'

# Expected format: "places/ChIJ.../photos/..."
# Should NOT contain "key=" or "AIza"
```

## 2. Photo Proxy Endpoint Tests

### Test 2.1: Fetch Photo via Proxy

```bash
# Extract photo reference from search results
PHOTO_REF=$(cat sync_response.json | jq -r '.results[0].photoReference')
echo "Photo reference: $PHOTO_REF"

# Fetch photo via proxy
curl "http://localhost:3000/api/v1/photos/$PHOTO_REF?maxWidthPx=800" \
  -o test_photo.jpg \
  -w "\nHTTP Status: %{http_code}\nSize: %{size_download} bytes\n"

# Verify it's a valid image
file test_photo.jpg

# Expected: test_photo.jpg: JPEG image data
```

### Test 2.2: Check Response Headers

```bash
curl "http://localhost:3000/api/v1/photos/$PHOTO_REF?maxWidthPx=800" \
  -I

# Expected headers:
# - X-RateLimit-Limit: 60
# - X-RateLimit-Remaining: <number>
# - Cache-Control: public, max-age=86400, immutable
# - Content-Type: image/jpeg
# - X-Trace-Id: <trace-id>
```

### Test 2.3: Invalid Photo Reference

```bash
curl "http://localhost:3000/api/v1/photos/invalid-reference" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with VALIDATION_ERROR
```

### Test 2.4: Path Traversal Attempt

```bash
curl "http://localhost:3000/api/v1/photos/places/../../etc/passwd" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with VALIDATION_ERROR
```

## 3. Rate Limiting Tests

### Test 3.1: Rapid Requests (Exceed Limit)

```bash
# Send 65 requests rapidly (limit is 60/min)
echo "Sending 65 requests..."
for i in {1..65}; do
  STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
    "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800")
  echo "Request $i: HTTP $STATUS"
  
  # Add small delay to see rate limit in action
  sleep 0.1
done

# Expected:
# - First ~60 requests: HTTP 200 (or 404 if photo doesn't exist)
# - Remaining requests: HTTP 429 (Too Many Requests)
```

### Test 3.2: Check Rate Limit Headers

```bash
# Make a request and check headers
curl "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800" \
  -v 2>&1 | grep -i "X-RateLimit"

# Expected:
# X-RateLimit-Limit: 60
# X-RateLimit-Remaining: <number>
# X-RateLimit-Reset: <timestamp>
```

### Test 3.3: Rate Limit Reset

```bash
# Exhaust rate limit
for i in {1..61}; do
  curl -s -o /dev/null "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800"
done

# Should be rate limited now
curl "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800" \
  -w "HTTP Status: %{http_code}\n"

# Expected: 429

# Wait for rate limit window to reset (60 seconds)
echo "Waiting 60 seconds for rate limit reset..."
sleep 60

# Try again
curl "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800" \
  -w "HTTP Status: %{http_code}\n"

# Expected: 200 or 404 (not 429)
```

## 4. Input Validation Tests

### Test 4.1: Invalid Dimensions

```bash
# maxWidthPx too small
curl "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=50" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request

# maxWidthPx too large
curl "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=5000" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request
```

### Test 4.2: XSS Attempt

```bash
curl "http://localhost:3000/api/v1/photos/places/ChIJ<script>alert(1)</script>/photos/ABC" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with VALIDATION_ERROR
```

### Test 4.3: SQL Injection Attempt

```bash
curl "http://localhost:3000/api/v1/photos/places/ChIJ' OR '1'='1/photos/ABC" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with VALIDATION_ERROR
```

## 5. JSON Parsing Error Tests

### Test 5.1: Invalid JSON

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza",' \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with INVALID_JSON (NOT 500)
```

### Test 5.2: Malformed JSON

```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d 'not json at all' \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with INVALID_JSON (NOT 500)
```

## 6. IDOR Protection Tests (Existing)

### Test 6.1: Missing Session Header

```bash
curl -X POST "http://localhost:3000/api/v1/search?mode=async" \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 400 Bad Request with MISSING_SESSION_ID
```

### Test 6.2: Session Mismatch

```bash
# Create job with session A
REQUEST_ID=$(curl -s -X POST "http://localhost:3000/api/v1/search?mode=async" \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_alice_123" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  | jq -r '.requestId')

# Wait for completion
sleep 5

# Try to access with session B
curl "http://localhost:3000/api/v1/search/$REQUEST_ID/result" \
  -H "X-Session-Id: sess_bob_456" \
  -w "\nHTTP Status: %{http_code}\n"

# Expected: 404 Not Found (not 403, to avoid disclosure)
```

## 7. Security Headers Tests

### Test 7.1: Check Security Headers

```bash
curl -I http://localhost:3000/api/v1/search

# Expected headers:
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - Strict-Transport-Security: max-age=31536000; includeSubDomains (in production)
# - Content-Security-Policy: ...
```

### Test 7.2: Verify Trace ID Propagation

```bash
# Make a request and check trace ID
RESPONSE=$(curl -s http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800 \
  -D headers.txt)

# Check trace ID in headers
grep -i "X-Trace-Id" headers.txt

# Expected: X-Trace-Id: <some-trace-id>
```

## 8. End-to-End Flow Test

### Complete Flow: Search → Extract Reference → Fetch Photo

```bash
#!/bin/bash

echo "=== E2E Security Test ==="
echo

# Step 1: Search
echo "1. Performing search..."
curl -s -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  > e2e_search.json

# Check for API keys
if grep -qi "key=" e2e_search.json; then
  echo "❌ FAILED: Search response contains API key"
  exit 1
else
  echo "✅ PASSED: No API key in search response"
fi

# Step 2: Extract photo reference
echo
echo "2. Extracting photo reference..."
PHOTO_REF=$(cat e2e_search.json | jq -r '.results[0].photoReference // empty')

if [ -z "$PHOTO_REF" ]; then
  echo "⚠️  WARNING: No photo reference found in results"
  exit 0
fi

echo "   Photo reference: $PHOTO_REF"

# Verify format
if [[ ! "$PHOTO_REF" =~ ^places/[A-Za-z0-9_-]+/photos/[A-Za-z0-9_-]+$ ]]; then
  echo "❌ FAILED: Invalid photo reference format"
  exit 1
else
  echo "✅ PASSED: Valid photo reference format"
fi

# Step 3: Fetch photo
echo
echo "3. Fetching photo via proxy..."
HTTP_STATUS=$(curl -s -w "%{http_code}" -o e2e_photo.jpg \
  "http://localhost:3000/api/v1/photos/$PHOTO_REF?maxWidthPx=800")

echo "   HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" = "200" ]; then
  # Verify it's an image
  FILE_TYPE=$(file -b e2e_photo.jpg)
  if [[ "$FILE_TYPE" =~ "JPEG image" ]] || [[ "$FILE_TYPE" =~ "PNG image" ]]; then
    echo "✅ PASSED: Photo fetched successfully"
    echo "   File type: $FILE_TYPE"
    ls -lh e2e_photo.jpg
  else
    echo "❌ FAILED: Invalid file type: $FILE_TYPE"
    exit 1
  fi
elif [ "$HTTP_STATUS" = "404" ]; then
  echo "⚠️  WARNING: Photo not found (404) - may be expected if photo doesn't exist"
elif [ "$HTTP_STATUS" = "429" ]; then
  echo "⚠️  WARNING: Rate limited (429) - too many requests"
else
  echo "❌ FAILED: Unexpected HTTP status: $HTTP_STATUS"
  exit 1
fi

echo
echo "=== E2E Test Complete ==="
```

Save as `verify-security.sh`, make executable, and run:

```bash
chmod +x verify-security.sh
./verify-security.sh
```

## 9. Log Verification

### Test 9.1: Check Logs for Hashed Values

```bash
# Start server and make some requests
# Then check logs

# Should see hashed session IDs (not plain text)
grep "sessionHash" server/logs/server.log

# Should see hashed photo references (not full references)
grep "photoRefHash" server/logs/server.log

# Should NOT see plain API keys
grep -i "AIza" server/logs/server.log | grep -v "hasGoogleKey\|googleKeyLast4"

# Expected: No matches (API keys should not be in logs)
```

### Test 9.2: Security Event Logs

```bash
# Check for security-related log entries
grep "P0 Security" server/logs/server.log

# Expected patterns:
# - "[P0 Security] Photo URLs sanitized"
# - "[P0 Security] Access granted"
# - "[P0 Security] Access denied"
```

## 10. Performance Tests

### Test 10.1: Cache Headers Effectiveness

```bash
# First request (cache miss)
curl -s -w "Time: %{time_total}s\n" -o /dev/null \
  "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800"

# Second request (should be cached by browser/CDN)
curl -s -w "Time: %{time_total}s\n" -o /dev/null \
  "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800"

# Expected: First request slower than second (if caching works)
```

## Cleanup

```bash
# Remove test files
rm -f sync_response.json async_create.json async_result.json
rm -f e2e_search.json e2e_photo.jpg test_photo.jpg
rm -f headers.txt
```

## Summary Checklist

Run this checklist after all tests:

```bash
#!/bin/bash

echo "=== P0 Security Verification Checklist ==="
echo

PASS=0
FAIL=0

# Test 1: No API keys in responses
if ! curl -s -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza","userLocation":{"lat":32.0853,"lng":34.7818}}' \
  | grep -qi "key="; then
  echo "✅ No API keys in search responses"
  ((PASS++))
else
  echo "❌ API keys found in search responses"
  ((FAIL++))
fi

# Test 2: Photo proxy works
if curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800" \
  | grep -q "^[24]"; then
  echo "✅ Photo proxy endpoint responds"
  ((PASS++))
else
  echo "❌ Photo proxy endpoint not responding"
  ((FAIL++))
fi

# Test 3: Rate limiting active
STATUS_61=$(for i in {1..61}; do curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/v1/photos/places/ChIJtest/photos/ABC?maxWidthPx=800"; done | tail -1)
if [ "$STATUS_61" = "429" ]; then
  echo "✅ Rate limiting active"
  ((PASS++))
else
  echo "⚠️  Rate limiting may not be working (got $STATUS_61, expected 429)"
  ((FAIL++))
fi

# Test 4: Invalid JSON returns 400
STATUS=$(curl -s -w "%{http_code}" -o /dev/null \
  -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"invalid json')
if [ "$STATUS" = "400" ]; then
  echo "✅ Invalid JSON returns 400"
  ((PASS++))
else
  echo "❌ Invalid JSON returns $STATUS (expected 400)"
  ((FAIL++))
fi

echo
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ $FAIL -eq 0 ]; then
  echo "✅ All security tests passed!"
  exit 0
else
  echo "❌ Some security tests failed!"
  exit 1
fi
```

Save as `verify-checklist.sh` and run:

```bash
chmod +x verify-checklist.sh
./verify-checklist.sh
```
