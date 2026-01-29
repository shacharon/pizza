# Testing Assistant Language Selection

## Quick Verification

### 1. Test English Query (Region IL)

**Query**: `"what the weather is?"`

**Expected Behavior**:
- ✅ `queryLanguage` detected as `"en"`
- ✅ Assistant responds in **English**
- ✅ Message contains NO Hebrew characters
- ✅ Logs show `source: "queryLanguage"`

**Test Command**:
```bash
cd server
npm test -- assistant-query-language.test.ts -t "what the weather is"
```

**Console Logs to Check**:
```
[ROUTE2] Query language detected (deterministic)
{
  queryLanguage: "en",
  queryLen: 21
}

[ASSISTANT] Language resolved for assistant message
{
  assistantLanguage: "en",
  source: "queryLanguage",
  queryLanguage: "en",
  uiLanguage: "he"  // ← Ignored!
}
```

### 2. Test Hebrew Query

**Query**: `"מה מזג האוויר?"`

**Expected Behavior**:
- ✅ `queryLanguage` detected as `"he"`
- ✅ Assistant responds in **Hebrew**
- ✅ Message contains Hebrew characters
- ✅ Logs show `source: "queryLanguage"`

**Test Command**:
```bash
cd server
npm test -- assistant-query-language.test.ts -t "מה מזג האוויר"
```

**Console Logs to Check**:
```
[ROUTE2] Query language detected (deterministic)
{
  queryLanguage: "he",
  queryLen: 16
}

[ASSISTANT] Language resolved for assistant message
{
  assistantLanguage: "he",
  source: "queryLanguage",
  queryLanguage: "he"
}
```

### 3. Test Mixed Query

**Query**: `"פיצה pizza"` (Hebrew + English, locale="en")

**Expected Behavior**:
- ✅ `queryLanguage` detected as `"he"` (Hebrew chars present)
- ✅ Assistant responds in **Hebrew** (ignores UI locale)
- ✅ Message contains Hebrew characters
- ✅ Logs show `source: "queryLanguage"`

**Test Command**:
```bash
cd server
npm test -- assistant-query-language.test.ts -t "mixed"
```

## Unit Tests

### Run Language Detector Tests

```bash
cd server
npm test -- query-language-detector.test.ts
```

**Tests Coverage**:
- Pure English queries
- Pure Hebrew queries
- Mixed Hebrew + English
- Edge cases (empty, emoji, special chars)
- Null/undefined handling

### Expected Output

```
PASS src/services/search/route2/utils/query-language-detector.test.ts
  detectQueryLanguage
    English detection
      ✓ should detect pure English query
      ✓ should detect English query with punctuation
      ✓ should default to English for empty string
    Hebrew detection
      ✓ should detect pure Hebrew query
      ✓ should detect Hebrew query with English words (mixed)
      ✓ should detect single Hebrew character
    Edge cases
      ✓ should handle emoji only
      ✓ should detect Hebrew even with lots of emojis

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```

## Integration Tests

### Run Full Flow Tests

```bash
cd server
npm test -- assistant-query-language.test.ts
```

**Tests Coverage**:
- English query → English assistant
- Hebrew query → Hebrew assistant
- Mixed query → Hebrew assistant
- Empty query → English fallback
- Emoji query → English fallback

### Expected Output

```
PASS tests/assistant-query-language.test.ts
  Assistant Query Language
    English queries
      ✓ should respond in English for "what the weather is?" (5000ms)
      ✓ should respond in English for "pizza near me" with no location (4500ms)
    Hebrew queries
      ✓ should respond in Hebrew for "מה מזג האוויר?" (5200ms)
      ✓ should respond in Hebrew for "פיצה" with no location (4800ms)
    Mixed queries
      ✓ should respond in Hebrew for "פיצה pizza" (5100ms)
    Edge cases
      ✓ should handle empty query gracefully (3000ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

## Manual Testing (cURL)

### Test 1: English Query (Manual)

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "what the weather is?",
    "filters": {},
    "sessionId": "manual-test-en",
    "locale": "en"
  }'
```

**Check Response**:
```json
{
  "assist": {
    "type": "GATE_FAIL",
    "message": "This doesn't look like a food/restaurant search...",
    "question": null,
    "blocksSearch": true
  }
}
```

**Check Server Logs**:
```
[ROUTE2] Query language detected (deterministic)
{
  queryLanguage: "en"
}

[ASSISTANT] Language resolved for assistant message
{
  assistantLanguage: "en",
  source: "queryLanguage"
}
```

### Test 2: Hebrew Query (Manual)

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "query": "מה מזג האוויר?",
    "filters": {},
    "sessionId": "manual-test-he",
    "locale": "he"
  }'
```

**Check Response**:
```json
{
  "assist": {
    "type": "GATE_FAIL",
    "message": "זה לא נראה כמו חיפוש אוכל/מסעדות...",
    "question": null,
    "blocksSearch": true
  }
}
```

## Monitoring in Production

### Log Filters

**Check query language detection**:
```bash
# Filter logs by event
grep "query_language_detected" server.log | jq '{requestId, queryLanguage, queryLen}'
```

**Check assistant language resolution**:
```bash
# Filter logs by event
grep "assistant_language_resolved" server.log | jq '{requestId, assistantLanguage, source, queryLanguage, uiLanguage}'
```

### Metrics to Track

1. **Detection Distribution**:
   ```bash
   # Count English vs Hebrew detections
   grep "query_language_detected" server.log | jq -r '.queryLanguage' | sort | uniq -c
   ```

2. **Source Distribution**:
   ```bash
   # Count which source is used most
   grep "assistant_language_resolved" server.log | jq -r '.source' | sort | uniq -c
   ```

3. **Language Mismatches**:
   ```bash
   # Find cases where queryLanguage != uiLanguage
   grep "assistant_language_resolved" server.log | jq 'select(.queryLanguage != .uiLanguage)'
   ```

## Common Issues & Debugging

### Issue: Assistant still responds in wrong language

**Debug Steps**:

1. Check if `queryLanguage` is detected:
   ```bash
   grep "query_language_detected" server.log | grep YOUR_REQUEST_ID
   ```

2. Check which source was used:
   ```bash
   grep "assistant_language_resolved" server.log | grep YOUR_REQUEST_ID
   ```

3. Verify priority chain:
   - If `source: "queryLanguage"` → detector working ✅
   - If `source: "uiLanguage"` → queryLanguage missing ❌
   - If `source: "fallback"` → all sources missing ⚠️

### Issue: Hebrew not detected

**Debug Steps**:

1. Check query contains Hebrew characters:
   ```typescript
   const hebrewRegex = /[\u0590-\u05FF]/;
   console.log(hebrewRegex.test(query)); // Should be true
   ```

2. Check Unicode range:
   ```typescript
   console.log(query.charCodeAt(0)); // Should be in range 1424-1535
   ```

3. Run detector test directly:
   ```bash
   npm test -- query-language-detector.test.ts -t "should detect pure Hebrew"
   ```

### Issue: Mixed queries detected as English

**Expected**: Mixed queries (Hebrew + English) should detect as Hebrew.

**Verify**:
```bash
npm test -- query-language-detector.test.ts -t "mixed"
```

If fails, check regex is testing for ANY Hebrew character (not majority).

## Acceptance Checklist

Before deploying:

- [ ] Unit tests pass (`query-language-detector.test.ts`)
- [ ] Integration tests pass (`assistant-query-language.test.ts`)
- [ ] Manual cURL test: English query → English response
- [ ] Manual cURL test: Hebrew query → Hebrew response
- [ ] Manual cURL test: Mixed query → Hebrew response
- [ ] Logs show `query_language_detected` event
- [ ] Logs show `assistant_language_resolved` with `source: "queryLanguage"`
- [ ] No linter errors
- [ ] Documentation updated

## Rollback Verification

If rolled back, verify:

1. **Old behavior restored**:
   - English query in IL region → Hebrew response (old behavior)
   - Logs show `source: "uiLanguage"` or `source: "fallback"`

2. **No errors**:
   - Pipeline still works
   - No undefined errors
   - Tests still pass (old tests)

## Performance Verification

**Check detection overhead**:
```bash
# Measure query_language_detected timing
grep "query_language_detected" server.log | jq '.timestamp' | head -n 100
```

**Expected**: < 1ms overhead (negligible)

## Support

**Questions?**
- Check logs: `grep "query_language_detected" server.log`
- Run tests: `npm test -- query-language-detector.test.ts`
- Read docs: `ASSISTANT_LANGUAGE_FIX.md`
