# ⚡ Quick Start Verification - 5 Minutes

Run this to verify the P0 security fix works end-to-end.

---

## 🚀 Start Servers (2 terminals)

```bash
# Terminal 1: Backend
cd server
npm run dev

# Terminal 2: Frontend
cd llm-angular
npm start
```

Wait for: "Angular Live Development Server is listening..."

---

## 🔍 Verify (3 minutes)

### 1. Open App

```
http://localhost:4200
```

### 2. Search

Type: `pizza tel aviv`

### 3. Open DevTools

Press `F12` or `Cmd+Opt+I`

### 4. Check Network Tab

Click **Network** → Filter: **Img**

#### ✅ PASS: See this
```
✅ localhost:3000/api/v1/photos/places/ChIJ.../photos/...
✅ localhost:3000/api/v1/photos/places/ChIJ.../photos/...
```

#### ❌ FAIL: If you see this
```
❌ places.googleapis.com/...?key=AIza...
❌ Any URL with "key=" parameter
```

### 5. Check Response Body

Network → **XHR** → Click `/api/v1/search` → **Response** tab

Press `Cmd+F` / `Ctrl+F` → Search for: `key=`

#### ✅ PASS
```
✅ No matches found
```

#### ❌ FAIL
```
❌ If "key=" is found anywhere
```

---

## 📊 Quick Test Results

If all checks pass:

```
✅ Backend: Sanitizing responses correctly
✅ Frontend: Using secure photo proxy
✅ Network: No API key exposure
✅ Security: P0 fix working!
```

If any check fails:

```
❌ Check backend logs: tail -f server/logs/server.log
❌ Check frontend console: DevTools → Console
❌ See full docs: docs/P0_COMPLETE_SUMMARY.md
```

---

## 🧪 Run Tests (Optional)

```bash
# Backend tests
cd server && npm run test:security

# Frontend tests
cd llm-angular && npm test -- photo-src.util.spec

# Expected: All passing ✅
```

---

## 📚 Full Documentation

- **Backend**: `server/P0_IMPLEMENTATION_COMPLETE.md`
- **Frontend**: `llm-angular/FRONTEND_CHANGES_SUMMARY.md`
- **Complete**: `P0_COMPLETE_SUMMARY.md`

---

## ✅ Done!

If verification passed:
1. Frontend is ready to deploy
2. Backend already deployed
3. No API keys exposed

**Status**: Ready for production 🚀
