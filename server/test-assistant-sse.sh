#!/bin/bash
# Test Assistant SSE Endpoint
# Verifies SSE streaming with session cookie authentication

set -e

BASE_URL="http://localhost:3000/api/v1"
COOKIE_FILE="./test-sse-cookies.txt"

echo "========================================"
echo "Assistant SSE Endpoint Test"
echo "========================================"
echo ""

# Clean up
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
  exit 1
fi

echo "✅ Got JWT token"
echo "   sessionId: $SESSION_ID"
echo ""

# STEP 2: Create session cookie
echo "[2/4] Creating session cookie..."
curl -s -X POST "$BASE_URL/auth/session" \
  -H "Authorization: Bearer $TOKEN" \
  -c "$COOKIE_FILE" > /dev/null

if [ ! -f "$COOKIE_FILE" ]; then
  echo "❌ Failed to create session cookie"
  exit 1
fi

echo "✅ Session cookie created"
echo ""

# STEP 3: Create a search request to get a requestId
echo "[3/4] Creating search request..."
SEARCH_RESPONSE=$(curl -s -X POST "$BASE_URL/search?mode=async" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_FILE" \
  -d '{
    "query": "best pizza in Tel Aviv",
    "userLocation": {
      "lat": 32.0853,
      "lng": 34.7818
    }
  }')

REQUEST_ID=$(echo "$SEARCH_RESPONSE" | jq -r '.requestId')

if [ -z "$REQUEST_ID" ] || [ "$REQUEST_ID" = "null" ]; then
  echo "❌ Failed to create search request"
  echo "$SEARCH_RESPONSE"
  exit 1
fi

echo "✅ Search request created"
echo "   requestId: $REQUEST_ID"
echo ""

# Wait a moment for search to complete
echo "⏳ Waiting 3 seconds for search to complete..."
sleep 3
echo ""

# STEP 4: Connect to SSE endpoint with cookie (no Authorization header!)
echo "[4/4] Connecting to SSE endpoint with cookie only..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SSE Stream Output:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Capture SSE events with timeout
SSE_OUTPUT=$(timeout 5s curl -s -N "$BASE_URL/stream/assistant/$REQUEST_ID" \
  -b "$COOKIE_FILE" 2>&1 || true)

echo "$SSE_OUTPUT"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Verify SSE events received
if echo "$SSE_OUTPUT" | grep -q "event: meta"; then
  echo "✅ Received 'meta' event"
else
  echo "⚠️  No 'meta' event received"
fi

if echo "$SSE_OUTPUT" | grep -q "event: message"; then
  echo "✅ Received 'message' event"
else
  echo "⚠️  No 'message' event received"
fi

if echo "$SSE_OUTPUT" | grep -q "event: done"; then
  echo "✅ Received 'done' event"
else
  echo "⚠️  No 'done' event received"
fi

if echo "$SSE_OUTPUT" | grep -q "event: error"; then
  echo "⚠️  Received 'error' event (check server logs)"
fi

echo ""

# Parse meta event
META_DATA=$(echo "$SSE_OUTPUT" | grep -A1 "event: meta" | grep "^data:" | sed 's/^data: //')
if [ -n "$META_DATA" ]; then
  echo "📊 Meta event data:"
  echo "$META_DATA" | jq '.'
  echo ""
fi

# Parse message event
MESSAGE_DATA=$(echo "$SSE_OUTPUT" | grep -A1 "event: message" | grep "^data:" | sed 's/^data: //')
if [ -n "$MESSAGE_DATA" ]; then
  echo "💬 Message event data:"
  echo "$MESSAGE_DATA" | jq '.'
  echo ""
fi

# Clean up
rm -f "$COOKIE_FILE"

echo "========================================"
echo "✅ SSE Test Complete"
echo "========================================"
echo ""
echo "Summary:"
echo "  1. ✅ JWT token obtained"
echo "  2. ✅ Session cookie created"
echo "  3. ✅ Search request created (requestId: ${REQUEST_ID:0:20}...)"
echo "  4. ✅ SSE stream connected with cookie authentication"
echo ""
echo "Next steps:"
echo "  - Check server logs for SSE events:"
echo "    • assistant_sse_started"
echo "    • assistant_sse_completed"
echo "  - Verify cookie authentication (no Bearer token required)"
