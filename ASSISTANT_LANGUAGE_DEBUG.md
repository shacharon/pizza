# Assistant Language Debug Logging

## Purpose
Minimal debug logging to diagnose whether assistant messages are:
1. **Generated in wrong language** by LLM
2. **Displayed correctly** but showing stale messages in UI

## Usage

### Enable Debug Mode
```bash
export ASSISTANT_LANG_DEBUG=1
```

Or in `.env`:
```
ASSISTANT_LANG_DEBUG=1
```

### Debug Log Events

When enabled, adds these debug logs (zero overhead when disabled):

#### 1. `assistant_llm_success_debug` - LLM Generated Successfully
```json
{
  "requestId": "req_123",
  "event": "assistant_llm_success_debug",
  "messagePreview": "חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?",
  "messageDetectedLang": "he",
  "requestedLang": "he",
  "type": "GENERIC_QUERY_NARRATION"
}
```

#### 2. `assistant_language_mismatch_debug` - LLM Returned Wrong Language
```json
{
  "requestId": "req_123",
  "event": "assistant_language_mismatch_debug",
  "messagePreview": "I searched based on your current location. What type of food are you...",
  "messageDetectedLang": "en",
  "requestedLang": "ru",
  "llmReturnedLang": "en",
  "willUseFallback": true
}
```

**Indicates:** LLM generated English when Russian was requested → will use fallback.

#### 3. `assistant_fallback_used_debug` - Using Deterministic Fallback
```json
{
  "requestId": "req_123",
  "event": "assistant_fallback_used_debug",
  "messagePreview": "כדי לחפש מסעדות לידך אני צריך את המיקום שלך.",
  "messageDetectedLang": "he",
  "requestedLang": "he",
  "reason": "validation_failed",
  "validationIssues": ["language_mismatch (requested=he, message=en)"]
}
```

**Indicates:** Fallback triggered due to validation failure (e.g., language mismatch, format error).

#### 4. `assistant_fallback_used_debug` (LLM Error)
```json
{
  "requestId": "req_123",
  "event": "assistant_fallback_used_debug",
  "messagePreview": "משהו השתבש בחיפוש. אפשר לנסות שוב?",
  "messageDetectedLang": "he",
  "requestedLang": "he",
  "reason": "llm_error",
  "error": "LLM timeout after 5000ms",
  "isTimeout": true
}
```

**Indicates:** Fallback triggered due to LLM timeout/error.

#### 5. `assistant_ws_publish_debug` - Message Published to WebSocket
```json
{
  "requestId": "req_123",
  "event": "assistant_ws_publish_debug",
  "messagePreview": "חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?",
  "messageDetectedLang": "he",
  "type": "GENERIC_QUERY_NARRATION"
}
```

**Indicates:** Message successfully sent to frontend via WebSocket.

## Debug Fields

All debug logs include:

| Field | Description |
|-------|-------------|
| `requestId` | Request ID for correlation |
| `messagePreview` | First 80 chars of the message |
| `messageDetectedLang` | Script-based detection (he/ru/ar/en/unknown) |
| `requestedLang` | Language requested by system (he/en/ru/ar) |
| `type` | Assistant message type (CLARIFY/SUMMARY/etc.) |

Additional fields for specific events:
- `llmReturnedLang`: Detected language from LLM output (mismatch event)
- `reason`: Why fallback was used (validation_failed/llm_error)
- `validationIssues`: List of validation failures
- `error`: Error message (for LLM errors)
- `isTimeout`: Boolean indicating timeout

## Diagnostic Scenarios

### Scenario 1: LLM Generates Wrong Language

**Expected Logs:**
1. `assistant_language_mismatch_debug` - Detects mismatch
2. `assistant_fallback_used_debug` - Uses fallback
3. `assistant_ws_publish_debug` - Publishes fallback message

**Diagnosis:** LLM is not respecting language instruction → Check prompt/model.

### Scenario 2: Correct Language Generated, Wrong UI Display

**Expected Logs:**
1. `assistant_llm_success_debug` - Shows correct language
2. `assistant_ws_publish_debug` - Shows correct language

**Diagnosis:** Backend is correct → Issue is in frontend (stale message, wrong translation, etc.).

### Scenario 3: Frequent Fallback Usage

**Expected Logs:**
1. `assistant_fallback_used_debug` - Appears frequently
2. Check `reason` field

**Diagnosis:** 
- If `reason="validation_failed"` → LLM output quality issue
- If `reason="llm_error"` → LLM timeout/availability issue

## Implementation Details

### Script-Based Language Detection

Simple regex-based detection for debug purposes:

```typescript
function detectMessageLanguage(text: string): string {
  if (/[\u0590-\u05FF]/.test(text)) return 'he'; // Hebrew
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'; // Cyrillic
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'unknown';
}
```

**Note:** This is NOT the same as the majority-script heuristic used for query detection. This is a simple "first-match" for debug logging only.

### Performance Impact

- **When disabled (default):** Zero overhead (flag check only)
- **When enabled:** Minimal overhead (~1-2ms per log)
  - Simple regex checks (no external calls)
  - String truncation to 80 chars
  - No LLM/API calls

### Log Locations

| File | Events Added |
|------|--------------|
| `assistant-llm.service.ts` | `assistant_llm_success_debug`, `assistant_language_mismatch_debug`, `assistant_fallback_used_debug` |
| `assistant-publisher.ts` | `assistant_ws_publish_debug` |

## Troubleshooting Guide

### If Russian Query Shows English Assistant Message

1. **Check `query_language_detected` log**
   - Should be `'ru'` not `'en'`
   - If `'en'` → Query language detector issue

2. **Check `assistant_language_resolved` log**
   - Should show `chosen='ru'`
   - If `chosen='en'` → Language resolution priority issue

3. **Check `assistant_llm_success_debug` log**
   - Should show `messageDetectedLang='ru'`
   - If `messageDetectedLang='en'` → LLM generated wrong language

4. **Check `assistant_ws_publish_debug` log**
   - Should show `messageDetectedLang='ru'`
   - If different from LLM log → Message was changed between generation and publish

### If Arabic Query Shows Stale Message

1. **Check `assistant_ws_publish_debug` log**
   - Verify `messagePreview` matches what UI shows
   - If different → UI is showing cached/stale message

2. **Check `requestId` correlation**
   - Ensure all logs have same `requestId`
   - If mismatched → Request/response correlation issue

## Example Debug Session

```bash
# Enable debug
export ASSISTANT_LANG_DEBUG=1

# Start server
npm start

# Make query: "Рестораны рядом с Big Ben"

# Expected logs:
[INFO] query_language_detected: queryLanguage=ru
[INFO] assistant_language_resolved: chosen=ru, source=queryLanguage
[INFO] assistant_llm_success: type=GENERIC_QUERY_NARRATION, questionLanguage=ru
[INFO] assistant_llm_success_debug: messagePreview="Я нашел рестораны рядом...", messageDetectedLang=ru, requestedLang=ru
[INFO] assistant_ws_publish_debug: messagePreview="Я нашел рестораны рядом...", messageDetectedLang=ru
```

**If you see:**
```bash
[WARN] assistant_language_mismatch_debug: messageDetectedLang=en, requestedLang=ru
[INFO] assistant_fallback_used_debug: reason=validation_failed
```

→ **LLM is generating English instead of Russian** → Check LLM prompt/model configuration.

## Disabling Debug Mode

```bash
unset ASSISTANT_LANG_DEBUG
# or
export ASSISTANT_LANG_DEBUG=0
```

Debug logs will stop immediately (no restart needed).
