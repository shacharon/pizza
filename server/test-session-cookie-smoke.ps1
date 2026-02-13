# Session Cookie Authentication - Comprehensive Smoke Tests (PowerShell)
# Tests all scenarios: issuance, usage, expiry, precedence

$ErrorActionPreference = "Stop"

$BASE_URL = "http://localhost:3000/api/v1"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Session Cookie Auth - Comprehensive Smoke Tests" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

try {
    # =================================================================
    # TEST A: Issue Cookie Using Bearer JWT
    # =================================================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "TEST A: Issue Cookie Using Bearer JWT" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "[A1] Getting Bearer JWT token..." -ForegroundColor Yellow
    
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

    Write-Host "[A2] Creating session cookie using Bearer JWT..." -ForegroundColor Yellow
    
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    $sessionResponse = Invoke-WebRequest -Uri "$BASE_URL/auth/session" `
        -Method Post `
        -Headers $headers `
        -SessionVariable webSession `
        -ErrorAction Stop

    if ($sessionResponse.StatusCode -ne 200) {
        Write-Host "❌ Failed to create session cookie (HTTP $($sessionResponse.StatusCode))" -ForegroundColor Red
        exit 1
    }

    $body = $sessionResponse.Content | ConvertFrom-Json
    Write-Host "✅ Session cookie created" -ForegroundColor Green
    Write-Host ($body | ConvertTo-Json)
    Write-Host ""

    # Verify cookie was set
    $sessionCookie = $webSession.Cookies.GetCookies("$BASE_URL") | Where-Object { $_.Name -eq "session" }
    
    if (-not $sessionCookie) {
        Write-Host "❌ Session cookie not found in response" -ForegroundColor Red
        exit 1
    }

    Write-Host "🍪 Session cookie details:" -ForegroundColor Cyan
    Write-Host "   Name: $($sessionCookie.Name)"
    Write-Host "   HttpOnly: $($sessionCookie.HttpOnly)"
    Write-Host "   Secure: $($sessionCookie.Secure)"
    Write-Host ""

    # =================================================================
    # TEST B: Use Cookie-Only on Protected Endpoint
    # =================================================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "TEST B: Use Cookie-Only on Protected Endpoint" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "[B1] Calling /whoami with cookie only (no Bearer token)..." -ForegroundColor Yellow
    
    $whoamiResponse = Invoke-WebRequest -Uri "$BASE_URL/auth/whoami" `
        -Method Get `
        -WebSession $webSession `
        -ErrorAction Stop

    if ($whoamiResponse.StatusCode -ne 200) {
        Write-Host "❌ Failed to authenticate with cookie (HTTP $($whoamiResponse.StatusCode))" -ForegroundColor Red
        exit 1
    }

    $whoami = $whoamiResponse.Content | ConvertFrom-Json

    if ($whoami.authSource -ne "cookie") {
        Write-Host "❌ Expected authSource='cookie', got '$($whoami.authSource)'" -ForegroundColor Red
        exit 1
    }

    if (-not $whoami.hasCookieHeader) {
        Write-Host "❌ Expected hasCookieHeader=true" -ForegroundColor Red
        exit 1
    }

    if ($whoami.hasBearerHeader) {
        Write-Host "❌ Expected hasBearerHeader=false" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Authenticated with cookie only" -ForegroundColor Green
    Write-Host "   authSource: $($whoami.authSource)"
    Write-Host "   hasCookieHeader: $($whoami.hasCookieHeader)"
    Write-Host "   hasBearerHeader: $($whoami.hasBearerHeader)"
    Write-Host ""

    Write-Host "[B2] Calling /search with cookie only..." -ForegroundColor Yellow
    
    $searchBody = @{
        query = "pizza in Tel Aviv"
        userLocation = @{
            lat = 32.0853
            lng = 34.7818
        }
    } | ConvertTo-Json

    $searchResponse = Invoke-WebRequest -Uri "$BASE_URL/search?mode=sync" `
        -Method Post `
        -ContentType "application/json" `
        -Body $searchBody `
        -WebSession $webSession `
        -ErrorAction Stop

    if ($searchResponse.StatusCode -ne 200) {
        Write-Host "❌ Failed to call /search with cookie (HTTP $($searchResponse.StatusCode))" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Protected /search endpoint works with cookie" -ForegroundColor Green
    Write-Host ""

    # =================================================================
    # TEST D: Precedence Test (Cookie First, Then JWT)
    # =================================================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "TEST D: Precedence Test (Cookie > Bearer JWT)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""

    Write-Host "[D1] Calling /whoami with BOTH cookie and Bearer token..." -ForegroundColor Yellow
    
    $bothHeaders = @{
        "Authorization" = "Bearer $token"
    }
    
    $bothResponse = Invoke-WebRequest -Uri "$BASE_URL/auth/whoami" `
        -Method Get `
        -Headers $bothHeaders `
        -WebSession $webSession `
        -ErrorAction Stop

    if ($bothResponse.StatusCode -ne 200) {
        Write-Host "❌ Failed with both auth methods (HTTP $($bothResponse.StatusCode))" -ForegroundColor Red
        exit 1
    }

    $both = $bothResponse.Content | ConvertFrom-Json

    if ($both.authSource -ne "cookie") {
        Write-Host "❌ Expected authSource='cookie' (precedence), got '$($both.authSource)'" -ForegroundColor Red
        exit 1
    }

    if (-not $both.hasCookieHeader -or -not $both.hasBearerHeader) {
        Write-Host "❌ Expected both headers present" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Cookie takes precedence over Bearer JWT" -ForegroundColor Green
    Write-Host "   authSource: $($both.authSource) (cookie used, not Bearer)"
    Write-Host "   hasCookieHeader: $($both.hasCookieHeader)"
    Write-Host "   hasBearerHeader: $($both.hasBearerHeader)"
    Write-Host ""

    Write-Host "[D2] Testing JWT fallback (invalid cookie + valid Bearer)..." -ForegroundColor Yellow
    
    # Create new session with corrupted cookie
    $badCookieContainer = New-Object System.Net.CookieContainer
    $badCookie = New-Object System.Net.Cookie
    $badCookie.Name = "session"
    $badCookie.Value = "INVALID_TOKEN"
    $badCookie.Domain = "localhost"
    $badCookie.Path = "/"
    $badCookieContainer.Add($badCookie)
    
    $badSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $badSession.Cookies = $badCookieContainer
    
    $fallbackHeaders = @{
        "Authorization" = "Bearer $token"
    }
    
    $fallbackResponse = Invoke-WebRequest -Uri "$BASE_URL/auth/whoami" `
        -Method Get `
        -Headers $fallbackHeaders `
        -WebSession $badSession `
        -ErrorAction Stop

    if ($fallbackResponse.StatusCode -ne 200) {
        Write-Host "❌ JWT fallback failed (HTTP $($fallbackResponse.StatusCode))" -ForegroundColor Red
        exit 1
    }

    $fallback = $fallbackResponse.Content | ConvertFrom-Json

    if ($fallback.authSource -ne "bearer") {
        Write-Host "❌ Expected authSource='bearer' (fallback), got '$($fallback.authSource)'" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ JWT fallback works (invalid cookie → Bearer JWT)" -ForegroundColor Green
    Write-Host "   authSource: $($fallback.authSource)"
    Write-Host ""

    # =================================================================
    # TEST C: Expiry Test (Note)
    # =================================================================
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "TEST C: Cookie Expiry (Note)" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "⚠️  Expiry test requires:" -ForegroundColor Yellow
    Write-Host "    1. Update .env: SESSION_COOKIE_TTL_SECONDS=60"
    Write-Host "    2. Restart server"
    Write-Host "    3. Issue cookie"
    Write-Host "    4. Wait >60s"
    Write-Host "    5. Test with expired cookie → expect 401"
    Write-Host ""
    Write-Host "For automated expiry test, see docs/auth-session-cookie.md"
    Write-Host ""

    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "✅ All Smoke Tests Passed!" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "  ✅ TEST A: Cookie issuance works"
    Write-Host "  ✅ TEST B: Cookie-only auth works on protected endpoints"
    Write-Host "  ✅ TEST D: Cookie takes precedence over Bearer JWT"
    Write-Host "  ✅ TEST D: JWT fallback works with invalid cookie"
    Write-Host "  ⚠️  TEST C: Expiry test (manual, see docs)"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  - Check server logs for session_cookie_issued/auth_ok events"
    Write-Host "  - Run manual expiry test (see docs/auth-session-cookie.md)"
    Write-Host "  - Test cross-origin with Angular frontend"

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Red
    exit 1
}
