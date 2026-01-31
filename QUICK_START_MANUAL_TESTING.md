# Quick Start - Manual Testing Guide

## 🚀 Start Servers

### Terminal 1: Backend

```bash
cd c:\dev\piza\angular-piza\server
npm run dev
```

Wait for: `Server running on port 3000`

### Terminal 2: Frontend

```bash
cd c:\dev\piza\angular-piza\llm-angular
npm run dev
```

Wait for: `Application bundle generation complete`

### Browser

Open: `http://localhost:4200`

---

## 🧪 Test Scenarios (5 minutes)

### Test 1: Debug Panel Visible ✅

**Expected:**
- Fixed panel in bottom-right corner
- Green text on black background
- Shows: UI / Assistant / Search languages

### Test 2: Hebrew UI → Paris

**Steps:**
1. Set UI to Hebrew (if not default)
2. Search: `מסעדות איטלקיות בפריז`
3. Check debug panel

**Expected:**
- UI: `he`
- Assistant: `he`
- Search: `en` (FR region policy)
- Assistant message in Hebrew

### Test 3: English UI → Tel Aviv

**Steps:**
1. Set UI to English
2. Search: `Italian restaurants in Tel Aviv`
3. Check debug panel

**Expected:**
- UI: `en`
- Assistant: `en`
- Search: `he` (IL region policy)
- Assistant message in English

### Test 4: Cache Test (Same Results)

**Steps:**
1. Search `pizza Tel Aviv` with UI=Hebrew
2. Open DevTools → Network → Note placeIds in response
3. Change UI to English (settings)
4. Search `pizza Tel Aviv` again
5. Compare placeIds

**Expected:**
- ✅ Identical placeIds (same restaurants)
- ✅ Same order
- ✅ Different assistant message language
- ✅ Cache hit (check server logs: `dedup_cache_hit`)

### Test 5: UI Switch (No Re-Search)

**Steps:**
1. Search `sushi` with UI=Hebrew
2. Wait for results
3. Switch UI to English
4. Observe (DON'T re-search)

**Expected:**
- ✅ UI labels switch to English
- ✅ NO network request
- ✅ Restaurant names unchanged
- ✅ Instant re-render

---

## ✅ Success Indicators

### Debug Panel

- ✅ Visible in dev mode
- ✅ Shows 3 languages correctly
- ✅ Sources show policy/LLM

### Server Logs

```bash
# Check logs
grep "language_context_resolved" server/logs/server.log | jq '.languageContext'

# Should see:
{
  "uiLanguage": "he",
  "assistantLanguage": "he",
  "searchLanguage": "en",  # Based on region!
  "sources": { ... }
}
```

### Browser Console

No errors (check for:
- ❌ No "undefined" errors
- ❌ No WebSocket errors
- ✅ Clean console

---

## 🐛 If Something Goes Wrong

### Debug Panel Not Visible

**Possible Causes:**
- Production build (panel auto-hidden)
- Response meta missing languageContext

**Fix:**
- Check `environment.production` (should be false)
- Check network response has `meta.languageContext`

### Assistant Language Wrong

**Possible Causes:**
- Backend not sending `language` field
- Frontend not reading `payload.language`

**Fix:**
- Check WebSocket message in DevTools
- Verify `payload.language` exists

### Search Results Change on UI Switch

**Bug:** Should NOT happen

**Diagnosis:**
- Check network tab (should be NO request)
- Check cache key (should NOT include uiLanguage)

---

## 📊 Expected Metrics

### Performance

- Search latency: ~2000ms (down from ~2500ms)
- Profile selection: <1ms (down from ~500ms)
- Cache hit rate: stable or improved

### Logs

- `language_context_resolved` events (1 per search)
- `google_call_language` events (1 per Google call)
- `ranking_profile_selected` with `source: "deterministic"`

---

## ✅ Sign-Off Criteria

After manual testing passes:

- [ ] All 5 test scenarios pass
- [ ] Debug panel shows correct languages
- [ ] Cache behavior correct (no invalidation)
- [ ] UI switch doesn't trigger search
- [ ] Server logs show languageContext
- [ ] No console errors

**Then:** ✅ Approved for staging deployment

---

**Est. Testing Time:** 5-10 minutes  
**Risk:** 🟢 Low  
**Confidence:** High
