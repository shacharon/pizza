# WS Assistant Language Tracking - Raw Message Logging

## מטרה

הוספת לוג דטרמיניסטי בנקודת הקליטה הראשונה של הודעות WebSocket, **לפני** כל normalization/mapping/parsing.

המטרה: לעקוב אחר `assistantLanguage` ולראות אם הוא:
- א) מגיע כבר מה-WebSocket
- ב) מתווסף אחרי parsing
- ג) מתווסף אחרי mapping

## מיקום הלוג

**קובץ:** `message-validation.service.ts`  
**פונקציה:** `validate()`  
**שלב:** מיד אחרי JSON parsing, לפני normalization

## פורמט הלוג

```json
{
  "clientId": "ws-1234567890-abc123",
  "event": "ws_assistant_raw_received",
  "rawMessage": { /* כל ההודעה as-is */ },
  "rawMessage.type": "subscribe",
  "rawMessage.assistantLanguage": undefined,
  "rawMessage.payload?.type": "search",
  "rawMessage.payload?.assistantLanguage": "he",
  "rawMessage.payload?.language": "en",
  "uiLanguage": "he",
  "level": "info"
}
```

## שדות

| שדה | מקור | מטרה |
|-----|------|------|
| `rawMessage` | ההודעה המלאה (parsed JSON) | הקשר מלא |
| `rawMessage.type` | `message.type` | סוג ההודעה |
| `rawMessage.assistantLanguage` | `message.assistantLanguage` | האם assistantLanguage ברמה עליונה? |
| `rawMessage.payload?.type` | `message.payload?.type` | סוג payload |
| `rawMessage.payload?.assistantLanguage` | `message.payload?.assistantLanguage` | האם assistantLanguage ב-payload? |
| `rawMessage.payload?.language` | `message.payload?.language` | שדה language ישן (legacy) |
| `uiLanguage` | `message.uiLanguage` או `message.payload?.uiLanguage` | שפת UI נוכחית |

## קוד מלא

```typescript
validate(data: any, clientId: string): ValidationResult {
  // Step 1: Parse JSON
  const parseResult = this.parseMessage(data, clientId);
  if (!parseResult.success) {
    return { valid: false, reason: 'parse_error', error: parseResult.error || 'unknown' };
  }

  let message = parseResult.message;

  // Step 1.5: Log raw message as-is (BEFORE any normalization/mapping)
  // Purpose: Track if assistantLanguage arrives from WS or gets added later
  logger.info({
    clientId,
    event: 'ws_assistant_raw_received',
    rawMessage: message,
    'rawMessage.type': message?.type,
    'rawMessage.assistantLanguage': message?.assistantLanguage,
    'rawMessage.payload?.type': message?.payload?.type,
    'rawMessage.payload?.assistantLanguage': message?.payload?.assistantLanguage,
    'rawMessage.payload?.language': message?.payload?.language,
    uiLanguage: message?.uiLanguage || message?.payload?.uiLanguage
  }, '[WS] Raw message received (pre-normalization)');

  // Step 2: Log message structure in dev
  this.logMessageStructure(message, clientId);

  // Step 3: Normalize legacy message format
  message = this.normalizeLegacy(message, clientId);
  
  // ... המשך validation
}
```

## דוגמאות לוגים

### 1. assistantLanguage מגיע מה-UI (מצב רצוי)

```json
{
  "clientId": "ws-1706825400000-aaa111",
  "event": "ws_assistant_raw_received",
  "rawMessage": {
    "type": "subscribe",
    "channel": "search:req-123",
    "requestId": "req-123",
    "uiLanguage": "he"
  },
  "rawMessage.type": "subscribe",
  "rawMessage.assistantLanguage": undefined,
  "rawMessage.payload?.type": undefined,
  "rawMessage.payload?.assistantLanguage": undefined,
  "rawMessage.payload?.language": undefined,
  "uiLanguage": "he",
  "timestamp": "2026-02-01T20:30:00.000Z"
}
```

**ניתוח:** `assistantLanguage` חסר ברמת הודעה, אבל `uiLanguage=he` קיים. השרת צריך להמיר את `uiLanguage` ל-`assistantLanguage`.

### 2. assistantLanguage חסר לגמרי (בעיה)

```json
{
  "clientId": "ws-1706825401000-bbb222",
  "event": "ws_assistant_raw_received",
  "rawMessage": {
    "type": "subscribe",
    "channel": "search:req-456",
    "requestId": "req-456"
  },
  "rawMessage.type": "subscribe",
  "rawMessage.assistantLanguage": undefined,
  "rawMessage.payload?.type": undefined,
  "rawMessage.payload?.assistantLanguage": undefined,
  "rawMessage.payload?.language": undefined,
  "uiLanguage": undefined,
  "timestamp": "2026-02-01T20:31:00.000Z"
}
```

**ניתוח:** גם `assistantLanguage` וגם `uiLanguage` חסרים. השרת יאלץ לחזור ל-fallback (`en`).

### 3. assistantLanguage ב-payload (legacy)

```json
{
  "clientId": "ws-1706825402000-ccc333",
  "event": "ws_assistant_raw_received",
  "rawMessage": {
    "type": "search",
    "payload": {
      "type": "search_query",
      "assistantLanguage": "he",
      "query": "פיצה"
    }
  },
  "rawMessage.type": "search",
  "rawMessage.assistantLanguage": undefined,
  "rawMessage.payload?.type": "search_query",
  "rawMessage.payload?.assistantLanguage": "he",
  "rawMessage.payload?.language": undefined,
  "uiLanguage": undefined,
  "timestamp": "2026-02-01T20:32:00.000Z"
}
```

**ניתוח:** `assistantLanguage` ב-payload (לא ברמה עליונה). זה מצב legacy שצריך normalization.

### 4. language ישן (legacy)

```json
{
  "clientId": "ws-1706825403000-ddd444",
  "event": "ws_assistant_raw_received",
  "rawMessage": {
    "type": "search",
    "payload": {
      "language": "he",
      "query": "פיצה"
    }
  },
  "rawMessage.type": "search",
  "rawMessage.assistantLanguage": undefined,
  "rawMessage.payload?.type": undefined,
  "rawMessage.payload?.assistantLanguage": undefined,
  "rawMessage.payload?.language": "he",
  "uiLanguage": undefined,
  "timestamp": "2026-02-01T20:33:00.000Z"
}
```

**ניתוח:** שדה `language` ישן (לא `assistantLanguage`). זה legacy protocol שצריך normalization.

## שימוש ב-Logs

### חיפוש כל ההודעות שבהן assistantLanguage חסר

```bash
jq 'select(.event=="ws_assistant_raw_received" and ."rawMessage.assistantLanguage"==null and ."rawMessage.payload?.assistantLanguage"==null)' logs/server.log
```

### חיפוש הודעות עם uiLanguage אבל בלי assistantLanguage

```bash
jq 'select(.event=="ws_assistant_raw_received" and .uiLanguage!=null and ."rawMessage.assistantLanguage"==null)' logs/server.log
```

### ספירת מקורות שונים של assistantLanguage

```bash
jq -s '
  group_by(
    if ."rawMessage.assistantLanguage" != null then "top_level"
    elif ."rawMessage.payload?.assistantLanguage" != null then "payload"
    elif ."rawMessage.payload?.language" != null then "legacy_language"
    elif .uiLanguage != null then "uiLanguage_only"
    else "missing"
    end
  ) | 
  map({source: .[0] | if ."rawMessage.assistantLanguage" != null then "top_level" elif ."rawMessage.payload?.assistantLanguage" != null then "payload" elif ."rawMessage.payload?.language" != null then "legacy_language" elif .uiLanguage != null then "uiLanguage_only" else "missing" end, count: length})
' logs/server.log
```

**פלט לדוגמה:**
```json
[
  {"source": "uiLanguage_only", "count": 42},
  {"source": "missing", "count": 3},
  {"source": "legacy_language", "count": 1}
]
```

## יתרונות

1. **נקודת אמת אחת** - לוג אחד בלבד, בנקודת קליטה הראשונה
2. **דטרמיניסטי** - מדפיס as-is, ללא fallback או normalization
3. **שקיפות מלאה** - רואים את כל המקורות האפשריים של assistantLanguage
4. **ניתוח קל** - פורמט JSON מובנה, ניתן לשאילתות עם `jq`

## אין שינוי לוגיקה

- לוג בלבד, אפס שינויים בלוגיקה קיימת
- אפס fallbacks
- אפס mapping
- רק תיעוד של מה שמגיע מה-WebSocket

---

**סטטוס:** ✅ הושלם  
**קובץ שונה:** `message-validation.service.ts`  
**אירוע:** `ws_assistant_raw_received`  
**רמת לוג:** `info`
