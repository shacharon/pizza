# Smoke Test - Phase 4+5 (Hebrew)

## 1️⃣ בדיקת Async Mode - HTTP

### פקודה:
```powershell
# Test 1: Async mode (fast response)
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search?mode=async" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"query":"pizza in tel aviv"}' | ConvertTo-Json -Depth 5
```

### מה אמור לקרות:
- ✅ Response מגיע **מיד** (< 1 שניה)
- ✅ יש `requestId` בתשובה
- ✅ יש `results` (רשימת מסעדות)
- ✅ יש `chips` (פילטרים)
- ✅ **אין** `assist` (כי זה async)
- ✅ **אין** `proposedActions` (כי זה async)

### Response לדוגמה:
```json
{
  "requestId": "req-1768074123456-abc123",
  "sessionId": "...",
  "query": {
    "original": "pizza in tel aviv",
    "language": "en"
  },
  "results": [...],
  "chips": [...],
  "meta": { "tookMs": 850 }
}
```

---

## 2️⃣ בדיקת WebSocket Streaming

### התקנת wscat (אם אין):
```powershell
npm install -g wscat
```

### חיבור ל-WebSocket:
```powershell
wscat -c ws://localhost:3000/ws
```

### שליחת subscribe (העתק את requestId מהשלב הקודם):
```json
{"type":"subscribe","requestId":"req-1768074123456-abc123"}
```

### מה אמור לקרות:
```
1. → {"type":"status","requestId":"...","status":"streaming"}
2. → {"type":"stream.delta","requestId":"...","text":"Found "}
3. → {"type":"stream.delta","requestId":"...","text":"10 "}
4. → {"type":"stream.delta","requestId":"...","text":"great "}
5. → {"type":"stream.delta","requestId":"...","text":"pizza places"}
6. → {"type":"stream.done","requestId":"...","fullText":"Found 10 great pizza places..."}
7. → {"type":"recommendation","requestId":"...","actions":[...]}
8. → {"type":"status","requestId":"...","status":"completed"}
```

---

## 3️⃣ השוואה: Sync vs Async

### Sync Mode (ברירת מחדל - backward compatible):
```powershell
# Takes 4-6 seconds
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"query":"pizza in tel aviv"}'
```

**Response includes**:
- ✅ `assist` (הודעת עזר מ-LLM)
- ✅ `proposedActions` (המלצות)
- ⏱️ לוקח 4-6 שניות (כולל LLM)

### Async Mode (חדש):
```powershell
# Takes < 1 second
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/search?mode=async" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"query":"pizza in tel aviv"}'
```

**Response includes**:
- ✅ `requestId` (לחיבור WS)
- ✅ `results` (מיד!)
- ❌ **NO** `assist` (יגיע דרך WS)
- ⏱️ לוקח < 1 שניה

---

## 4️⃣ בדיקת Late-Subscriber Replay

### תרחיש:
1. שלח async request → קבל requestId
2. **המתן 5 שניות** (תן לassistant לסיים)
3. התחבר ל-WS **רק עכשיו**
4. שלח subscribe עם אותו requestId

### מה אמור לקרות:
- ✅ מקבל **מיד** את כל המסרים (cached):
  - status: "completed"
  - stream.done עם הטקסט המלא
  - recommendation עם כל הפעולות

---

## 5️⃣ בדיקת Production Origin Check

### בדיקה:
```powershell
# Set NODE_ENV to production (temporarily)
$env:NODE_ENV = "production"
npm run dev
```

### מה אמור לקרות:
- ❌ אם `WS_ALLOWED_ORIGINS` לא מוגדר → **שגיאה בלוג**
- ❌ אם `WS_ALLOWED_ORIGINS=*` → **שגיאה בלוג**
- ✅ חיבורי WS נדחים

### Log צפוי:
```
[ERROR] SECURITY: WebSocket allowedOrigins must be explicitly set in production (not *)
```

---

## ✅ Checklist

- [ ] Async endpoint returns requestId + results < 1s
- [ ] WebSocket connects successfully
- [ ] Subscribe sends messages in correct order
- [ ] stream.delta chunks arrive
- [ ] stream.done + recommendation arrive
- [ ] status changes: pending → streaming → completed
- [ ] Late subscriber receives cached state
- [ ] Production mode rejects wildcard origins
- [ ] Sync mode still works (backward compatible)

---

## 🐛 Troubleshooting

### Server לא עולה?
```powershell
# Check logs
Get-Content server\logs\server.log -Tail 50

# Check if port 3000 is already in use
netstat -ano | findstr :3000
```

### WebSocket לא מתחבר?
```powershell
# Test with curl first
curl http://localhost:3000/health
```

### לא מקבל messages?
- ודא ש-requestId תואם
- ודא שה-assistant job הסתיים (check logs)
- בדוק שה-state store לא expired (TTL: 5 דקות)
