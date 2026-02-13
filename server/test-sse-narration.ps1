# Quick SSE Test - Narration Template + Summary Flow
# Shows: meta -> message(narration) -> message(summary) -> done

$ErrorActionPreference = "Stop"
$BASE_URL = "http://localhost:3000/api/v1"

Write-Host "=== SSE Narration Template + Summary Test ===" -ForegroundColor Cyan
Write-Host ""

try {
    # 1. Get JWT token
    Write-Host "[1/5] Getting JWT token..." -ForegroundColor Yellow
    $tokenResp = Invoke-RestMethod -Uri "$BASE_URL/auth/token" `
        -Method Post `
        -ContentType "application/json" `
        -Body '{}'
    $token = $tokenResp.token
    Write-Host "✅ Token: $($token.Substring(0,20))..." -ForegroundColor Green
    Write-Host ""

    # 2. Get session cookie
    Write-Host "[2/5] Creating session cookie..." -ForegroundColor Yellow
    $sessionResp = Invoke-WebRequest -Uri "$BASE_URL/auth/session" `
        -Method Post `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -SessionVariable webSession
    Write-Host "✅ Cookie created" -ForegroundColor Green
    Write-Host ""

    # 3. Create async search
    Write-Host "[3/5] Creating async search..." -ForegroundColor Yellow
    $searchBody = @{
        query = "best pizza in Tel Aviv"
        userLocation = @{ lat = 32.0853; lng = 34.7818 }
    } | ConvertTo-Json
    
    $searchResp = Invoke-RestMethod -Uri "$BASE_URL/search?mode=async" `
        -Method Post `
        -ContentType "application/json" `
        -Body $searchBody `
        -WebSession $webSession
    
    $requestId = $searchResp.requestId
    Write-Host "✅ Search created: $requestId" -ForegroundColor Green
    Write-Host ""

    # 4. Connect to SSE (NO wait - should get narration immediately)
    Write-Host "[4/5] Connecting to SSE (expecting narration immediately)..." -ForegroundColor Yellow
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    # Get cookies for the request
    $cookieHeader = ""
    $cookies = $webSession.Cookies.GetCookies($BASE_URL)
    foreach ($cookie in $cookies) {
        if ($cookieHeader) { $cookieHeader += "; " }
        $cookieHeader += "$($cookie.Name)=$($cookie.Value)"
    }

    $sseUrl = "$BASE_URL/stream/assistant/$requestId"
    $sseHeaders = @{ "Cookie" = $cookieHeader }

    # Note: PowerShell doesn't stream SSE well, but this captures the full output
    $sseResp = Invoke-WebRequest -Uri $sseUrl `
        -Method Get `
        -Headers $sseHeaders `
        -TimeoutSec 25

    $sseOutput = $sseResp.Content
    Write-Host $sseOutput -ForegroundColor White
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    # 5. Analyze events
    Write-Host "[5/5] Analyzing SSE events..." -ForegroundColor Yellow
    
    $hasMeta = $sseOutput -match "event: meta"
    $messages = [regex]::Matches($sseOutput, "event: message")
    $hasDone = $sseOutput -match "event: done"
    
    if ($hasMeta) {
        Write-Host "✅ Received 'meta' event" -ForegroundColor Green
    } else {
        Write-Host "❌ No 'meta' event" -ForegroundColor Red
    }

    if ($messages.Count -ge 1) {
        Write-Host "✅ Received $($messages.Count) 'message' event(s)" -ForegroundColor Green
        
        # Try to extract messages
        $allMessages = [regex]::Matches($sseOutput, "event: message\s+data: ({.+?})")
        
        for ($i = 0; $i -lt $allMessages.Count; $i++) {
            $msgJson = $allMessages[$i].Groups[1].Value
            try {
                $msg = $msgJson | ConvertFrom-Json
                Write-Host ""
                Write-Host "  Message $($i+1):" -ForegroundColor Cyan
                Write-Host "    type: $($msg.type)" -ForegroundColor White
                Write-Host "    message: $($msg.message.Substring(0, [Math]::Min(60, $msg.message.Length)))..." -ForegroundColor White
                Write-Host "    language: $($msg.language)" -ForegroundColor White
                Write-Host "    blocksSearch: $($msg.blocksSearch)" -ForegroundColor White
                
                if ($i -eq 0 -and $msg.type -eq "GENERIC_QUERY_NARRATION") {
                    Write-Host "    ℹ️  First message is narration template (no LLM)" -ForegroundColor Yellow
                }
                if ($i -eq 1 -and $msg.type -eq "SUMMARY") {
                    Write-Host "    ℹ️  Second message is SUMMARY (with LLM)" -ForegroundColor Yellow
                }
            } catch {
                Write-Host "  (Could not parse message $($i+1))" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ No 'message' events" -ForegroundColor Red
    }

    if ($hasDone) {
        Write-Host ""
        Write-Host "✅ Received 'done' event" -ForegroundColor Green
    } else {
        Write-Host "❌ No 'done' event" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "=== Test Complete ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Expected flow:" -ForegroundColor Yellow
    Write-Host "  1. meta (requestId, language, startedAt)" -ForegroundColor White
    Write-Host "  2. message (GENERIC_QUERY_NARRATION - narration template, NO LLM)" -ForegroundColor White
    Write-Host "  3. message (SUMMARY - with LLM, after results ready)" -ForegroundColor White
    Write-Host "  4. done" -ForegroundColor White
    Write-Host ""
    Write-Host "Check server logs for:" -ForegroundColor Yellow
    Write-Host "  • assistant_sse_started" -ForegroundColor White
    Write-Host "  • assistant_sse_narration_sent" -ForegroundColor White
    Write-Host "  • assistant_sse_summary_sent" -ForegroundColor White
    Write-Host "  • assistant_sse_completed" -ForegroundColor White

} catch {
    Write-Host ""
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
