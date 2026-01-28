# Async Job Store Smoke Test

## Quick Test Sequence

### 1. POST - Create Async Search Job
```bash
curl -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{
    "query": "pizza in tel aviv",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'
```

**Expected Response (HTTP 202):**
```json
{
  "requestId": "req-1234567890-abc123"
}
```

**Save the requestId for subsequent requests!**

---

### 2. GET - Check Job Status
```bash
# Replace <requestId> with the value from step 1
curl http://localhost:3000/api/v1/search/<requestId>
```

**Expected Response (HTTP 200) - While Running:**
```json
{
  "requestId": "req-1234567890-abc123",
  "status": "RUNNING",
  "progress": 50
}
```

**Expected Response (HTTP 200) - When Done:**
```json
{
  "requestId": "req-1234567890-abc123",
  "status": "DONE",
  "progress": 100
}
```

**Expected Response (HTTP 404) - If Unknown:**
```json
{
  "code": "NOT_FOUND",
  "message": "Job not found or expired",
  "requestId": "req-invalid"
}
```

---

### 3. GET - Fetch Result (Immediate - Should be Pending)
```bash
# Try immediately after POST (within 1 second)
curl http://localhost:3000/api/v1/search/<requestId>/result
```

**Expected Response (HTTP 202):**
```json
{
  "requestId": "req-1234567890-abc123",
  "status": "RUNNING",
  "progress": 0
}
```

---

### 4. GET - Fetch Result (After Completion)
```bash
# Wait 5-10 seconds, then retry
curl http://localhost:3000/api/v1/search/<requestId>/result
```

**Expected Response (HTTP 200):**
```json
{
  "requestId": "req-1234567890-abc123",
  "sessionId": "session-...",
  "query": {
    "original": "pizza in tel aviv",
    "parsed": {},
    "language": "en"
  },
  "results": [
    {
      "id": "...",
      "placeId": "...",
      "name": "Pizza Place",
      "address": "123 Tel Aviv St",
      "rating": 4.5
    }
  ],
  "chips": [],
  "meta": {
    "tookMs": 5234,
    "mode": "search",
    "confidence": 0.9
  }
}
```

---

## WebSocket Events

### How to Verify WS Events

**1. Check Server Logs:**

Look for these log lines after POST:
```
[JobStore] Job created { requestId: 'req-...', status: 'PENDING' }
[JobStore] Status updated { requestId: 'req-...', status: 'RUNNING', progress: 0 }
websocket_published { channel: 'search', requestId: 'req-...', clientCount: 1 }
[JobStore] Status updated { requestId: 'req-...', status: 'RUNNING', progress: 50 }
websocket_published { channel: 'search', requestId: 'req-...', clientCount: 1 }
[JobStore] Status updated { requestId: 'req-...', status: 'RUNNING', progress: 90 }
websocket_published { channel: 'search', requestId: 'req-...', clientCount: 1 }
[JobStore] Result stored { requestId: 'req-...', hasResult: true }
[JobStore] Status updated { requestId: 'req-...', status: 'DONE', progress: 100 }
websocket_published { channel: 'search', requestId: 'req-...', clientCount: 1 }
```

**2. WebSocket Event Payloads:**

### Event 1: search_progress (0%)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "progress",
  "requestId": "req-1234567890-abc123",
  "ts": "2026-01-17T15:30:00.000Z",
  "stage": "accepted",
  "status": "running",
  "progress": 0,
  "message": "Search started"
}
```

### Event 2: search_progress (50%)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "progress",
  "requestId": "req-1234567890-abc123",
  "ts": "2026-01-17T15:30:02.000Z",
  "stage": "route_llm",
  "status": "running",
  "progress": 50,
  "message": "Processing search"
}
```

### Event 3: search_progress (90%)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "progress",
  "requestId": "req-1234567890-abc123",
  "ts": "2026-01-17T15:30:05.000Z",
  "stage": "google",
  "status": "running",
  "progress": 90,
  "message": "Finalizing results"
}
```

### Event 4: search_done
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "ready",
  "requestId": "req-1234567890-abc123",
  "ts": "2026-01-17T15:30:06.000Z",
  "stage": "done",
  "ready": "results",
  "decision": "CONTINUE",
  "resultCount": 20
}
```

### Event 5: search_failed (on error)
```json
{
  "channel": "search",
  "contractsVersion": "search_contracts_v1",
  "type": "error",
  "requestId": "req-1234567890-abc123",
  "ts": "2026-01-17T15:30:06.000Z",
  "stage": "done",
  "code": "SEARCH_FAILED",
  "message": "Pipeline error: LLM timeout"
}
```

---

## Complete Test Flow

```bash
#!/bin/bash
# Save as: test-async-job.sh

echo "=== STEP 1: POST async search ==="
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/search?mode=async \
  -H "Content-Type: application/json" \
  -d '{"query":"pizza in tel aviv","userLocation":{"lat":32.0853,"lng":34.7818}}')

echo $RESPONSE | jq .

REQUEST_ID=$(echo $RESPONSE | jq -r .requestId)
echo "RequestId: $REQUEST_ID"

echo -e "\n=== STEP 2: GET status (immediate) ==="
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID | jq .

echo -e "\n=== STEP 3: GET result (should be 202 pending) ==="
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID/result | jq .

echo -e "\n=== STEP 4: Wait 7 seconds... ==="
sleep 7

echo -e "\n=== STEP 5: GET status (should be done) ==="
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID | jq .

echo -e "\n=== STEP 6: GET result (should be 200 with data) ==="
curl -s http://localhost:3000/api/v1/search/$REQUEST_ID/result | jq '{requestId, resultCount: (.results | length)}'
```

**Run with:**
```bash
chmod +x test-async-job.sh
./test-async-job.sh
```

---

## PowerShell Version

```powershell
# Test async job flow
$body = @{
    query = "pizza in tel aviv"
    userLocation = @{
        lat = 32.0853
        lng = 34.7818
    }
} | ConvertTo-Json

Write-Host "=== POST async search ===" -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search?mode=async" `
  -Method POST -ContentType "application/json" -Body $body

$requestId = $response.requestId
Write-Host "RequestId: $requestId" -ForegroundColor Yellow

Write-Host "`n=== GET status (immediate) ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search/$requestId" | ConvertTo-Json

Write-Host "`n=== GET result (pending) ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search/$requestId/result" | ConvertTo-Json

Write-Host "`nWaiting 7 seconds..." -ForegroundColor Cyan
Start-Sleep -Seconds 7

Write-Host "`n=== GET status (done) ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search/$requestId" | ConvertTo-Json

Write-Host "`n=== GET result (complete) ===" -ForegroundColor Cyan
$final = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search/$requestId/result"
Write-Host "Results: $($final.results.Count)" -ForegroundColor Green
```

---

## Expected Timeline

| Time | Event | HTTP Status | Progress |
|------|-------|-------------|----------|
| T+0s | POST → 202 | 202 | - |
| T+0s | WS: search_progress | - | 0% |
| T+1s | GET /:requestId → RUNNING | 200 | 0-50% |
| T+1s | WS: search_progress | - | 50% |
| T+3s | GET /:requestId/result → 202 | 202 | 50-90% |
| T+5s | WS: search_progress | - | 90% |
| T+6s | WS: search_done | - | 100% |
| T+7s | GET /:requestId → DONE | 200 | 100% |
| T+7s | GET /:requestId/result → 200 | 200 | - |
