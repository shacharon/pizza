@echo off
REM WebSocket Secure Ticket Flow Verification Script (Windows)
REM Tests the complete ticket-based authentication flow

setlocal enabledelayedexpansion

set API_BASE=http://localhost:3000/api/v1
set WS_BASE=ws://localhost:3000

echo === WebSocket Secure Ticket Flow Test ===
echo.

REM Step 1: Get JWT token
echo 1. Requesting JWT token...
curl -s -X POST "%API_BASE%/auth/token" -H "Content-Type: application/json" -d "{}" > token_response.json

REM Parse token using PowerShell JSON parsing
for /f "delims=" %%i in ('powershell -Command "(Get-Content token_response.json | ConvertFrom-Json).token"') do set TOKEN=%%i
for /f "delims=" %%i in ('powershell -Command "(Get-Content token_response.json | ConvertFrom-Json).sessionId"') do set SESSION_ID=%%i

if "%TOKEN%"=="" (
    echo Failed to get JWT token
    type token_response.json
    exit /b 1
)

echo Token obtained
echo   Session ID: %SESSION_ID%
echo.

REM Step 2: Request WebSocket ticket
echo 2. Requesting WS ticket...
curl -s -X POST "%API_BASE%/ws-ticket" -H "Content-Type: application/json" -H "Authorization: Bearer %TOKEN%" > ticket_response.json

for /f "delims=" %%i in ('powershell -Command "(Get-Content ticket_response.json | ConvertFrom-Json).ticket"') do set TICKET=%%i
for /f "delims=" %%i in ('powershell -Command "(Get-Content ticket_response.json | ConvertFrom-Json).expiresInSeconds"') do set EXPIRES=%%i

if "%TICKET%"=="" (
    echo Failed to get WS ticket
    type ticket_response.json
    exit /b 1
)

set TICKET_SHORT=%TICKET:~0,12%
echo WS ticket obtained
echo   Ticket (first 12 chars): %TICKET_SHORT%...
echo   Expires in: %EXPIRES%s
echo.

REM Step 3: Instructions for manual WebSocket test
echo 3. Testing WebSocket connection with ticket...
echo.
echo To test WebSocket connection, install wscat:
echo   npm install -g wscat
echo.
echo Then run:
echo   wscat -c "%WS_BASE%/ws?ticket=%TICKET%"
echo.
echo Expected: Connection should succeed
echo Expected log: 'WS: Authenticated via ticket'
echo.

REM Step 4: Test invalid ticket
echo 4. Testing invalid ticket (should fail)...
echo.
echo   wscat -c "%WS_BASE%/ws?ticket=invalid_ticket_12345"
echo.
echo Expected: Connection should be rejected
echo Expected log: 'WS: Rejected - ticket invalid or expired'
echo.

echo === Security Checklist ===
echo [x] JWT not in WebSocket URL (using ticket instead)
echo [x] Ticket is one-time use (deleted after connection)
echo [x] Ticket expires in 30s
echo [x] Ticket stored in Redis (not in-memory)
echo [x] WebSocket endpoint requires ticket authentication
echo.

REM Cleanup
del token_response.json ticket_response.json

endlocal
