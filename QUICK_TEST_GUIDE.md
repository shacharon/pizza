# Quick Test Guide - Italian Restaurant Relevance Fix

## 🚀 Ready to Test

All code changes are complete and tested. Follow this guide to verify the fix works.

---

## Step 1: Start the Server

```bash
cd server
npm run dev
```

Wait for: `Server listening on port...`

---

## Step 2: Run the Problem Query

### From Your Angular App (Recommended)

1. Open the search page in your browser
2. Enter: **"מסעדות איטלקיות בגדרה"**
3. Submit search

### OR via Postman/cURL

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "מסעדות איטלקיות בגדרה",
    "uiLanguage": "he",
    "regionCode": "IL"
  }'
```

---

## Step 3: Check the Logs

Open `server/logs/server.log` and look for these events:

### ✅ Expected Success Indicators

**1. Cuisine Detection:**

```json
{
  "event": "cuisine_detected_deterministic",
  "cuisineKey": "italian",
  "strictness": "STRICT"
}
```

✅ Means: Cuisine keyword detected in query

**2. TextQuery Enhancement:**

```json
{
  "event": "cuisine_textquery_strengthened",
  "enhancedTextQuery": "מסעדה איטלקית גדרה"
}
```

OR

```json
{
  "event": "cuisine_textquery_unchanged",
  "reason": "already_contains_cuisine_term"
}
```

✅ Means: Google will receive query with cuisine terms

**3. Ranking Distance:**

```json
{
  "event": "ranking_distance_origin_selected",
  "origin": "CITY_CENTER",
  "cityText": "גדרה"
}
```

✅ Means: Results ranked from city center (not user location)

**4. NO Schema Errors:**

```json
{
  "event": "schema_check_before_llm",
  "schemaValid": true
}
```

✅ Means: Schema passes validation

**5. NO OpenAI 400:**
❌ Should NOT see:

```json
{
  "errorReason": "400 Invalid schema... Missing 'textQuery'"
}
```

---

## Step 4: Verify Results

### ✅ GOOD Results (Italian/Pizza)

Look for restaurant names containing:

- "איטלקית" (Italian)
- "פיצה" (Pizza)
- "פסטה" (Pasta)
- Italian restaurant names (e.g., "Luigi", "Trattoria", "Roma")

**Examples:**

- ✅ "אברטו" (Italian restaurant)
- ✅ "פיצה רומא" (Pizza Roma)
- ✅ Any pizzeria or Italian place

### ❌ BAD Results (Should Be Filtered Out)

- ❌ "שווארמה" (Shawarma)
- ❌ "חומוס" (Hummus)
- ❌ "בליקר בייקרי" (Bakery)
- ❌ Generic restaurants without cuisine context

---

## Step 5: Success Criteria

### Primary Goal: Top 10 Results

**BEFORE Fix:** Mixed (shawarma, hummus, bakery, generic)  
**AFTER Fix:** Majority Italian/pizza restaurants (7+/10)

### Secondary Goals

- ✅ No OpenAI 400 errors in logs
- ✅ `cuisineKey: "italian"` detected
- ✅ TextQuery includes "איטלקית" or strengthened
- ✅ Ranking from CITY_CENTER (Gedera)

---

## Troubleshooting

### If results still show non-Italian places:

1. **Check cuisine detection log:**

   - Search for `cuisine_detected_deterministic`
   - If missing: Check if query contains "איטלקי" or "איטלקית"

2. **Check textQuery sent to Google:**

   - Search for `textsearch_request_payload`
   - Look at `finalTextQuery` field
   - Should include cuisine term

3. **Check if mapper failed:**
   - Search for `textsearch_mapper LLM failed`
   - Should use fallback (which also detects cuisine)

### If you see schema errors:

1. **Check schema validation:**

   - Search for `schema_check_before_llm`
   - `schemaValid` should be `true`
   - `missingRequired` should be `undefined`

2. **If schema invalid:**
   - This means the fix didn't apply
   - Verify `static-schemas.ts` has all properties in `required` array

---

## Quick Comparison Test

Run these 3 queries and compare results:

1. **"מסעדות איטלקיות בגדרה"** (Italian restaurants in Gedera)

   - Expected: Mostly Italian/pizza

2. **"מסעדות בגדרה"** (Restaurants in Gedera - generic)

   - Expected: Mixed (no cuisine filter)

3. **"מסעדות אסייתיות בגדרה"** (Asian restaurants in Gedera)
   - Expected: Mostly Asian (tests if detection works for other cuisines)

---

## Performance Check

Compare before/after:

- **Latency:** Should be similar (~1-2s for full pipeline)
- **Cache hits:** Should work normally
- **No additional retries:** Cuisine enforcement should improve first-attempt results

---

## Files Changed

If you need to revert:

```bash
# Revert all changes
git checkout HEAD -- \
  server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts \
  server/src/services/search/route2/stages/google-maps/text-search.handler.ts \
  server/src/services/search/route2/stages/route-llm/canonical-query.generator.ts

# Restart server
npm run dev
```

---

## What Changed (Summary)

1. **Cuisine Detection:** Deterministic keyword matching for cuisines
2. **TextQuery Enhancement:** Adds cuisine terms if missing before Google call
3. **Canonical Query:** Preserves cuisine keywords (never removes)
4. **Ranking:** Uses city center for explicit city searches
5. **Tests:** 12 unit tests covering all scenarios

---

**Status:** ✅ Ready to test  
**Expected Result:** Italian restaurants (not shawarma/hummus)  
**Test Time:** ~2 minutes  
**Risk Level:** 🟢 LOW (deterministic, tested, backward compatible)
