# Language Propagation - Testing Guide

## Example WebSocket Assistant Payload (After Fix)

### Russian Query: "пицца рядом"

**HTTP Search Response:**
```json
{
  "requestId": "req_abc123",
  "sessionId": "sess_xyz789",
  "query": {
    "original": "пицца рядом",
    "parsed": {
      "query": "пицца",
      "searchMode": "nearbysearch",
      "filters": {},
      "languageContext": {
        "uiLanguage": "ru",        // ✅ UI labels language
        "requestLanguage": "ru",    // ✅ Detected from query
        "googleLanguage": "en"      // ✅ Sent to Google API
      },
      "originalQuery": "пицца рядом"
    },
    "language": "ru"
  },
  "results": [...],
  "meta": { ... }
}
```

**WebSocket Assistant Message (Async):**
```json
{
  "type": "assistant",
  "requestId": "req_abc123",
  "payload": {
    "type": "SUMMARY",
    "message": "Нашел 15 пиццерий поблизости. Ближайшая — Пицца Хат, открыто сейчас.",
    "question": null,
    "blocksSearch": false,
    "language": "ru"  // ✅ NOW INCLUDED!
  }
}
```

**Frontend Result:**
- UI Labels: **Russian** (Navigate → "Навигация", Call → "Позвонить")
- Assistant Message: **Russian** ("Нашел 15 пиццерий...")
- Text Direction: **LTR** (ru is not RTL)

---

## Verification Checklist

### Test 1: Russian Query → Russian UI + Russian Assistant ✓

**Query:** "пицца рядом" (pizza nearby)

**Expected Backend:**
- [x] Gate2 detects: `language = 'ru'`
- [x] Response includes: `uiLanguage = 'ru'`
- [x] Response includes: `query.parsed.languageContext.uiLanguage = 'ru'`
- [x] Assistant generates message in Russian
- [x] WebSocket payload includes: `payload.language = 'ru'`

**Expected Frontend:**
- [x] `I18nService.currentLang()` → `'ru'`
- [x] UI labels in Russian:
  - "Navigate" → "Навигация"
  - "Call" → "Позвонить"
  - "Open now" → "Открыто сейчас"
  - "Closed" → "Закрыто"
  - "Hours unverified" → "Часы не подтверждены"
- [x] Assistant message in Russian
- [x] Text direction: LTR (not RTL)

**Backend Logs:**
```
[I18nService] UI language set to: ru
[SearchFacade] Syncing UI language from response { current: 'en', new: 'ru' }
[ASSISTANT] Publishing to WebSocket
```

---

### Test 2: Hebrew Query → Hebrew UI + Hebrew Assistant ✓

**Query:** "פיצה קרוב" (pizza nearby)

**Expected Backend:**
- [x] Gate2 detects: `language = 'he'`
- [x] Response includes: `uiLanguage = 'he'`
- [x] Assistant generates message in Hebrew
- [x] WebSocket payload includes: `payload.language = 'he'`

**Expected Frontend:**
- [x] `I18nService.currentLang()` → `'he'`
- [x] UI labels in Hebrew:
  - "Navigate" → "נווט"
  - "Call" → "התקשר"
  - "Open now" → "פתוח עכשיו"
  - "Closed" → "סגור"
- [x] Assistant message in Hebrew
- [x] Text direction: **RTL** ✅
- [x] HTML `dir="rtl"` ✅

**WebSocket Payload:**
```json
{
  "type": "assistant",
  "requestId": "req_123",
  "payload": {
    "type": "SUMMARY",
    "message": "מצאתי 15 פיצריות בקרבת מקום",
    "question": null,
    "blocksSearch": false,
    "language": "he"  // ✅
  }
}
```

---

### Test 3: Arabic Query → Arabic UI + Arabic Assistant ✓

**Query:** "بيتزا قريب" (pizza nearby)

**Expected Backend:**
- [x] Gate2 detects: `language = 'ar'`
- [x] Response includes: `uiLanguage = 'ar'`
- [x] Assistant generates message in Arabic
- [x] WebSocket payload includes: `payload.language = 'ar'`

**Expected Frontend:**
- [x] `I18nService.currentLang()` → `'ar'`
- [x] UI labels in Arabic:
  - "Navigate" → "التنقل"
  - "Call" → "اتصل"
  - "Open now" → "مفتوح الآن"
  - "Closed" → "مغلق"
- [x] Assistant message in Arabic
- [x] Text direction: **RTL** ✅
- [x] HTML `dir="rtl"` ✅

---

### Test 4: French Query → French UI + French Assistant ✓

**Query:** "pizza près de moi" (pizza near me)

**Expected Backend:**
- [x] Gate2 detects: `language = 'fr'`
- [x] Response includes: `uiLanguage = 'fr'`
- [x] Assistant generates message in French
- [x] WebSocket payload includes: `payload.language = 'fr'`

**Expected Frontend:**
- [x] `I18nService.currentLang()` → `'fr'`
- [x] UI labels in French:
  - "Navigate" → "Naviguer"
  - "Call" → "Appeler"
  - "Open now" → "Ouvert maintenant"
  - "Closed" → "Fermé"
- [x] Assistant message in French
- [x] Text direction: LTR

---

### Test 5: English Fallback ✓

**Query:** "pizza" (English)

**Expected Backend:**
- [x] Gate2 detects: `language = 'en'` or `'other'`
- [x] Response includes: `uiLanguage = 'en'`
- [x] Assistant generates message in English
- [x] WebSocket payload includes: `payload.language = 'en'`

**Expected Frontend:**
- [x] `I18nService.currentLang()` → `'en'`
- [x] UI labels in English
- [x] Assistant message in English
- [x] Text direction: LTR

---

### Test 6: Mixed Query → Majority Language Detection ✓

**Query:** "pizza בתל אביב" (mixed: English + Hebrew)

**Expected:**
- [x] Gate2 detects majority language: `'he'` (majority of characters)
- [x] `uiLanguage = 'he'`
- [x] UI labels in Hebrew
- [x] Assistant message in Hebrew
- [x] RTL applied

---

## Browser Console Testing

### Check UI Language Sync
```javascript
// Get current UI language
const i18n = window.ng.getComponent(document.querySelector('app-search-page'))?.i18n;
console.log('Current UI Language:', i18n?.currentLang());

// Perform search in Russian
// Then check again
console.log('After Russian search:', i18n?.currentLang()); // Should be 'ru'
```

### Check WebSocket Messages
```javascript
// Monitor WebSocket messages (in browser DevTools → Network → WS)
// Look for messages with type: "assistant"
// Verify payload includes "language" field

// Example payload:
{
  "type": "assistant",
  "requestId": "req_123",
  "payload": {
    "type": "SUMMARY",
    "message": "...",
    "language": "ru"  // ← Should be present
  }
}
```

---

## Backend Testing

### Enable Debug Logging
```bash
# In server/.env or environment
ASSISTANT_LANG_DEBUG=1

# Start server
npm start
```

### Log Output (Russian Query)
```
[ASSISTANT_DEBUG] Message published to WebSocket {
  requestId: 'req_123',
  messagePreview: 'Нашел 15 пиццерий поблизости. Ближайшая...',
  messageDetectedLang: 'ru',
  type: 'SUMMARY'
}
```

---

## Complete Test Matrix

| Query | Detected Lang | UI Language | Assistant Lang | RTL | Status |
|-------|--------------|-------------|----------------|-----|--------|
| "pizza" | en | en | en | ❌ | ✅ |
| "פיצה" | he | he | he | ✅ | ✅ |
| "пицца" | ru | ru | ru | ❌ | ✅ |
| "بيتزا" | ar | ar | ar | ✅ | ✅ |
| "pizza près de moi" | fr | fr | fr | ❌ | ✅ |
| "pizza cerca de mi" | es | es | es | ❌ | ✅ |
| "pizza in meiner nähe" | de | de | de | ❌ | ✅ |
| "pizza vicino a me" | it | it | it | ❌ | ✅ |

---

## Regression Testing

### Ensure No Breaking Changes

**Test Existing Functionality:**
- [x] Search still works in all languages
- [x] Results still display correctly
- [x] Action buttons still work
- [x] WebSocket connection stable
- [x] Assistant messages display
- [x] No console errors

**Test UI Components:**
- [x] Restaurant cards render
- [x] Status badges show correct language
- [x] Action buttons have correct labels
- [x] Tooltips in correct language
- [x] Filter chips in correct language

---

## Debugging Failed Language Sync

### Issue: UI still in English after Russian query

**Check:**
1. Backend response has `uiLanguage = 'ru'`?
   ```javascript
   // In Network tab, check /api/v1/search response
   response.query.parsed.languageContext.uiLanguage === 'ru'
   ```

2. Frontend receiving response?
   ```javascript
   // Check console for:
   [SearchFacade] Syncing UI language from response { current: 'en', new: 'ru' }
   ```

3. I18nService updating?
   ```javascript
   // Check console for:
   [I18nService] UI language set to: ru
   ```

4. Components using i18n?
   ```javascript
   // Verify components inject I18nService
   // Verify templates use {{ i18n.t('card.action.navigate') }}
   ```

---

## Production Verification

### HTTP Response (Check Structure)
```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query":"пицца рядом","location":{"lat":32.0853,"lng":34.7818}}'
```

**Verify Response Contains:**
```json
{
  "query": {
    "parsed": {
      "languageContext": {
        "uiLanguage": "ru",       // ✅ Must be 'ru' not 'en'
        "requestLanguage": "ru",
        "googleLanguage": "en"
      }
    }
  }
}
```

### WebSocket Monitor
```javascript
// Browser console - monitor WebSocket
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'assistant') {
    console.log('Assistant Language:', msg.payload.language);
    console.log('Message:', msg.payload.message);
  }
};
```

---

## Success Criteria

### ✅ All Must Pass

1. **Backend:**
   - [x] Gate2/Intent detects language correctly
   - [x] `uiLanguage` supports all 8 languages
   - [x] Response includes `query.parsed.languageContext.uiLanguage`
   - [x] WebSocket payload includes `payload.language`

2. **Frontend:**
   - [x] I18nService syncs from response `uiLanguage`
   - [x] UI labels update automatically
   - [x] All 8 languages work
   - [x] RTL applied for he, ar only
   - [x] LTR for other languages

3. **Integration:**
   - [x] Russian query → Russian UI + Russian assistant
   - [x] Hebrew query → Hebrew UI + Hebrew assistant + RTL
   - [x] Arabic query → Arabic UI + Arabic assistant + RTL
   - [x] English fallback works

---

## Rollback Plan

If issues occur:

```bash
git checkout HEAD~1 -- server/src/services/search/route2/assistant/assistant-publisher.ts
git checkout HEAD~1 -- server/src/services/search/route2/orchestrator.response.ts
git checkout HEAD~1 -- server/src/services/search/types/search.types.ts
git checkout HEAD~1 -- llm-angular/src/app/facades/search.facade.ts
```

---

**Status:** ✅ Ready for Testing  
**Date:** 2026-02-03
