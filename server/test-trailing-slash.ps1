# PowerShell test script to verify /result and /result/ return identical responses
# Usage: .\test-trailing-slash.ps1 -RequestId "test-req-123"

param(
    [string]$RequestId = "test-req-123",
    [string]$BaseUrl = "http://localhost:3000/api/v1/search"
)

Write-Host "Testing trailing slash behavior for: $RequestId" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# Test without trailing slash
Write-Host "`n1. Testing WITHOUT trailing slash: $BaseUrl/$RequestId/result" -ForegroundColor Yellow
try {
    $response1 = Invoke-WebRequest -Uri "$BaseUrl/$RequestId/result" -Method GET -UseBasicParsing -ErrorAction Stop
    $status1 = $response1.StatusCode
    $body1 = $response1.Content
    Write-Host "   HTTP Status: $status1" -ForegroundColor Green
    Write-Host "   Body: $body1"
} catch {
    $status1 = $_.Exception.Response.StatusCode.value__
    $body1 = $_.ErrorDetails.Message
    Write-Host "   HTTP Status: $status1" -ForegroundColor Yellow
    Write-Host "   Body: $body1"
}

# Test with trailing slash
Write-Host "`n2. Testing WITH trailing slash: $BaseUrl/$RequestId/result/" -ForegroundColor Yellow
try {
    $response2 = Invoke-WebRequest -Uri "$BaseUrl/$RequestId/result/" -Method GET -UseBasicParsing -ErrorAction Stop
    $status2 = $response2.StatusCode
    $body2 = $response2.Content
    Write-Host "   HTTP Status: $status2" -ForegroundColor Green
    Write-Host "   Body: $body2"
} catch {
    $status2 = $_.Exception.Response.StatusCode.value__
    $body2 = $_.ErrorDetails.Message
    Write-Host "   HTTP Status: $status2" -ForegroundColor Yellow
    Write-Host "   Body: $body2"
}

# Compare responses
Write-Host "`n3. Comparison:" -ForegroundColor Yellow
if ($status1 -eq $status2) {
    Write-Host "   ✅ HTTP Status codes match: $status1" -ForegroundColor Green
} else {
    Write-Host "   ❌ HTTP Status codes differ: $status1 vs $status2" -ForegroundColor Red
    exit 1
}

if ($body1 -eq $body2) {
    Write-Host "   ✅ Response bodies match" -ForegroundColor Green
} else {
    Write-Host "   ❌ Response bodies differ" -ForegroundColor Red
    Write-Host "   Body1: $body1" -ForegroundColor Red
    Write-Host "   Body2: $body2" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ SUCCESS: Both routes return identical responses (no redirect)" -ForegroundColor Green
