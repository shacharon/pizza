# Assistant Message Dynamic Test - Results

## Test Execution Summary

**Date:** 2026-01-31  
**Goal:** Prove assistant messages are query-specific and respect `uiLanguage` + `resultCount`

---

## Automated Test Results

### Test Script: `test-assistant-dynamic.js`

**Tests Run:**

1. **SEARCH A:** "מסעדות איטלקיות בגדרה" (uiLanguage=he)
2. **SEARCH B:** "מסעדות רומנטיות כשרות בתל אביב" (uiLanguage=he)
3. **SEARCH C:** "Italian restaurants in Gedera" (uiLanguage=en)

**Results:**

| Search | RequestId                     | Result Count | Assistant Message      | Language |
| ------ | ----------------------------- | ------------ | ---------------------- | -------- |
| A      | `req-1769848566457-zghixm6h6` | 5            | (NO ASSISTANT MESSAGE) | none     |
| B      | `req-1769848575678-gxhtwnx49` | 1            | (NO ASSISTANT MESSAGE) | none     |
| C      | `req-1769848585873-ehd2qwsk5` | 6            | (NO ASSISTANT MESSAGE) | none     |

### Key Finding: Assistant Messages Not in HTTP Response

**Reason:** Assistant messages are sent via **WebSocket only**, not included in the HTTP polling response.

The test successfully proves:

- ✅ Each search gets a **unique requestId**
- ✅ Backend accepts searches with `uiLanguage` parameter
- ✅ Searches complete and return results
- ❌ **Assistant messages require WebSocket connection** (HTTP test cannot verify)

---

## What This Proves

### Backend Architecture (Confirmed ✅)

1. **Unique RequestIds Per Search**

   - Search A: `req-1769848566457-zghixm6h6`
   - Search B: `req-1769848575678-gxhtwnx49`
   - Search C: `req-1769848585873-ehd2qwsk5`
   - ✅ All different - no reuse

2. **UI Language Parameter Accepted**

   - Searches A & B sent `uiLanguage: "he"`
   - Search C sent `uiLanguage: "en"`
   - ✅ Backend accepted parameter (no 400 errors)

3. **Result Count Varies by Query**
   - Search A (Italian in Gedera): 5 results
   - Search B (Romantic kosher in Tel Aviv): 1 result
   - Search C (Italian in Gedera, English): 6 results
   - ✅ Different counts per query

### Frontend State Management (Already Verified ✅)

From previous analysis and tests:

1. ✅ `assistantHandler.reset()` called on every new search (line 238 of `search.facade.ts`)
2. ✅ RequestId scoping ignores old messages (lines 76-93 of `search-ws.facade.ts`)
3. ✅ Component clears on new requestId (lines 148-153 of `assistant-panel.component.ts`)
4. ✅ `uiLanguage` passed from `locale()` (line 286 of `search.facade.ts`)

---

## Manual Testing Required

Since assistant messages are **WebSocket-only**, manual testing with the frontend is required.

### Manual Test Steps

**Prerequisites:**

- Backend running on `http://localhost:3000`
- Frontend running on `http://localhost:4200`

**Test Procedure:**

1. **Open browser to** `http://localhost:4200`
2. **Open DevTools Console** (F12)
3. **Perform searches:**

   **Search A:** (Hebrew UI)

   ```
   Query: מסעדות איטלקיות בגדרה
   UI Language: Hebrew
   ```

   - Watch console for: `[AssistantPanel][DEBUG] assistant: {type: SUMMARY, lang: he, req: xxxxxxxx, ...}`
   - Note the assistant message text
   - Note the requestId

   **Search B:** (Hebrew UI)

   ```
   Query: מסעדות רומנטיות כשרות בתל אביב
   UI Language: Hebrew
   ```

   - Watch console for: `[AssistantPanel] NEW requestId detected - clearing old messages`
   - Watch console for: `[AssistantPanel][DEBUG] assistant: {type: SUMMARY, lang: he, req: yyyyyyyy, ...}`
   - Note the assistant message text (should be DIFFERENT from A)
   - Note the requestId (should be DIFFERENT from A)

   **Search C:** (English UI)

   ```
   Query: Italian restaurants in Gedera
   UI Language: English
   ```

   - Switch UI to English first (locale selector)
   - Watch console for: `[AssistantPanel] NEW requestId detected - clearing old messages`
   - Watch console for: `[AssistantPanel][DEBUG] assistant: {type: SUMMARY, lang: en, req: zzzzzzzz, ...}`
   - Note the assistant message text (should be in ENGLISH)
   - Note the requestId (should be DIFFERENT from A & B)

### Expected Console Logs

**For each search, you should see:**

```
[SearchAssistantHandler] reset() - clearing all assistant state
[AssistantPanel] NEW requestId detected - clearing old messages
  oldRequestId: "old-req-id"
  newRequestId: "new-req-id"
[AssistantPanel][DEBUG] assistant: {type: SUMMARY, lang: he, req: new-req, blocksSearch: false}
[AssistantPanel][RENDER] Signal updated - UI will render
  requestId: "new-req"
  narratorType: "SUMMARY"
  language: "he"
  messageCount: 1
  displayMessage: "מצאתי מסעדות..."
```

### PASS Criteria

- ✅ **Check 1:** Assistant messages DIFFER between searches A and B

  - A should mention "איטלקיות" (Italian) and "בגדרה" (in Gedera)
  - B should mention "רומנטיות" (romantic) and "כשרות" (kosher) and "תל אביב" (Tel Aviv)

- ✅ **Check 2:** Search C returns ENGLISH message

  - Message should be in English (e.g., "Found Italian restaurants...")
  - NOT Hebrew

- ✅ **Check 3:** RequestIds are unique

  - req-A ≠ req-B ≠ req-C

- ✅ **Check 4:** Old messages cleared on new search
  - Console shows "NEW requestId detected - clearing old messages"
  - UI only shows message for current search

---

## Backend Logs to Check

After manual testing, check `server/logs/server.log` for:

### 1. Assistant Emit Logs

Search for `"assistant_emitted"`:

**Expected format:**

```json
{
  "level": "info",
  "time": "2026-01-31T...",
  "requestId": "req-...",
  "narratorType": "SUMMARY",
  "uiLanguage": "he",
  "message": "מצאתי מסעדות איטלקיות...",
  "resultCount": 5,
  "cacheKey": "...",
  "cacheHit": false,
  "msg": "[ASSISTANT] Emitted summary"
}
```

**Verify:**

- ✅ `uiLanguage` matches request ("he" for A&B, "en" for C)
- ✅ `message` is query-specific (mentions query context)
- ✅ `resultCount` matches actual results
- ✅ `cacheKey` DIFFERS between A, B, C (different buckets)

### 2. Language Context Logs

Search for `"language_context"` or `"uiLanguage"`:

**Expected:**

```json
{
  "requestId": "req-...",
  "uiLanguage": "he",
  "queryLanguage": "he",
  "googleLanguage": "iw",
  "msg": "[LANGUAGE] Context resolved"
}
```

**Verify:**

- ✅ `uiLanguage` from request is preserved
- ✅ Used for assistant generation

### 3. Cache Key Variations

Search for assistant cache keys:

**Expected:**

```
Search A (Hebrew, Italian, 5 results): assistant:summary:he:italian_cuisine:5
Search B (Hebrew, Romantic, 1 result): assistant:summary:he:romantic_kosher:1
Search C (English, Italian, 6 results): assistant:summary:en:italian_cuisine:6
```

**Verify:**

- ✅ Language prefix differs (he vs en)
- ✅ Query context differs (italian vs romantic_kosher)
- ✅ Count differs (5 vs 1 vs 6)
- ✅ NO cache reuse across different queries

---

## Test Summary

### Automated Test (HTTP) ✅

- ✅ Unique requestIds per search
- ✅ uiLanguage parameter accepted
- ✅ Results vary by query
- ❌ Cannot verify assistant messages (WebSocket-only)

### Manual Test (Required) 🔄

- 🔄 Awaiting user to perform test in browser
- 🔄 Verify assistant messages differ
- 🔄 Verify language matches UI
- 🔄 Check backend logs for assistant_emitted

### Code Verification (Completed) ✅

- ✅ Frontend state management correct
- ✅ Backend prompt updated for query-specific responses
- ✅ Debug logging enhanced
- ✅ Unit tests added

---

## Conclusion

**Automated test confirms:**

- Backend accepts uiLanguage parameter ✅
- Each search gets unique requestId ✅
- Results vary by query ✅

**Manual test required to confirm:**

- Assistant messages are query-specific 🔄
- Language matches UI setting 🔄
- No message reuse across searches 🔄

**Next Step:** User should perform manual test in browser with DevTools open.
