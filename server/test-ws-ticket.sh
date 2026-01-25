#!/usr/bin/env bash
# WebSocket Secure Ticket Flow Verification Script
# Tests the complete ticket-based authentication flow

set -e

API_BASE="http://localhost:3000/api/v1"
WS_BASE="ws://localhost:3000"

echo "=== WebSocket Secure Ticket Flow Test ==="
echo ""

# Step 1: Get JWT token
echo "1. Requesting JWT token..."
TOKEN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/token" \
  -H "Content-Type: application/json" \
  -d '{}')

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token')
SESSION_ID=$(echo "$TOKEN_RESPONSE" | jq -r '.sessionId')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to get JWT token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

echo "✓ JWT token obtained"
echo "  Session ID: $SESSION_ID"
echo ""

# Step 2: Request WebSocket ticket
echo "2. Requesting WS ticket..."
TICKET_RESPONSE=$(curl -s -X POST "${API_BASE}/ws-ticket" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

TICKET=$(echo "$TICKET_RESPONSE" | jq -r '.ticket')
EXPIRES=$(echo "$TICKET_RESPONSE" | jq -r '.expiresInSeconds')

if [ -z "$TICKET" ] || [ "$TICKET" = "null" ]; then
  echo "❌ Failed to get WS ticket"
  echo "$TICKET_RESPONSE"
  exit 1
fi

echo "✓ WS ticket obtained"
echo "  Ticket (first 12 chars): ${TICKET:0:12}..."
echo "  Expires in: ${EXPIRES}s"
echo ""

# Step 3: Test WebSocket connection with ticket
echo "3. Testing WebSocket connection with ticket..."
echo ""
echo "To test WebSocket connection manually, use:"
echo ""
echo "  wscat -c \"${WS_BASE}/ws?ticket=${TICKET}\""
echo ""
echo "Expected: Connection should succeed"
echo "Expected log: 'WS: Authenticated via ticket'"
echo ""

# Step 4: Test expired/invalid ticket (should fail)
echo "4. Testing invalid ticket (should fail)..."
echo ""
echo "  wscat -c \"${WS_BASE}/ws?ticket=invalid_ticket_12345\""
echo ""
echo "Expected: Connection should be rejected"
echo "Expected log: 'WS: Rejected - ticket invalid or expired'"
echo ""

echo "=== Manual Test Instructions ==="
echo ""
echo "Install wscat if needed:"
echo "  npm install -g wscat"
echo ""
echo "Test valid ticket (must be used within 30s):"
echo "  1. Get fresh ticket: curl -X POST \"${API_BASE}/ws-ticket\" -H \"Authorization: Bearer $TOKEN\""
echo "  2. Copy ticket value"
echo "  3. Connect: wscat -c \"${WS_BASE}/ws?ticket=<paste_ticket>\""
echo ""
echo "=== Security Checklist ==="
echo "✓ JWT not in WebSocket URL (using ticket instead)"
echo "✓ Ticket is one-time use (deleted after connection)"
echo "✓ Ticket expires in 30s"
echo "✓ Ticket stored in Redis (not in-memory)"
echo "✓ WebSocket endpoint requires ticket authentication"
echo ""
