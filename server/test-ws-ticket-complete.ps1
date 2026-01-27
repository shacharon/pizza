# WebSocket Ticket Authentication - Complete Verification Script
# Tests: Health → JWT → WS Ticket → Auth Protection → WS Connection

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  WebSocket Ticket Authentication - Complete Verification" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"
$testsPassed = 0
$testsFailed = 0

# ──────────────────────────────────────────────────────────────
# Step 1: Verify server health
# ──────────────────────────────────────────────────────────────
Write-Host "[1/5] Checking server health..." -ForegroundColor Yellow

try {
    $healthResponse = Invoke-RestMethod -Uri "$baseUrl/healthz" -Method GET -TimeoutSec 5
    Write-Host "      ✅ Server is running" -ForegroundColor Green
    $testsPassed++
    
    if ($healthResponse.redis -and $healthResponse.redis.connected -eq $true) {
        Write-Host "      ✅ Redis is connected" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "      ❌ Redis not connected: $($healthResponse.redis)" -ForegroundColor Red
        Write-Host "      This will cause WS ticket endpoint to return 503" -ForegroundColor Yellow
        $testsFailed++
    }
} catch {
    Write-Host "      ❌ Server not responding at $baseUrl" -ForegroundColor Red
    Write-Host "      Please start the server with: npm run dev" -ForegroundColor Red
    $testsFailed++
    exit 1
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 2: Get JWT Token
# ──────────────────────────────────────────────────────────────
Write-Host "[2/5] Requesting JWT token..." -ForegroundColor Yellow

try {
    $tokenResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/token" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{}'

    $token = $tokenResponse.token
    $sessionId = $tokenResponse.sessionId
    $traceId = $tokenResponse.traceId

    if ($token -and $sessionId) {
        Write-Host "      ✅ JWT token acquired" -ForegroundColor Green
        Write-Host "      Session ID: $sessionId" -ForegroundColor Gray
        Write-Host "      Trace ID:   $traceId" -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "      ❌ Invalid token response (missing token or sessionId)" -ForegroundColor Red
        $testsFailed++
        exit 1
    }
} catch {
    Write-Host "      ❌ Failed to get JWT token" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
    exit 1
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 3: Get WebSocket Ticket
# ──────────────────────────────────────────────────────────────
Write-Host "[3/5] Requesting WebSocket ticket..." -ForegroundColor Yellow

try {
    $ticketResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/ws-ticket" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{
            "Authorization" = "Bearer $token"
        }

    $ticket = $ticketResponse.ticket
    $ttl = $ticketResponse.ttlSeconds
    $ticketTraceId = $ticketResponse.traceId

    if ($ticket -and $ttl) {
        Write-Host "      ✅ WebSocket ticket acquired" -ForegroundColor Green
        Write-Host "      Ticket:     $($ticket.Substring(0, 16))..." -ForegroundColor Gray
        Write-Host "      TTL:        $ttl seconds" -ForegroundColor Gray
        Write-Host "      Trace ID:   $ticketTraceId" -ForegroundColor Gray
        $testsPassed++
    } else {
        Write-Host "      ❌ Invalid ticket response (missing ticket or ttlSeconds)" -ForegroundColor Red
        $testsFailed++
        exit 1
    }
} catch {
    Write-Host "      ❌ Failed to get WebSocket ticket" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "      HTTP Status: $statusCode" -ForegroundColor Red
        
        if ($statusCode -eq 404) {
            Write-Host "      ⚠️  Route not mounted - check src/routes/v1/index.ts and auth.controller.ts" -ForegroundColor Yellow
        } elseif ($statusCode -eq 401) {
            Write-Host "      ⚠️  Unauthorized - JWT might be invalid" -ForegroundColor Yellow
        } elseif ($statusCode -eq 503) {
            Write-Host "      ⚠️  Redis unavailable - check REDIS_URL and Redis server" -ForegroundColor Yellow
        }
    }
    
    exit 1
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 4: Verify Auth Protection
# ──────────────────────────────────────────────────────────────
Write-Host "[4/5] Verifying endpoint authentication..." -ForegroundColor Yellow

try {
    # Try to access ws-ticket without auth (should fail with 401)
    $unauthResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/ws-ticket" `
        -Method POST `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "      ❌ Endpoint is NOT protected! Should require auth." -ForegroundColor Red
    Write-Host "      Response: $($unauthResponse | ConvertTo-Json)" -ForegroundColor Yellow
    $testsFailed++
} catch {
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Write-Host "      ✅ Endpoint correctly requires authentication" -ForegroundColor Green
            $testsPassed++
        } else {
            Write-Host "      ⚠️  Unexpected status code: $statusCode (expected 401)" -ForegroundColor Yellow
            $testsFailed++
        }
    } else {
        Write-Host "      ⚠️  Error checking auth protection: $($_.Exception.Message)" -ForegroundColor Yellow
        $testsFailed++
    }
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 5: Validate Ticket Format and TTL
# ──────────────────────────────────────────────────────────────
Write-Host "[5/5] Validating ticket properties..." -ForegroundColor Yellow

# Check ticket format (should be UUID: 8-4-4-4-12 hex digits)
$uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
if ($ticket -match $uuidPattern) {
    Write-Host "      ✅ Ticket format is valid UUID" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "      ⚠️  Ticket format is not UUID (got: $ticket)" -ForegroundColor Yellow
    Write-Host "      This may be intentional if using a different format" -ForegroundColor Gray
}

# Check TTL (should be 60 seconds)
if ($ttl -eq 60) {
    Write-Host "      ✅ TTL is correct (60 seconds)" -ForegroundColor Green
    $testsPassed++
} else {
    Write-Host "      ⚠️  TTL is $ttl seconds (expected 60)" -ForegroundColor Yellow
    $testsFailed++
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Test Summary
# ──────────────────────────────────────────────────────────────
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($testsFailed -eq 0) {
    Write-Host "  ✅ All Tests Passed ($testsPassed/$testsPassed)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Tests: $testsPassed passed, $testsFailed failed" -ForegroundColor Yellow
}
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "Next Step: Test WebSocket Connection" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Option 1: Browser DevTools Console" -ForegroundColor Cyan
    Write-Host "-----------------------------------" -ForegroundColor Cyan
    Write-Host "const ws = new WebSocket('ws://localhost:3000/ws?ticket=$ticket');" -ForegroundColor White
    Write-Host "ws.onopen = () => console.log('[OK] WS Connected');" -ForegroundColor White
    Write-Host "ws.onerror = (e) => console.error('[ERR] WS Error:', e);" -ForegroundColor White
    Write-Host "ws.onclose = (e) => console.log('WS Closed:', e.code, e.reason);" -ForegroundColor White
    Write-Host "ws.onmessage = (e) => console.log('WS Message:', e.data);" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 2: Test Ticket One-Time Use" -ForegroundColor Cyan
    Write-Host "-----------------------------------" -ForegroundColor Cyan
    Write-Host "// After first successful connection, try again with same ticket" -ForegroundColor White
    Write-Host "const ws2 = new WebSocket('ws://localhost:3000/ws?ticket=$ticket');" -ForegroundColor White
    Write-Host "ws2.onclose = (e) => console.log('Expected 1008:', e.code, e.reason);" -ForegroundColor White
    Write-Host ""
    Write-Host "Option 3: Test in Frontend Application" -ForegroundColor Cyan
    Write-Host "---------------------------------------" -ForegroundColor Cyan
    Write-Host "1. Open frontend: http://localhost:4200" -ForegroundColor White
    Write-Host "2. Perform a search query" -ForegroundColor White
    Write-Host "3. Verify:" -ForegroundColor White
    Write-Host "   [OK] No '1008 NOT_AUTHORIZED' errors in console" -ForegroundColor White
    Write-Host "   [OK] No connection loop/reconnect spam" -ForegroundColor White
    Write-Host "   [OK] Search results stream correctly" -ForegroundColor White
    Write-Host "   [OK] No 'Connection issue' banner" -ForegroundColor White
    Write-Host ""
    Write-Host "WebSocket URL (expires in $ttl seconds):" -ForegroundColor Yellow
    Write-Host "ws://localhost:3000/ws?ticket=$ticket" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "⚠️  Please fix the failed tests before testing WebSocket connection" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
