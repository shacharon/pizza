#!/bin/bash
# Session Cookie Authentication - Comprehensive Smoke Tests
# Tests all scenarios: issuance, usage, expiry, precedence

set -e

BASE_URL="http://localhost:3000/api/v1"
COOKIE_FILE="./test-session-cookie.txt"
COOKIE_SHORT="./test-session-short.txt"
COOKIE_BAD="./test-session-bad.txt"

echo "=================================================="
echo "Session Cookie Auth - Comprehensive Smoke Tests"
echo "=================================================="
echo ""

# Clean up old cookie files
rm -f "$COOKIE_FILE" "$COOKIE_SHORT" "$COOKIE_BAD"

# ===================================================================
# TEST A: Issue Cookie Using Bearer JWT
# ===================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST A: Issue Cookie Using Bearer JWT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "[A1] Getting Bearer JWT token..."
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

echo "[A2] Creating session cookie using Bearer JWT..."
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

echo "🍪 Cookie file created: $COOKIE_FILE"
echo ""

# ===================================================================
# TEST B: Use Cookie-Only on Protected Endpoint
# ===================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST B: Use Cookie-Only on Protected Endpoint"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "[B1] Calling /whoami with cookie only (no Bearer token)..."
WHOAMI_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/whoami" \
  -b "$COOKIE_FILE" \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$WHOAMI_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$WHOAMI_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to authenticate with cookie (HTTP $HTTP_CODE)"
  echo "$BODY"
  exit 1
fi

AUTH_SOURCE=$(echo "$BODY" | jq -r '.authSource')
HAS_COOKIE=$(echo "$BODY" | jq -r '.hasCookieHeader')
HAS_BEARER=$(echo "$BODY" | jq -r '.hasBearerHeader')

if [ "$AUTH_SOURCE" != "cookie" ]; then
  echo "❌ Expected authSource='cookie', got '$AUTH_SOURCE'"
  exit 1
fi

if [ "$HAS_COOKIE" != "true" ]; then
  echo "❌ Expected hasCookieHeader=true, got '$HAS_COOKIE'"
  exit 1
fi

if [ "$HAS_BEARER" != "false" ]; then
  echo "❌ Expected hasBearerHeader=false, got '$HAS_BEARER'"
  exit 1
fi

echo "✅ Authenticated with cookie only"
echo "   authSource: $AUTH_SOURCE"
echo "   hasCookieHeader: $HAS_COOKIE"
echo "   hasBearerHeader: $HAS_BEARER"
echo ""

echo "[B2] Calling /search with cookie only..."
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

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed to call /search with cookie (HTTP $HTTP_CODE)"
  exit 1
fi

echo "✅ Protected /search endpoint works with cookie"
echo ""

# ===================================================================
# TEST D: Precedence Test (Cookie First, Then JWT)
# ===================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST D: Precedence Test (Cookie > Bearer JWT)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "[D1] Calling /whoami with BOTH cookie and Bearer token..."
BOTH_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/whoami" \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIE_FILE" \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$BOTH_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$BOTH_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Failed with both auth methods (HTTP $HTTP_CODE)"
  exit 1
fi

AUTH_SOURCE=$(echo "$BODY" | jq -r '.authSource')
HAS_COOKIE=$(echo "$BODY" | jq -r '.hasCookieHeader')
HAS_BEARER=$(echo "$BODY" | jq -r '.hasBearerHeader')

if [ "$AUTH_SOURCE" != "cookie" ]; then
  echo "❌ Expected authSource='cookie' (precedence), got '$AUTH_SOURCE'"
  exit 1
fi

if [ "$HAS_COOKIE" != "true" ] || [ "$HAS_BEARER" != "true" ]; then
  echo "❌ Expected both headers present"
  exit 1
fi

echo "✅ Cookie takes precedence over Bearer JWT"
echo "   authSource: $AUTH_SOURCE (cookie used, not Bearer)"
echo "   hasCookieHeader: $HAS_COOKIE"
echo "   hasBearerHeader: $HAS_BEARER"
echo ""

echo "[D2] Testing JWT fallback (invalid cookie + valid Bearer)..."
# Create corrupted cookie
echo "localhost	FALSE	/	FALSE	9999999999	session	INVALID_TOKEN" > "$COOKIE_BAD"

FALLBACK_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/whoami" \
  -H "Authorization: Bearer $TOKEN" \
  -b "$COOKIE_BAD" \
  -w "\nHTTP_CODE:%{http_code}")

HTTP_CODE=$(echo "$FALLBACK_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$FALLBACK_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ JWT fallback failed (HTTP $HTTP_CODE)"
  exit 1
fi

AUTH_SOURCE=$(echo "$BODY" | jq -r '.authSource')

if [ "$AUTH_SOURCE" != "bearer" ]; then
  echo "❌ Expected authSource='bearer' (fallback), got '$AUTH_SOURCE'"
  exit 1
fi

echo "✅ JWT fallback works (invalid cookie → Bearer JWT)"
echo "   authSource: $AUTH_SOURCE"
echo ""

# ===================================================================
# TEST C: Expiry Test (Quick Validation)
# ===================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST C: Cookie Expiry (Note)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  Expiry test requires:"
echo "    1. Update .env: SESSION_COOKIE_TTL_SECONDS=60"
echo "    2. Restart server"
echo "    3. Issue cookie"
echo "    4. Wait >60s"
echo "    5. Test with expired cookie → expect 401"
echo ""
echo "For automated expiry test, see docs/auth-session-cookie.md"
echo ""

# Clean up
rm -f "$COOKIE_FILE" "$COOKIE_SHORT" "$COOKIE_BAD"

echo "=================================================="
echo "✅ All Smoke Tests Passed!"
echo "=================================================="
echo ""
echo "Summary:"
echo "  ✅ TEST A: Cookie issuance works"
echo "  ✅ TEST B: Cookie-only auth works on protected endpoints"
echo "  ✅ TEST D: Cookie takes precedence over Bearer JWT"
echo "  ✅ TEST D: JWT fallback works with invalid cookie"
echo "  ⚠️  TEST C: Expiry test (manual, see docs)"
echo ""
echo "Next steps:"
echo "  - Check server logs for session_cookie_issued/auth_ok events"
echo "  - Run manual expiry test (see docs/auth-session-cookie.md)"
echo "  - Test cross-origin with Angular frontend"
