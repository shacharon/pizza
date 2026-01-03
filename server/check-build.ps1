# ============================================
# Pre-Docker Build Checker (PowerShell)
# Run this BEFORE building Docker image
# ============================================

$ErrorActionPreference = "Stop"

Write-Host "🔍 Pizza Backend - Pre-Docker Build Checker" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

$hasErrors = $false

# Check 1: Node.js version
Write-Host "1️⃣  Checking Node.js version..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "   ✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Node.js not found!" -ForegroundColor Red
    $hasErrors = $true
}

# Check 2: Clean install dependencies
Write-Host ""
Write-Host "2️⃣  Cleaning and installing dependencies..." -ForegroundColor Yellow
try {
    # Clean server
    if (Test-Path "node_modules") {
        Remove-Item -Recurse -Force node_modules
        Write-Host "   🗑️  Removed old node_modules" -ForegroundColor Gray
    }
    if (Test-Path "dist") {
        Remove-Item -Recurse -Force dist
        Write-Host "   🗑️  Removed old dist" -ForegroundColor Gray
    }
    
    # Install server dependencies
    Write-Host "   📦 Installing server dependencies..." -ForegroundColor Gray
    npm ci --legacy-peer-deps --silent
    Write-Host "   ✅ Server dependencies installed" -ForegroundColor Green
    
    # Install shared dependencies
    Write-Host "   📦 Installing shared dependencies..." -ForegroundColor Gray
    Push-Location ..\shared
    npm install --legacy-peer-deps --silent
    Pop-Location
    Write-Host "   ✅ Shared dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Dependency installation failed!" -ForegroundColor Red
    $hasErrors = $true
}

# Check 3: TypeScript compilation
Write-Host ""
Write-Host "3️⃣  Running TypeScript compilation..." -ForegroundColor Yellow
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript compilation failed"
    }
    Write-Host "   ✅ TypeScript compilation successful" -ForegroundColor Green
    
    # Verify dist exists
    if (Test-Path "dist\server\src\server.js") {
        Write-Host "   ✅ Entry point exists: dist\server\src\server.js" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Entry point NOT found: dist\server\src\server.js" -ForegroundColor Red
        $hasErrors = $true
    }
} catch {
    Write-Host "   ❌ TypeScript compilation failed!" -ForegroundColor Red
    Write-Host "   Running build again to show errors..." -ForegroundColor Yellow
    npm run build
    $hasErrors = $true
}

# Check 4: Linting (if available)
Write-Host ""
Write-Host "4️⃣  Checking for linting..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" | ConvertFrom-Json
if ($packageJson.scripts.lint) {
    try {
        npm run lint --silent
        Write-Host "   ✅ Linting passed" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  Linting found issues (non-blocking)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⏭️  No lint script found (skipping)" -ForegroundColor Gray
}

# Check 5: Docker available
Write-Host ""
Write-Host "5️⃣  Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not available"
    }
    Write-Host "   ✅ Docker is available" -ForegroundColor Green
    
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker not running"
    }
    Write-Host "   ✅ Docker daemon is running" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Docker is not available or not running!" -ForegroundColor Red
    $hasErrors = $true
}

# Summary
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
if ($hasErrors) {
    Write-Host "❌ BUILD CHECK FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "Fix the errors above before building Docker image." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "✅ ALL CHECKS PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ready to build Docker image:" -ForegroundColor Cyan
    Write-Host "   cd .." -ForegroundColor White
    Write-Host "   docker build -f server\Dockerfile -t food-backend ." -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the automated script:" -ForegroundColor Cyan
    Write-Host "   .\server\docker-build-and-push.ps1" -ForegroundColor White
    exit 0
}
