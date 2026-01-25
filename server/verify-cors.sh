#!/bin/bash

# CORS + Auth Token Verification Script
# Usage: ./verify-cors.sh [API_BASE_URL]
# Example: ./verify-cors.sh https://api.going2eat.food

set -e

API_BASE_URL="${1:-http://localhost:3000}"
ENDPOINT="${API_BASE_URL}/api/v1/auth/token"

echo "=========================================="
echo "CORS + Auth Token Verification"
echo "=========================================="
echo "Testing endpoint: $ENDPOINT"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
PASSED=0
FAILED=0

# Function to test
test_case() {
    local name="$1"
    local expected="$2"
    shift 2
    local output
    
    echo -n "Testing: $name ... "
    
    if output=$("$@" 2>&1); then
        if echo "$output" | grep -q "$expected"; then
            echo -e "${GREEN}✅ PASSED${NC}"
            ((PASSED++))
            return 0
        else
            echo -e "${RED}❌ FAILED${NC}"
            echo "  Expected: $expected"
            echo "  Got: $output"
            ((FAILED++))
            return 1
        fi
    else
        echo -e "${RED}❌ FAILED (command error)${NC}"
        echo "  Error: $output"
        ((FAILED++))
        return 1
    fi
}

echo "Test 1: OPTIONS Preflight from www.going2eat.food"
echo "=================================================="

RESPONSE=$(curl -s -i -X OPTIONS "$ENDPOINT" \
  -H "Origin: https://www.going2eat.food" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type")

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin: https://www.going2eat.food"; then
    echo -e "${GREEN}✅ PASSED: Access-Control-Allow-Origin header present${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing Access-Control-Allow-Origin header${NC}"
    echo "$RESPONSE"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Methods:.*POST"; then
    echo -e "${GREEN}✅ PASSED: Access-Control-Allow-Methods includes POST${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing or incorrect Access-Control-Allow-Methods${NC}"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Headers:.*Content-Type"; then
    echo -e "${GREEN}✅ PASSED: Access-Control-Allow-Headers includes Content-Type${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing Content-Type in Access-Control-Allow-Headers${NC}"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Credentials: true"; then
    echo -e "${GREEN}✅ PASSED: Access-Control-Allow-Credentials is true${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing or incorrect Access-Control-Allow-Credentials${NC}"
    ((FAILED++))
fi

echo ""
echo "Test 2: OPTIONS Preflight from app.going2eat.food"
echo "=================================================="

RESPONSE=$(curl -s -i -X OPTIONS "$ENDPOINT" \
  -H "Origin: https://app.going2eat.food" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type")

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin: https://app.going2eat.food"; then
    echo -e "${GREEN}✅ PASSED: Access-Control-Allow-Origin header present${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing Access-Control-Allow-Origin header${NC}"
    echo "$RESPONSE"
    ((FAILED++))
fi

echo ""
echo "Test 3: POST /auth/token from www.going2eat.food"
echo "=================================================="

RESPONSE=$(curl -s -i -X POST "$ENDPOINT" \
  -H "Origin: https://www.going2eat.food" \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$RESPONSE" | grep -q "HTTP.*200"; then
    echo -e "${GREEN}✅ PASSED: HTTP 200 response${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Expected HTTP 200${NC}"
    echo "$RESPONSE"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin: https://www.going2eat.food"; then
    echo -e "${GREEN}✅ PASSED: CORS header present in response${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing CORS header in response${NC}"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q '"token"'; then
    echo -e "${GREEN}✅ PASSED: Response contains token${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Response missing token${NC}"
    echo "$RESPONSE"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q '"sessionId"'; then
    echo -e "${GREEN}✅ PASSED: Response contains sessionId${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Response missing sessionId${NC}"
    ((FAILED++))
fi

echo ""
echo "Test 4: POST /auth/token from app.going2eat.food"
echo "=================================================="

RESPONSE=$(curl -s -i -X POST "$ENDPOINT" \
  -H "Origin: https://app.going2eat.food" \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$RESPONSE" | grep -q "HTTP.*200"; then
    echo -e "${GREEN}✅ PASSED: HTTP 200 response${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Expected HTTP 200${NC}"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin: https://app.going2eat.food"; then
    echo -e "${GREEN}✅ PASSED: CORS header present in response${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Missing CORS header in response${NC}"
    ((FAILED++))
fi

echo ""
echo "Test 5: POST /auth/token from unauthorized origin (should fail)"
echo "================================================================"

RESPONSE=$(curl -s -i -X POST "$ENDPOINT" \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{}')

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Origin: https://evil.com"; then
    echo -e "${RED}❌ FAILED: Unauthorized origin was allowed!${NC}"
    ((FAILED++))
else
    echo -e "${GREEN}✅ PASSED: Unauthorized origin was blocked${NC}"
    ((PASSED++))
fi

echo ""
echo "Test 6: Custom Headers Support"
echo "==============================="

RESPONSE=$(curl -s -i -X OPTIONS "$ENDPOINT" \
  -H "Origin: https://www.going2eat.food" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, Authorization, X-Session-Id")

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Headers:.*Authorization"; then
    echo -e "${GREEN}✅ PASSED: Authorization header allowed${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: Authorization header not allowed${NC}"
    ((FAILED++))
fi

if echo "$RESPONSE" | grep -q "Access-Control-Allow-Headers:.*X-Session-Id"; then
    echo -e "${GREEN}✅ PASSED: X-Session-Id header allowed${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED: X-Session-Id header not allowed${NC}"
    ((FAILED++))
fi

echo ""
echo "=========================================="
echo "RESULTS"
echo "=========================================="
echo -e "Passed: ${GREEN}${PASSED}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! CORS is configured correctly.${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Please review the configuration.${NC}"
    exit 1
fi
