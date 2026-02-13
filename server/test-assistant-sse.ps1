# Test Assistant SSE Endpoint (PowerShell)
# Verifies SSE streaming with session cookie authentication

$ErrorActionPreference = "Stop"

$BASE_URL = "http://localhost:3000/api/v1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Assistant SSE Endpoint Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

try {
    # STEP 1: Get Bearer JWT token
    Write-Host "[1/4] Getting Bearer JWT token..." -ForegroundColor Yellow
    
    $tokenResponse = Invoke-RestMethod -Uri "$BASE_URL/auth/token" `
        -Method Post `
        -ContentType "application/json" `
        -Body '{}' `
        -ErrorAction Stop

    $token = $tokenResponse.token
    $sessionId = $tokenResponse.sessionId

    if (-not $token) {
        Write-Host "❌ Failed to get JWT token" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Got JWT token" -ForegroundColor Green
    Write-Host "   sessionId: $sessionId"
    Write-Host ""

    # STEP 2: Create session cookie
    Write-Host "[2/4] Creating session cookie..." -ForegroundColor Yellow
    
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    $sessionResponse = Invoke-WebRequest -Uri "$BASE_URL/auth/session" `
        -Method Post `
        -Headers $headers `
        -SessionVariable webSession `
        -ErrorAction Stop

    if ($sessionResponse.StatusCode -ne 200) {
        Write-Host "❌ Failed to create session cookie" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Session cookie created" -ForegroundColor Green
    Write-Host ""

    # STEP 3: Create a search request
    Write-Host "[3/4] Creating search request..." -ForegroundColor Yellow
    
    $searchBody = @{
        query = "best pizza in Tel Aviv"
        userLocation = @{
            lat = 32.0853
            lng = 34.7818
        }
    } | ConvertTo-Json

    $searchResponse = Invoke-RestMethod -Uri "$BASE_URL/search?mode=async" `
        -Method Post `
        -ContentType "application/json" `
        -Body $searchBody `
        -WebSession $webSession `
        -ErrorAction Stop

    $requestId = $searchResponse.requestId

    if (-not $requestId) {
        Write-Host "❌ Failed to create search request" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Search request created" -ForegroundColor Green
    Write-Host "   requestId: $requestId"
    Write-Host ""

    # Wait for search to complete
    Write-Host "⏳ Waiting 3 seconds for search to complete..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    Write-Host ""

    # STEP 4: Connect to SSE endpoint with cookie
    Write-Host "[4/4] Connecting to SSE endpoint with cookie only..." -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "SSE Stream Output:" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    # PowerShell doesn't have great SSE support - use Invoke-WebRequest with ReadAsStream
    $sseUrl = "$BASE_URL/stream/assistant/$requestId"
    
    # Get cookies for the request
    $cookieHeader = ""
    $cookies = $webSession.Cookies.GetCookies("$BASE_URL")
    foreach ($cookie in $cookies) {
        if ($cookieHeader) { $cookieHeader += "; " }
        $cookieHeader += "$($cookie.Name)=$($cookie.Value)"
    }

    $sseHeaders = @{
        "Cookie" = $cookieHeader
    }

    # Note: PowerShell's Invoke-WebRequest doesn't handle SSE streaming well
    # This will capture the full response after stream completes
    $sseResponse = Invoke-WebRequest -Uri $sseUrl `
        -Method Get `
        -Headers $sseHeaders `
        -TimeoutSec 10 `
        -ErrorAction Stop

    $sseOutput = $sseResponse.Content
    Write-Host $sseOutput
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    # Verify SSE events
    $hasMeta = $sseOutput -match "event: meta"
    $hasMessage = $sseOutput -match "event: message"
    $hasDone = $sseOutput -match "event: done"
    $hasError = $sseOutput -match "event: error"

    if ($hasMeta) {
        Write-Host "✅ Received 'meta' event" -ForegroundColor Green
    } else {
        Write-Host "⚠️  No 'meta' event received" -ForegroundColor Yellow
    }

    if ($hasMessage) {
        Write-Host "✅ Received 'message' event" -ForegroundColor Green
    } else {
        Write-Host "⚠️  No 'message' event received" -ForegroundColor Yellow
    }

    if ($hasDone) {
        Write-Host "✅ Received 'done' event" -ForegroundColor Green
    } else {
        Write-Host "⚠️  No 'done' event received" -ForegroundColor Yellow
    }

    if ($hasError) {
        Write-Host "⚠️  Received 'error' event (check server logs)" -ForegroundColor Yellow
    }

    Write-Host ""

    # Try to parse meta data
    if ($sseOutput -match 'event: meta\s+data: (.+)') {
        $metaJson = $Matches[1]
        Write-Host "📊 Meta event data:" -ForegroundColor Cyan
        Write-Host ($metaJson | ConvertFrom-Json | ConvertTo-Json)
        Write-Host ""
    }

    # Try to parse message data
    if ($sseOutput -match 'event: message\s+data: (.+)') {
        $messageJson = $Matches[1]
        Write-Host "💬 Message event data:" -ForegroundColor Cyan
        Write-Host ($messageJson | ConvertFrom-Json | ConvertTo-Json)
        Write-Host ""
    }

    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "✅ SSE Test Complete" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "  1. ✅ JWT token obtained"
    Write-Host "  2. ✅ Session cookie created"
    Write-Host "  3. ✅ Search request created (requestId: $($requestId.Substring(0,20))...)"
    Write-Host "  4. ✅ SSE stream connected with cookie authentication"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  - Check server logs for SSE events:"
    Write-Host "    • assistant_sse_started"
    Write-Host "    • assistant_sse_completed"
    Write-Host "  - Verify cookie authentication (no Bearer token required)"

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Red
    exit 1
}
