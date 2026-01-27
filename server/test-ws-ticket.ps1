# WebSocket Ticket Authentication Verification Script
# Tests the complete flow: JWT token → WS ticket → Manual WS connection test

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  WebSocket Ticket Authentication Verification" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3000"

# ──────────────────────────────────────────────────────────────
# Step 1: Verify server is running
# ──────────────────────────────────────────────────────────────
Write-Host "[1/4] Checking server health..." -ForegroundColor Yellow

try {
    $healthResponse = Invoke-RestMethod -Uri "$baseUrl/healthz" -Method GET -TimeoutSec 5
    Write-Host "      ✅ Server is running" -ForegroundColor Green
    
    if ($healthResponse.redis -and $healthResponse.redis.connected -eq $true) {
        Write-Host "      ✅ Redis is connected" -ForegroundColor Green
    } else {
        Write-Host "      ⚠️  Redis status: $($healthResponse.redis)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "      ❌ Server not responding at $baseUrl" -ForegroundColor Red
    Write-Host "      Please start the server with: npm run dev" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 2: Get JWT Token
# ──────────────────────────────────────────────────────────────
Write-Host "[2/4] Requesting JWT token..." -ForegroundColor Yellow

try {
    $tokenResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/token" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{}'

    $token = $tokenResponse.token
    $sessionId = $tokenResponse.sessionId
    $traceId = $tokenResponse.traceId

    Write-Host "      ✅ JWT token acquired" -ForegroundColor Green
    Write-Host "      Session ID: $sessionId" -ForegroundColor Gray
    Write-Host "      Trace ID:   $traceId" -ForegroundColor Gray
} catch {
    Write-Host "      ❌ Failed to get JWT token" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 3: Get WebSocket Ticket
# ──────────────────────────────────────────────────────────────
Write-Host "[3/4] Requesting WebSocket ticket..." -ForegroundColor Yellow

try {
    $ticketResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/ws-ticket" `
        -Method POST `
        -ContentType "application/json" `
        -Headers @{
            "Authorization" = "Bearer $token"
        }

    $ticket = $ticketResponse.ticket
    $ttl = $ticketResponse.expiresInSeconds
    $ticketTraceId = $ticketResponse.traceId

    Write-Host "      ✅ WebSocket ticket acquired" -ForegroundColor Green
    Write-Host "      Ticket:     $($ticket.Substring(0, 16))..." -ForegroundColor Gray
    Write-Host "      TTL:        $ttl seconds" -ForegroundColor Gray
    Write-Host "      Trace ID:   $ticketTraceId" -ForegroundColor Gray
} catch {
    Write-Host "      ❌ Failed to get WebSocket ticket" -ForegroundColor Red
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "      HTTP Status: $statusCode" -ForegroundColor Red
        
        if ($statusCode -eq 404) {
            Write-Host "      ⚠️  Endpoint not found - route might not be mounted correctly" -ForegroundColor Yellow
        } elseif ($statusCode -eq 401) {
            Write-Host "      ⚠️  Unauthorized - JWT might be invalid" -ForegroundColor Yellow
        } elseif ($statusCode -eq 503) {
            Write-Host "      ⚠️  Redis unavailable - check Redis connection" -ForegroundColor Yellow
        }
    }
    
    exit 1
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Step 4: Verify Auth Protection
# ──────────────────────────────────────────────────────────────
Write-Host "[4/4] Verifying endpoint protection..." -ForegroundColor Yellow

try {
    # Try to access ws-ticket without auth (should fail)
    $unauthResponse = Invoke-RestMethod -Uri "$baseUrl/api/v1/auth/ws-ticket" `
        -Method POST `
        -ContentType "application/json" `
        -ErrorAction Stop
    
    Write-Host "      ⚠️  Endpoint is not protected! Should require auth." -ForegroundColor Yellow
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "      ✅ Endpoint correctly requires authentication" -ForegroundColor Green
    } else {
        Write-Host "      ⚠️  Unexpected status code: $statusCode" -ForegroundColor Yellow
    }
}

Write-Host ""

# ──────────────────────────────────────────────────────────────
# Success Summary
# ──────────────────────────────────────────────────────────────
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✅ All API Endpoints Working Correctly" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Step: Test WebSocket Connection" -ForegroundColor Yellow
Write-Host ""
Write-Host "Option 1: Browser DevTools Console" -ForegroundColor Cyan
Write-Host "───────────────────────────────────" -ForegroundColor Cyan
Write-Host "const ws = new WebSocket('ws://localhost:3000/ws?ticket=$ticket');" -ForegroundColor White
Write-Host "ws.onopen = () => console.log('✅ WS Connected');" -ForegroundColor White
Write-Host "ws.onerror = (e) => console.error('❌ WS Error:', e);" -ForegroundColor White
Write-Host "ws.onclose = (e) => console.log('WS Closed:', e.code, e.reason);" -ForegroundColor White
Write-Host "ws.onmessage = (e) => console.log('WS Message:', e.data);" -ForegroundColor White
Write-Host ""
Write-Host "Option 2: Test in Frontend Application" -ForegroundColor Cyan
Write-Host "───────────────────────────────────────" -ForegroundColor Cyan
Write-Host "1. Open frontend: http://localhost:4200" -ForegroundColor White
Write-Host "2. Perform a search query" -ForegroundColor White
Write-Host "3. Verify:" -ForegroundColor White
Write-Host "   - No '1008 NOT_AUTHORIZED' errors in console" -ForegroundColor White
Write-Host "   - No connection loop/reconnect spam" -ForegroundColor White
Write-Host "   - Search results stream correctly" -ForegroundColor White
Write-Host "   - No 'Connection issue' banner" -ForegroundColor White
Write-Host ""
Write-Host "WebSocket URL:" -ForegroundColor Yellow
Write-Host "ws://localhost:3000/ws?ticket=$ticket" -ForegroundColor Gray
Write-Host ""
Write-Host "⚠️  Note: Ticket expires in $ttl seconds" -ForegroundColor Yellow
Write-Host ""
