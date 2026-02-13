#!/bin/bash
# Test Session Cookie Authentication
# Tests creating and using HttpOnly session cookies

set -e

BASE_URL="http://localhost:3000/api/v1"
COOKIE_FILE="./test-session-cookie.txt"

echo "==================================="
echo "Session Cookie Auth Test"
echo "==================================="
echo ""

# Clean up old cookie file
rm -f "$COOKIE_FILE"

# STEP 1: Get Bearer JWT token
echo "[1/4] Getting Bearer JWT token..."
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/token" \
  -H "Content-Type: application/json" \
  -d '{}')

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token')
SESSION_ID=$(echo "$TOKEN_RESPONSE" | jq -r '.sessionId')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to get JWT token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "✅ Got JWT token"
echo "   sessionId: $SESSION_ID"
echo ""

# STEP 2: Create session cookie using Bearer JWT
echo "[2/4] Creating session cookie using Bearer JWT..."
COOKIE_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/session" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -c "$COOKIE_FILE" \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$COOKIE_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$COOKIE_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to create session cookie (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi

echo "✅ Session cookie created"
echo "$BODY" | jq '.'
echo ""

# Verify cookie file was created
if [ ! -f "$COOKIE_FILE" ]; then
  echo "❌ Cookie file not created"
  exit 1
fi

echo "🍪 Cookie file contents:"
cat "$COOKIE_FILE"
echo ""

# STEP 3: Test protected endpoint with session cookie (NO Bearer token)
echo "[3/4] Calling protected endpoint with session cookie only..."
SEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL/search?mode=sync" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d '{
    "query": "pizza in Tel Aviv",
    "userLocation": {
      "lat": 32.0853,
      "lng": 34.7818
    }
  }' \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$SEARCH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$SEARCH_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to call protected endpoint with cookie (HTTP $HTTP_CODE)"
  echo "$BODY" | head -20
  exit 1
fi

echo "✅ Protected endpoint called successfully with session cookie"
RESULT_COUNT=$(echo "$BODY" | jq -r '.results | length')
echo "   Result count: $RESULT_COUNT"
echo ""

# STEP 4: Verify Bearer JWT still works (both auth methods valid)
echo "[4/4] Verifying Bearer JWT still works..."
JWT_RESPONSE=$(curl -s -X POST "$BASE_URL/search?mode=sync" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "sushi in Tel Aviv",
    "userLocation": {
      "lat": 32.0853,
      "lng": 34.7818
    }
  }' \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$JWT_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Bearer JWT no longer works (HTTP $HTTP_CODE)"
  exit 1
fi

echo "✅ Bearer JWT still works"
echo ""

# Clean up
rm -f "$COOKIE_FILE"

echo "==================================="
echo "✅ All tests passed!"
echo "==================================="
echo ""
echo "Summary:"
echo "  1. ✅ JWT token generation works"
echo "  2. ✅ Session cookie creation works (POST /auth/session)"
echo "  3. ✅ Protected endpoint accepts session cookie"
echo "  4. ✅ Bearer JWT remains valid (dual auth)"
