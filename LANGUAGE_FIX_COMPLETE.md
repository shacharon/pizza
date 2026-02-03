# Language Propagation Fix - Complete Implementation

## ✅ Task Complete

Fixed language propagation end-to-end so UI labels use `uiLanguage` and assistant messages use `payload.language`.

---

## 📋 Files Changed

### Backend (3 files)

1. **`server/src/services/search/route2/assistant/assistant-publisher.ts`**

   - Updated `publishAssistantMessage()` to accept `assistantLanguage` parameter
   - Added `language` field to WebSocket payload
   - Maps 'other' to 'en' for wire protocol
   - Enhanced logging with language metadata

2. **`server/src/services/search/route2/assistant/assistant-integration.ts`**

   - Updated all `publishAssistantMessage()` calls to pass `context.language`
   - Applied to: `generateAndPublishAssistant()`, `generateAndPublishAssistantDeferred()`, `publishSearchFailedAssistant()`

3. **`server/src/infra/websocket/websocket-protocol.ts`**
   - Made `payload.language` REQUIRED (not optional)
   - Updated type to support 8 languages: `'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it'`
   - Cleaned up deprecated top-level language fields

### Frontend (6 files)

4. **`llm-angular/src/app/core/models/ws-protocol.types.ts`**

   - Added `language` field to `WSServerAssistant.payload` interface
   - Type: `'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it'`

5. **`llm-angular/src/app/facades/assistant-routing.types.ts`**

   - Added optional `language` field to `AssistantCardMessage` interface
   - Supports full language propagation through routing system

6. **`llm-angular/src/app/facades/search-assistant.facade.ts`**

   - Updated `routeMessage()` to accept `language` parameter
   - Passes language to card messages when routing
   - Enhanced logging with language field

7. **`llm-angular/src/app/facades/search.facade.ts`**

   - Extracts `language` from WebSocket payload: `narrator.language || 'en'`
   - Passes language to `routeMessage()` when handling assistant messages
   - Already syncs `uiLanguage` from search response to `I18nService`

8. **`llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.ts`**

   - Added `getMessageDir()` method to determine directionality per message
   - Uses fallback chain: `msg.language → uiLanguage → 'en'`
   - Returns 'rtl' for Hebrew/Arabic, 'ltr' for others

9. **`llm-angular/src/app/features/unified-search/components/assistant-summary/assistant-summary.component.html`**
   - Added `[attr.dir]="getMessageDir(msg)"` to each message div
   - Each assistant card now has its own directionality

---

## 🔧 Technical Architecture

### Language Separation

```
┌──────────────────────────────────────────────────────────┐
│                     UI LABELS                             │
│  Source: query.parsed.languageContext.uiLanguage         │
│  Consumer: I18nService                                    │
│  Examples: Navigate, Call, Closed, Hours unverified      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  ASSISTANT MESSAGES                       │
│  Source: payload.language (WebSocket)                    │
│  Consumer: AssistantSummaryComponent                     │
│  Examples: "Нашёл 8 ресторанов...", "Found 10..."       │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

```
Backend Pipeline:
┌────────────┐    ┌──────────────────┐    ┌──────────────┐
│ Gate2/     │ → │ resolveAssistant │ → │ Assistant    │
│ Intent     │    │ Language()       │    │ Generation   │
│ (detects   │    │ Priority:        │    │ (uses lang)  │
│  language) │    │ 1. Intent        │    └──────────────┘
└────────────┘    │ 2. Query detect  │           │
                  │ 3. Base filters  │           ▼
                  │ 4. UI language   │    ┌──────────────┐
                  │ 5. Fallback: en  │    │ WebSocket    │
                  └──────────────────┘    │ Publish with │
                                          │ payload.lang │
                                          └──────────────┘

Frontend Pipeline:
┌────────────┐    ┌──────────────┐    ┌──────────────┐
│ Search     │ → │ I18n Service │ → │ UI Labels    │
│ Response   │    │ .setLanguage │    │ (Navigate,   │
│ uiLanguage │    │ (uiLanguage) │    │  Call, etc)  │
└────────────┘    └──────────────┘    └──────────────┘

┌────────────┐    ┌──────────────┐    ┌──────────────┐
│ WebSocket  │ → │ Assistant    │ → │ Message      │
│ payload.   │    │ Handler      │    │ Rendering    │
│ language   │    │ .routeMsg()  │    │ [dir=rtl/    │
└────────────┘    └──────────────┘    │      ltr]    │
                                       └──────────────┘
```

### Fallback Chains

**Backend:**

```
intent.language → queryLanguage → baseFilters.language → uiLanguage → 'en'
```

**Frontend:**

```
payload.language → uiLanguage → 'en'
```

---

## ✅ Verification Checklist

### Backend

- [x] `publishAssistantMessage()` accepts and uses `assistantLanguage` parameter
- [x] All calls to `publishAssistantMessage()` pass `context.language`
- [x] WebSocket protocol includes `payload.language` as REQUIRED field
- [x] `resolveAssistantLanguage()` prioritizes query language over UI language
- [x] No TypeScript compilation errors
- [x] No linter errors

### Frontend

- [x] `WSServerAssistant` interface includes `payload.language` field
- [x] `AssistantCardMessage` includes optional `language` field
- [x] `search.facade.ts` extracts language from WebSocket payload
- [x] `assistant-summary` component uses `payload.language` for directionality
- [x] `i18n.service` syncs from search response `uiLanguage`
- [x] No TypeScript compilation errors
- [x] No linter errors

---

## 📦 Example WebSocket Payload

### Russian Query: "пицца рядом"

```json
{
  "type": "assistant",
  "requestId": "req-abc123",
  "payload": {
    "type": "SUMMARY",
    "message": "Нашёл 8 хороших ресторанов рядом с вами. Большинство открыты сейчас.",
    "question": null,
    "blocksSearch": false,
    "language": "ru"
  }
}
```

**✅ Critical Field Present**: `payload.language: "ru"`

### Hebrew Query: "פיצה בתל אביב"

```json
{
  "type": "assistant",
  "requestId": "req-def456",
  "payload": {
    "type": "SUMMARY",
    "message": "מצאתי 12 מסעדות פיצה טובות בתל אביב. רובן פתוחות עכשיו.",
    "question": null,
    "blocksSearch": false,
    "language": "he"
  }
}
```

**✅ Critical Field Present**: `payload.language: "he"`

---

## 🎯 Expected Behavior

### Test Case: Russian Query

**Input**: "пицца рядом"

**Expected**:

1. ✅ Backend detects language as `ru`
2. ✅ Assistant generates message in Russian
3. ✅ WebSocket payload includes `language: "ru"`
4. ✅ Search response includes `uiLanguage: "ru"`
5. ✅ UI labels display in Russian:
   - "Navigate" → "Навигация"
   - "Call" → "Позвонить"
   - "Closed" → "Закрыто"
6. ✅ Assistant card renders with:
   - `dir="ltr"` (Russian uses left-to-right)
   - Message text in Russian

### Test Case: Hebrew Query

**Input**: "פיצה בתל אביב"

**Expected**:

1. ✅ Backend detects language as `he`
2. ✅ Assistant generates message in Hebrew
3. ✅ WebSocket payload includes `language: "he"`
4. ✅ Search response includes `uiLanguage: "he"`
5. ✅ UI labels display in Hebrew:
   - "Navigate" → "נווט"
   - "Call" → "התקשר"
   - "Closed" → "סגור"
6. ✅ Assistant card renders with:
   - `dir="rtl"` (Hebrew uses right-to-left)
   - Message text in Hebrew

---

## 📚 Documentation

- **Summary**: `LANGUAGE_FIX_SUMMARY.md`
- **Verification Guide**: `LANGUAGE_FIX_VERIFICATION.md`
- **Example Payloads**: `LANGUAGE_FIX_EXAMPLE_PAYLOAD.json`

---

## 🎉 Success Criteria Met

✅ **Backend produces assistantLanguage + uiLanguage**

- Gate2/Intent produces language detection
- resolveAssistantLanguage() creates assistantLanguage
- Search response includes uiLanguage in languageContext

✅ **WebSocket assistant publish includes payload.language**

- payload.language is REQUIRED field
- Supports 8 languages: he/en/ru/ar/fr/es/de/it
- Message and question fields remain as-is

✅ **Frontend uses correct language for each purpose**

- UI labels use uiLanguage from search response
- Assistant panel uses payload.language for directionality
- Fallback chain: payload.language → uiLanguage → 'en'

✅ **No UI redesign**

- Only wiring changes
- Existing components enhanced with directionality

✅ **No i18n content changes**

- Translations remain unchanged
- Only language field propagation added

✅ **Minimal diff**

- 9 files changed total (3 backend, 6 frontend)
- Clean, focused changes
- No breaking changes

---

## 🚀 Deployment Notes

- **Backward Compatible**: Frontend gracefully handles missing `language` field (falls back to `uiLanguage`)
- **No Database Changes**: Pure application layer changes
- **No Environment Variables**: No new configuration required
- **Type Safe**: Full TypeScript support with strict types
- **Linter Clean**: All files pass linting

---

## 🔍 Monitoring & Debugging

### Backend Logs

```
[ASSISTANT] Language resolved { chosen: "ru", source: "intent", ... }
[ASSISTANT] Publishing to WebSocket { assistantLanguage: "ru", ... }
```

### Frontend Console

```
[AssistantHandler][CARD] { ..., language: "ru", ... }
```

### Browser Network Tab

Look for WebSocket frames with `payload.language` field.

---

**Implementation Date**: 2026-02-03
**Status**: ✅ Complete & Verified
**Testing**: Ready for QA
