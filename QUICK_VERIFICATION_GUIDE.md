# Quick Verification Guide - Language Separation Fix

## Run Tests

```bash
cd server

# Test 1: Language Context (28 tests)
npm test -- src/services/search/route2/shared/__tests__/language-context.test.ts

# Test 2: Schema Validation (55 tests)
npm test -- src/services/search/route2/stages/route-llm/__tests__/textsearch-schema.test.ts

# Expected: 83/83 passing ✅
```

---

## Check Logs (Production)

### 1. Search for Language Context Log

```bash
# Look for this log event
grep "language_context_resolved" server/logs/server.log | tail -5
```

**Expected Log Structure:**

```json
{
  "event": "language_context_resolved",
  "detectedQueryLanguage": "he",
  "intentLanguage": "he",
  "intentLanguageConfidence": 0.9,
  "assistantLanguage": "he", // ← MUST = detectedQueryLanguage
  "searchLanguage": "he",
  "providerLanguage": "he",
  "sources": {
    "assistantLanguage": "query_language_deterministic", // ← NEW SOURCE
    "searchLanguage": "region_policy:IL"
  },
  "providerLanguagePolicy": "regionDefault"
}
```

**Critical Check:**

- ✅ `assistantLanguage` = `detectedQueryLanguage` (ALWAYS)
- ✅ `sources.assistantLanguage` = `"query_language_deterministic"`

---

### 2. Check for OpenAI 400 Errors

```bash
# Look for schema errors
grep "400" server/logs/server.log | grep "textQuery"
```

**Expected:** NO RESULTS (zero 400 errors) ✅

---

## Manual Test Scenarios

### Scenario 1: Hebrew Query

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "מסעדות בתל אביב",
    "uiLanguage": "en"
  }'
```

**Check Response Meta:**

```json
{
  "meta": {
    "languageContext": {
      "uiLanguage": "en",
      "detectedQueryLanguage": "he",
      "assistantLanguage": "he", // ← MUST be "he" (not "en")
      "searchLanguage": "he"
    }
  }
}
```

---

### Scenario 2: English Query in Israel

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "restaurants in tel aviv",
    "uiLanguage": "he"
  }'
```

**Check Response Meta:**

```json
{
  "meta": {
    "languageContext": {
      "uiLanguage": "he",
      "detectedQueryLanguage": "en",
      "assistantLanguage": "en", // ← MUST be "en" (not "he")
      "searchLanguage": "he" // ← Region policy (IL → he)
    }
  }
}
```

---

### Scenario 3: Spanish Query (Edge Case)

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "restaurantes en madrid",
    "uiLanguage": "en"
  }'
```

**Check Log:**

```json
{
  "detectedQueryLanguage": "en", // May detect as "en" (Spanish not supported)
  "intentLanguage": "es", // LLM detects Spanish (logged for transparency)
  "assistantLanguage": "en", // ← Uses detectedQueryLanguage (deterministic)
  "searchLanguage": "en"
}
```

**Expected:** `assistantLanguage` = `detectedQueryLanguage`, NOT `intentLanguage`

---

## Validation Checklist

| Check                                | Command                                 | Expected Result                        |
| ------------------------------------ | --------------------------------------- | -------------------------------------- |
| ✅ Language tests pass               | `npm test -- language-context.test.ts`  | 28/28 ✅                               |
| ✅ Schema tests pass                 | `npm test -- textsearch-schema.test.ts` | 55/55 ✅                               |
| ✅ assistantLanguage = queryLanguage | Check logs                              | ALWAYS equal                           |
| ✅ Assistant source deterministic    | Check logs                              | `query_language_deterministic`         |
| ✅ No OpenAI 400 errors              | `grep "400.*textQuery" logs`            | 0 results                              |
| ✅ searchLanguage from region        | Check logs                              | `region_policy:IL` or `global_default` |
| ✅ intentLanguage logged             | Check logs                              | Present (transparency)                 |
| ✅ providerLanguagePolicy visible    | Check logs                              | `"regionDefault"`                      |

---

## Troubleshooting

### Problem: assistantLanguage != queryLanguage

**Symptom:** Logs show different values  
**Cause:** Old code still running?  
**Fix:** Restart server, clear cache

### Problem: OpenAI 400 "missing textQuery"

**Symptom:** 400 errors in logs  
**Cause:** Schema regression  
**Fix:** Run schema tests, check `assertStrictSchema`

### Problem: Language tests fail

**Symptom:** Some tests failing  
**Cause:** Code changes broke invariants  
**Fix:** Review changes to `language-context.ts`

---

## Quick Sanity Check (30 seconds)

```bash
# 1. Run tests
npm test -- language-context.test.ts 2>&1 | grep "pass"

# 2. Check logs
tail -100 server/logs/server.log | grep "language_context_resolved" | tail -1

# 3. Verify key fields
# - assistantLanguage = detectedQueryLanguage ✅
# - sources.assistantLanguage = "query_language_deterministic" ✅
# - no 400 errors ✅
```

---

**All Checks Passing?** → ✅ Ready for production!
