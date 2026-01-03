#!/bin/bash

# ============================================
# Pre-Docker Build Checker (Bash)
# Run this BEFORE building Docker image
# ============================================

set +e  # Don't exit on error, we want to show all issues

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

echo -e "${CYAN}🔍 Pizza Backend - Pre-Docker Build Checker${NC}"
echo -e "${CYAN}===========================================${NC}"
echo ""

HAS_ERRORS=false

# Check 1: Node.js version
echo -e "${YELLOW}1️⃣  Checking Node.js version...${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "   ${GREEN}✅ Node.js: $NODE_VERSION${NC}"
else
    echo -e "   ${RED}❌ Node.js not found!${NC}"
    HAS_ERRORS=true
fi

# Check 2: Clean install dependencies
echo ""
echo -e "${YELLOW}2️⃣  Cleaning and installing dependencies...${NC}"

# Clean server
if [ -d "node_modules" ]; then
    rm -rf node_modules
    echo -e "   ${GRAY}🗑️  Removed old node_modules${NC}"
fi
if [ -d "dist" ]; then
    rm -rf dist
    echo -e "   ${GRAY}🗑️  Removed old dist${NC}"
fi

# Install server dependencies
echo -e "   ${GRAY}📦 Installing server dependencies...${NC}"
if npm ci --legacy-peer-deps --silent; then
    echo -e "   ${GREEN}✅ Server dependencies installed${NC}"
else
    echo -e "   ${RED}❌ Server dependency installation failed!${NC}"
    HAS_ERRORS=true
fi

# Install shared dependencies
echo -e "   ${GRAY}📦 Installing shared dependencies...${NC}"
cd ../shared
if npm install --legacy-peer-deps --silent; then
    echo -e "   ${GREEN}✅ Shared dependencies installed${NC}"
else
    echo -e "   ${YELLOW}⚠️  Shared dependency installation had issues${NC}"
fi
cd ../server

# Check 3: TypeScript compilation
echo ""
echo -e "${YELLOW}3️⃣  Running TypeScript compilation...${NC}"
if npm run build > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ TypeScript compilation successful${NC}"
    
    # Verify dist exists
    if [ -f "dist/server/src/server.js" ]; then
        echo -e "   ${GREEN}✅ Entry point exists: dist/server/src/server.js${NC}"
    else
        echo -e "   ${RED}❌ Entry point NOT found: dist/server/src/server.js${NC}"
        HAS_ERRORS=true
    fi
else
    echo -e "   ${RED}❌ TypeScript compilation failed!${NC}"
    echo -e "   ${YELLOW}Running build again to show errors...${NC}"
    npm run build
    HAS_ERRORS=true
fi

# Check 4: Linting (if available)
echo ""
echo -e "${YELLOW}4️⃣  Checking for linting...${NC}"
if grep -q '"lint"' package.json; then
    if npm run lint --silent 2>&1; then
        echo -e "   ${GREEN}✅ Linting passed${NC}"
    else
        echo -e "   ${YELLOW}⚠️  Linting found issues (non-blocking)${NC}"
    fi
else
    echo -e "   ${GRAY}⏭️  No lint script found (skipping)${NC}"
fi

# Check 5: Docker available
echo ""
echo -e "${YELLOW}5️⃣  Checking Docker...${NC}"
if command -v docker &> /dev/null; then
    echo -e "   ${GREEN}✅ Docker is available${NC}"
    
    if docker info &> /dev/null; then
        echo -e "   ${GREEN}✅ Docker daemon is running${NC}"
    else
        echo -e "   ${RED}❌ Docker daemon is not running!${NC}"
        HAS_ERRORS=true
    fi
else
    echo -e "   ${RED}❌ Docker is not installed!${NC}"
    HAS_ERRORS=true
fi

# Summary
echo ""
echo -e "${CYAN}=========================================${NC}"
if [ "$HAS_ERRORS" = true ]; then
    echo -e "${RED}❌ BUILD CHECK FAILED${NC}"
    echo ""
    echo -e "${YELLOW}Fix the errors above before building Docker image.${NC}"
    exit 1
else
    echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
    echo ""
    echo -e "${CYAN}Ready to build Docker image:${NC}"
    echo -e "   ${NC}cd ..${NC}"
    echo -e "   ${NC}docker build -f server/Dockerfile -t food-backend .${NC}"
    echo ""
    echo -e "${CYAN}Or use the automated script:${NC}"
    echo -e "   ${NC}./server/docker-build-and-push.sh${NC}"
    exit 0
fi
