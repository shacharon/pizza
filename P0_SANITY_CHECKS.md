# P0 Refactor - Sanity Check Guide

**Purpose**: Verify that LLM-driven query handling works correctly without deterministic overrides.

---

## Quick Test Queries

### Test 1: Generic Hebrew Query (No Cuisine)
**Query**: `"מה יש לאכול היום"` (What is there to eat today)

**Expected Behavior**:
- ✅ Route-LLM produces canonical query (may rewrite to "מסעדות" or keep conversational)
- ✅ `normalizeTextQuery` returns query unchanged (`reason: 'noop_llm_driven'`)
- ✅ NO deterministic "מסעדות" rewrite in normalizer
- ✅ `cuisineKey: null` (no override should add cuisine)
- ✅ `strictness: 'RELAX_IF_EMPTY'`

**Log Events to Check**:
```json
{
  "event": "textquery_normalized",
  "reason": "noop_llm_driven",
  "wasNormalized": false
}
```

**Should NOT See**:
```json
{
  "event": "cuisine_detected_deterministic_override"
}
```

---

### Test 2: Generic English Query (No Cuisine)
**Query**: `"what to eat today"`

**Expected Behavior**:
- ✅ Route-LLM produces canonical query
- ✅ `normalizeTextQuery` returns query unchanged
- ✅ NO deterministic rewrite
- ✅ `cuisineKey: null`
- ✅ `strictness: 'RELAX_IF_EMPTY'`

---

### Test 3: Explicit Cuisine + City (Hebrew)
**Query**: `"מסעדות איטלקיות בגדרה"` (Italian restaurants in Gedera)

**Expected Behavior**:
- ✅ Route-LLM detects cuisine: `cuisineKey: 'italian'`
- ✅ Route-LLM sets: `strictness: 'STRICT'`
- ✅ `requiredTerms: ['איטלקית', 'איטלקי']`
- ✅ NO deterministic override needed (LLM got it right)
- ✅ `textQuery` contains both cuisine and city

**Log Events to Check**:
```json
{
  "event": "canonical_query_applied",
  "originalTextQuery": "מסעדות איטלקיות בגדרה",
  "canonicalTextQuery": "מסעדה איטלקית גדרה"
}
```

---

### Test 4: Generic Query (No Cuisine) - Regression Check
**Query**: `"מסעדות בגדרה"` (Restaurants in Gedera - NO cuisine)

**Expected Behavior**:
- ✅ Route-LLM: `cuisineKey: null`
- ✅ Route-LLM: `strictness: 'RELAX_IF_EMPTY'`
- ✅ NO deterministic override (this was the bug!)
- ✅ `textQuery: "מסעדות גדרה"` or similar (city preserved)

**CRITICAL CHECK**: Ensure NO false positive cuisine detection.

**Should NOT See**:
```json
{
  "event": "cuisine_detected_deterministic_override",
  "cuisineKey": "italian",  // ❌ FALSE POSITIVE
  "reason": "llm_missed_cuisine"
}
```

---

## How to Run Tests

### Option 1: Server Logs (Manual)
1. Start server: `npm run dev`
2. Watch logs: `tail -f server/logs/server.log`
3. Send search requests via API/frontend
4. Verify log events match expected behavior above

### Option 2: Unit Tests (If Available)
```bash
npm test -- cuisine-enforcement.test.ts
```

**Note**: Tests now validate fallback behavior only (when LLM fails).

---

## What Changed vs. Before

| Query | Old Behavior (With Override) | New Behavior (LLM-Driven) |
|-------|----------------------------|---------------------------|
| "מה יש לאכול היום" | Rewritten to "מסעדות" by normalizer | LLM decides (no forced rewrite) |
| "מסעדות בגדרה" | Override adds `cuisineKey: 'italian'` ❌ | LLM: `cuisineKey: null` ✅ |
| "מסעדות איטלקיות בגדרה" | LLM detects cuisine, override agrees | LLM detects cuisine (no override needed) |

---

## Expected Log Flow

**Happy Path (LLM Success)**:
```
1. textsearch_mapper: LLM completeJSON called
2. canonical_query_applied: LLM canonical query used
3. textquery_normalized: reason='noop_llm_driven' (no rewrite)
4. bias_applied: location bias set
5. google_textsearch_request: Query sent to Google
```

**Fallback Path (LLM Failure)**:
```
1. textsearch_mapper: LLM failed (timeout/error)
2. textsearch_mapper_fallback: Using deterministic mapping
3. deterministic_cuisine_city_pattern: Built fallback query (if cuisine+city detected)
4. google_textsearch_request: Query sent to Google
```

---

## Troubleshooting

### Issue: No results for cuisine queries
**Possible Cause**: LLM not detecting cuisine correctly  
**Solution**: Check LLM prompt tuning in `TEXTSEARCH_MAPPER_PROMPT` (lines 20-61)  
**Verify**: Log `mapping.cuisineKey` value - should be set for explicit cuisine queries

### Issue: Too many results (non-relevant)
**Possible Cause**: Generic queries being treated as cuisine queries  
**Solution**: This should be FIXED now (no more false positives from override)  
**Verify**: Log `strictness` value - should be `RELAX_IF_EMPTY` for generic queries

### Issue: Conversational queries failing
**Possible Cause**: Canonical query generator not handling edge cases  
**Solution**: Check `canonical-query.generator.ts` output  
**Verify**: Log `canonicalTextQuery` - should be concise, Google-friendly

---

## Success Criteria

✅ All 4 test queries return relevant results  
✅ No `cuisine_detected_deterministic_override` events in logs  
✅ `normalizeTextQuery` always returns `reason: 'noop_llm_driven'`  
✅ Generic queries (no cuisine) have `cuisineKey: null`  
✅ Explicit cuisine queries have `cuisineKey` set by LLM (not override)

---

## Rollback Trigger

If any of these occur, consider rollback:

1. **Regression**: Generic queries start returning non-relevant cuisine-specific results
2. **Loss of cuisine enforcement**: Explicit cuisine queries don't filter properly
3. **LLM failures**: Canonical query generator produces gibberish

**Rollback Command**: See `REFACTOR_SUMMARY_P0.md` for instructions.

---

**Last Updated**: 2026-01-31  
**Related**: `REFACTOR_SUMMARY_P0.md`
