# Test Session Cookie Authentication (PowerShell)
# Tests creating and using HttpOnly session cookies

$ErrorActionPreference = "Stop"

$BASE_URL = "http://localhost:3000/api/v1"
$COOKIE_FILE = "./test-session-cookie.txt"

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "Session Cookie Auth Test" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Clean up old cookie file
if (Test-Path $COOKIE_FILE) {
    Remove-Item $COOKIE_FILE -Force
}

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
        Write-Host ($tokenResponse | ConvertTo-Json)
        exit 1
    }

    Write-Host "✅ Got JWT token" -ForegroundColor Green
    Write-Host "   sessionId: $sessionId"
    Write-Host ""

    # STEP 2: Create session cookie using Bearer JWT
    Write-Host "[2/4] Creating session cookie using Bearer JWT..." -ForegroundColor Yellow
    
    # Use WebRequest to capture cookies
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
        Write-Host $sessionResponse.Content
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
    Write-Host "   Domain: $($sessionCookie.Domain)"
    Write-Host "   Path: $($sessionCookie.Path)"
    Write-Host "   HttpOnly: $($sessionCookie.HttpOnly)"
    Write-Host "   Secure: $($sessionCookie.Secure)"
    Write-Host "   Expires: $($sessionCookie.Expires)"
    Write-Host ""

    # STEP 3: Test protected endpoint with session cookie (NO Bearer token)
    Write-Host "[3/4] Calling protected endpoint with session cookie only..." -ForegroundColor Yellow
    
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
        Write-Host "❌ Failed to call protected endpoint with cookie (HTTP $($searchResponse.StatusCode))" -ForegroundColor Red
        Write-Host $searchResponse.Content
        exit 1
    }

    $searchResult = $searchResponse.Content | ConvertFrom-Json
    Write-Host "✅ Protected endpoint called successfully with session cookie" -ForegroundColor Green
    Write-Host "   Result count: $($searchResult.results.Count)"
    Write-Host ""

    # STEP 4: Verify Bearer JWT still works
    Write-Host "[4/4] Verifying Bearer JWT still works..." -ForegroundColor Yellow
    
    $jwtHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }

    $searchBody2 = @{
        query = "sushi in Tel Aviv"
        userLocation = @{
            lat = 32.0853
            lng = 34.7818
        }
    } | ConvertTo-Json

    $jwtResponse = Invoke-WebRequest -Uri "$BASE_URL/search?mode=sync" `
        -Method Post `
        -Headers $jwtHeaders `
        -Body $searchBody2 `
        -ErrorAction Stop

    if ($jwtResponse.StatusCode -ne 200) {
        Write-Host "❌ Bearer JWT no longer works (HTTP $($jwtResponse.StatusCode))" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Bearer JWT still works" -ForegroundColor Green
    Write-Host ""

    Write-Host "===================================" -ForegroundColor Cyan
    Write-Host "✅ All tests passed!" -ForegroundColor Green
    Write-Host "===================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "  1. ✅ JWT token generation works"
    Write-Host "  2. ✅ Session cookie creation works (POST /auth/session)"
    Write-Host "  3. ✅ Protected endpoint accepts session cookie"
    Write-Host "  4. ✅ Bearer JWT remains valid (dual auth)"

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Red
    exit 1
}
