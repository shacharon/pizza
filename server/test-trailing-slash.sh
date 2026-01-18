#!/bin/bash
# Test script to verify /result and /result/ return identical responses
# Usage: ./test-trailing-slash.sh <requestId>

set -e

REQUEST_ID="${1:-test-req-123}"
BASE_URL="http://localhost:3000/api/v1/search"

echo "Testing trailing slash behavior for: $REQUEST_ID"
echo "================================================"

# Test without trailing slash
echo -e "\n1. Testing WITHOUT trailing slash: $BASE_URL/$REQUEST_ID/result"
RESPONSE1=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/$REQUEST_ID/result")
HTTP_CODE1=$(echo "$RESPONSE1" | grep "HTTP_CODE:" | cut -d: -f2)
BODY1=$(echo "$RESPONSE1" | sed '/HTTP_CODE:/d')

echo "   HTTP Status: $HTTP_CODE1"
echo "   Body: $BODY1"

# Test with trailing slash
echo -e "\n2. Testing WITH trailing slash: $BASE_URL/$REQUEST_ID/result/"
RESPONSE2=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/$REQUEST_ID/result/")
HTTP_CODE2=$(echo "$RESPONSE2" | grep "HTTP_CODE:" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | sed '/HTTP_CODE:/d')

echo "   HTTP Status: $HTTP_CODE2"
echo "   Body: $BODY2"

# Compare responses
echo -e "\n3. Comparison:"
if [ "$HTTP_CODE1" = "$HTTP_CODE2" ]; then
    echo "   ✅ HTTP Status codes match: $HTTP_CODE1"
else
    echo "   ❌ HTTP Status codes differ: $HTTP_CODE1 vs $HTTP_CODE2"
    exit 1
fi

if [ "$BODY1" = "$BODY2" ]; then
    echo "   ✅ Response bodies match"
else
    echo "   ❌ Response bodies differ"
    echo "   Body1: $BODY1"
    echo "   Body2: $BODY2"
    exit 1
fi

echo -e "\n✅ SUCCESS: Both routes return identical responses (no redirect)"
