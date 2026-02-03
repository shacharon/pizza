# Language Propagation Fix - Verification Guide

## Test Scenario: Russian Query → Russian Assistant + Russian UI

### 1. Setup

```bash
# Start backend server
cd server
npm run dev

# Start frontend server
cd llm-angular
npm start
```

### 2. Test Query

```
Query: "пицца рядом" (pizza nearby in Russian)
```

### 3. Expected Backend Behavior

#### Step 1: Gate2/Intent Detection

```json
{
  "stage": "intent",
  "event": "intent_decided",
  "route": "NEARBY",
  "language": "ru",
  "confidence": 0.95
}
```

#### Step 2: Language Resolution

```json
{
  "event": "assistant_language_resolved",
  "chosen": "ru",
  "source": "intent",
  "candidates": {
    "intent": "ru",
    "queryDetected": "ru",
    "baseFilters": "ru",
    "uiLanguage": "en"
  }
}
```

#### Step 3: Assistant Generation

```json
{
  "event": "assistant_llm_success",
  "type": "SUMMARY",
  "questionLanguage": "ru",
  "suggestedAction": "NONE",
  "blocksSearch": false
}
```

#### Step 4: WebSocket Publish

```json
{
  "channel": "assistant",
  "requestId": "req-abc123",
  "payloadType": "assistant",
  "assistantLanguage": "ru",
  "event": "assistant_ws_publish"
}
```

### 4. Expected WebSocket Message

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

**✅ CRITICAL FIELD**: `payload.language: "ru"`

### 5. Expected Search Response

```json
{
  "requestId": "req-abc123",
  "sessionId": "session-xyz789",
  "query": {
    "original": "пицца рядом",
    "parsed": {
      "query": "пицца",
      "searchMode": "nearbysearch",
      "languageContext": {
        "uiLanguage": "ru",
        "requestLanguage": "ru",
        "googleLanguage": "en"
      }
    },
    "language": "ru"
  },
  "results": [...],
  "chips": [],
  "assist": { "type": "guide", "message": "" }
}
```

**✅ CRITICAL FIELD**: `query.parsed.languageContext.uiLanguage: "ru"`

### 6. Expected Frontend Behavior

#### Step 1: Search Response Handling

```typescript
// search.facade.ts handleSearchResponse()
const uiLanguage = response.query.parsed?.languageContext?.uiLanguage; // 'ru'
this.i18nService.setLanguage(uiLanguage); // Updates UI labels
```

**Result**: UI labels switch to Russian

- "Navigate" → "Навигация"
- "Call" → "Позвонить"
- "Closed" → "Закрыто"
- "Hours unverified" → "Часы не подтверждены"

#### Step 2: WebSocket Message Handling

```typescript
// search.facade.ts handleWsMessage()
const narrator = msg.payload;
const language = narrator.language || "en"; // 'ru'

this.assistantHandler.routeMessage(
  narrator.type,
  assistMessage,
  msg.requestId,
  {
    question: narrator.question,
    blocksSearch: narrator.blocksSearch,
    language: language, // Pass language to routing
  }
);
```

#### Step 3: Assistant Card Rendering

```typescript
// assistant-summary.component.ts
getMessageDir(msg: AssistantCardMessage): 'rtl' | 'ltr' {
  const lang = msg.language || this.locale(); // 'ru'
  return ['he', 'ar'].includes(lang) ? 'rtl' : 'ltr'; // Returns 'ltr' for Russian
}
```

**Result**: Assistant card renders with:

- `dir="ltr"` (Russian uses left-to-right)
- Message text in Russian: "Нашёл 8 хороших ресторанов рядом с вами..."

### 7. Visual Verification

#### Restaurant Cards (using uiLanguage)

```
┌─────────────────────────────────────┐
│ Пиццерия "Рома"              ★ 4.5 │
│ 📍 0.3 км · Открыто сейчас          │
│                                      │
│ [Навигация] [Позвонить] [❤️]        │
└─────────────────────────────────────┘
```

**✅ UI Labels**: Russian (from i18nService / uiLanguage)

#### Assistant Card (using payload.language)

```
┌─────────────────────────────────────┐
│ ✨ Нашёл 8 хороших ресторанов       │
│    рядом с вами. Большинство        │
│    открыты сейчас.                  │
│                                      │
│    [dir="ltr"]                       │
└─────────────────────────────────────┘
```

**✅ Directionality**: LTR (Russian)
**✅ Message Language**: Russian (from payload.language)

### 8. Test Case: Hebrew Query

```
Query: "פיצה בתל אביב" (pizza in Tel Aviv)
```

**Expected WebSocket Payload:**

```json
{
  "payload": {
    "type": "SUMMARY",
    "message": "מצאתי 12 מסעדות פיצה טובות בתל אביב. רובן פתוחות עכשיו.",
    "language": "he"
  }
}
```

**Expected UI:**

```
┌─────────────────────────────────────┐
│ פיצה "רומא"                  ★ 4.5 │
│ תל אביב · פתוח עכשיו · 0.8 ק"מ 📍 │
│                                      │
│        [❤️] [התקשר] [נווט]         │
└─────────────────────────────────────┘
```

- **UI Labels**: Hebrew (from uiLanguage)
- **Assistant Card**: `dir="rtl"` (Hebrew is RTL)

### 9. Browser Console Verification

#### Open Developer Tools → Console

**Look for:**

```
[AssistantHandler][ROUTING] {
  requestId: "req-abc123",
  type: "SUMMARY",
  messageId: "req-abc123:SUMMARY:1738573200000",
  dedupDropped: false,
  routedTo: "card",
  timestamp: "2026-02-03T08:00:00.000Z"
}

[AssistantHandler][CARD] {
  messageId: "req-abc123:SUMMARY:1738573200000",
  type: "SUMMARY",
  message: "Нашёл 8 хороших ресторанов рядом с вами...",
  totalCardMessages: 1,
  blocksSearch: false,
  language: "ru"  ← ✅ CRITICAL FIELD
}
```

### 10. Network Tab Verification

#### WebSocket Frame (assistant channel)

```json
{
  "type": "assistant",
  "requestId": "req-abc123",
  "payload": {
    "type": "SUMMARY",
    "message": "Нашёл 8 хороших ресторанов рядом с вами. Большинство открыты сейчас.",
    "question": null,
    "blocksSearch": false,
    "language": "ru"  ← ✅ VERIFY THIS FIELD EXISTS
  }
}
```

### 11. Backend Logs Verification

```bash
# Look for these log entries:

[ASSISTANT] Language resolved {
  requestId: "req-abc123",
  chosen: "ru",
  source: "intent",
  candidates: { intent: "ru", queryDetected: "ru", ... }
}

[ASSISTANT] Publishing to WebSocket {
  channel: "assistant",
  requestId: "req-abc123",
  assistantLanguage: "ru",  ← ✅ VERIFY THIS FIELD
  event: "assistant_ws_publish"
}

[ASSISTANT] Published to WebSocket {
  requestId: "req-abc123",
  assistantType: "SUMMARY",
  blocksSearch: false
}
```

### 12. Fallback Behavior Test

#### Test Case: Unknown Language

```
Query: "寿司" (sushi in Chinese - not supported)
```

**Expected Behavior:**

1. Backend resolves language as 'other' → maps to 'en'
2. WebSocket payload includes `language: "en"`
3. UI labels use uiLanguage (may be 'en' or user's browser language)
4. Assistant card renders with `dir="ltr"` and English text

### 13. Checklist

- [ ] Russian query → assistant message in Russian
- [ ] Hebrew query → assistant message in Hebrew with RTL
- [ ] WebSocket payload includes `language` field
- [ ] Search response includes `uiLanguage` in `languageContext`
- [ ] UI labels use `uiLanguage` from search response
- [ ] Assistant cards use `payload.language` for directionality
- [ ] Browser console shows `language` in routing logs
- [ ] Backend logs show `assistantLanguage` in publish logs

### 14. Edge Cases

#### Mixed Language UI

```
Query: "пицца" (Russian query)
Browser Language: English
Expected:
- uiLanguage: "ru" (from query detection)
- UI Labels: Russian
- Assistant: Russian with LTR
```

#### Language Mismatch

```
Query: "pizza" (English query)
User Preference: Hebrew UI
Expected:
- uiLanguage: "en" (query wins over preference)
- UI Labels: English
- Assistant: English with LTR
```

## Summary

✅ **UI Labels** → `uiLanguage` (from search response)
✅ **Assistant Messages** → `payload.language` (from WebSocket)
✅ **Directionality** → Determined per message based on `payload.language`
✅ **Fallback Chain** → `payload.language` → `uiLanguage` → `'en'`
