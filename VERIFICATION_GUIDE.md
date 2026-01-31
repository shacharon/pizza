# Quick Verification Guide

## ✅ What Was Fixed

### 1. OpenAI 400 Schema Error

**Before:** Missing `textQuery` in required array → OpenAI rejected the schema  
**After:** All properties now in required array → Schema valid ✅

### 2. Language Logging Clarity

**Before:** `queryLanguage: "en"` for Spanish queries (misleading)  
**After:** `detectedQueryLanguage: "en"`, `intentLanguage: "es"` (accurate)

## 🧪 How to Verify

### Step 1: Run Tests

```bash
cd server
npm test -- src/services/search/route2/stages/route-llm/static-schemas.test.ts
```

**Expected:** ✅ 11/11 tests passing

### Step 2: Start Server & Test Live

```bash
cd server
npm run dev
```

### Step 3: Run Problem Query

From your Angular app or Postman:

```json
{
  "query": "Restaurante asiático en Tel Aviv",
  "uiLanguage": "en",
  "regionCode": "IL"
}
```

### Step 4: Check Logs

Look for these log events in `server/logs/server.log`:

#### ✅ Schema Check (Should be Valid)

```json
{
  "event": "schema_check_before_llm",
  "schemaValid": true,  // ← Should be true now!
  "schemaProperties": ["providerMethod", "textQuery", "region", ...],
  "schemaRequired": ["providerMethod", "textQuery", "region", ...],
  "missingRequired": undefined  // ← Should be undefined (no missing fields)
}
```

#### ✅ No OpenAI 400 Error

**Before:** You would see this error:

```json
{
  "errorReason": "400 Invalid schema... Missing 'textQuery'"
}
```

**After:** No 400 error, mapper succeeds ✅

#### ✅ Language Logging

```json
{
  "event": "language_context_resolved",
  "detectedQueryLanguage": "en", // ← From deterministic detector (may be inaccurate)
  "intentLanguage": "es", // ← From LLM (accurate for Spanish query!)
  "assistantLanguage": "en",
  "searchLanguage": "he", // ← Based on region (IL → Hebrew)
  "providerLanguage": "he" // ← Alias for searchLanguage
}
```

## 📊 Success Indicators

| Indicator         | Before                               | After                               |
| ----------------- | ------------------------------------ | ----------------------------------- |
| OpenAI 400 error  | ❌ Every textsearch query            | ✅ None                             |
| Schema validation | ❌ Failed silently                   | ✅ Passes with assertion            |
| Language logging  | ❌ `queryLanguage:"en"` (misleading) | ✅ `intentLanguage:"es"` (accurate) |
| Fallback usage    | ⚠️ Always (due to 400)               | ✅ Only when needed                 |
| Test coverage     | ⚠️ Partial                           | ✅ Full schema validation           |

## 🔍 What Changed in Code

### File 1: `static-schemas.ts`

```typescript
// BEFORE
required: [
  "providerMethod",
  "region",
  "language",
  "reason",
  "strictness",
  "typeHint",
];

// AFTER
required: [
  "providerMethod",
  "textQuery",
  "region",
  "language",
  "reason",
  "cuisineKey",
  "requiredTerms",
  "preferredTerms",
  "strictness",
  "typeHint",
];
```

### File 2: `textsearch.mapper.ts`

```typescript
// ADDED: Schema validation
assertStrictSchema(TEXTSEARCH_JSON_SCHEMA, 'TEXTSEARCH_JSON_SCHEMA');

// ENHANCED: Logging
logger.info({
  schemaProperties: [...],
  schemaRequired: [...],
  missingRequired: [...]  // Shows what's missing
});
```

### File 3: `language-context.ts`

```typescript
// BEFORE
logger.info({ queryLanguage: context.queryLanguage });

// AFTER
logger.info({
  detectedQueryLanguage: context.queryLanguage, // Clearer name
  intentLanguage: input.intentLanguage, // More accurate
  providerLanguage: context.searchLanguage, // Explicit alias
});
```

## 🚨 Rollback Plan (if needed)

If issues arise, revert these 4 files:

```bash
git checkout HEAD -- \
  server/src/services/search/route2/stages/route-llm/static-schemas.ts \
  server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts \
  server/src/services/search/route2/shared/language-context.ts \
  server/src/services/search/route2/stages/route-llm/static-schemas.test.ts
```

## ✅ Ready to Merge?

- [x] All unit tests passing (11/11)
- [x] No linter errors
- [x] No breaking changes to public APIs
- [x] Fallback behavior preserved
- [ ] Manual test with Spanish query (pending server restart)

**Status:** Ready for final verification 🚀
