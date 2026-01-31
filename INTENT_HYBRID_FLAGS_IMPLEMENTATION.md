# Intent Stage Hybrid Ordering Flags - Implementation Summary

## Problem

Hybrid ordering system needed structured intent flags, but intent stage didn't output them. The orchestrator was deriving flags from keyword matching in `intentDecision.reason`, which was fragile and language-dependent.

## Solution

Updated intent stage to output **structured, language-agnostic intent flags** via LLM JSON schema:

- `distanceIntent`, `openNowRequested`, `priceIntent`, `qualityIntent`, `occasion`, `cuisineKey`
- LLM extracts semantic intent regardless of language
- Same query in Hebrew/English → same flags
- No keyword tables - pure LLM JSON output

---

## Files Modified

### 1. `server/src/services/search/route2/stages/intent/intent.types.ts`

**Changes:**

- ✅ Added 6 new fields to `IntentLLMSchema`:
  - `distanceIntent: z.boolean()`
  - `openNowRequested: z.boolean()`
  - `priceIntent: z.enum(['cheap', 'any'])`
  - `qualityIntent: z.boolean()`
  - `occasion: z.enum(['romantic']).nullable()`
  - `cuisineKey: z.string().nullable()`

**Code:**

```typescript
export const IntentLLMSchema = z
  .object({
    route: z.enum(["TEXTSEARCH", "NEARBY", "LANDMARK"]),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    language: z.enum(["he", "en", "ru", "ar", "fr", "es", "other"]),
    languageConfidence: z.number().min(0).max(1),
    regionCandidate: z.string().regex(/^[A-Z]{2}$/),
    regionConfidence: z.number().min(0).max(1),
    regionReason: z.string().min(1),
    cityText: z.string().min(1).nullable().optional(),

    // ===== NEW: Hybrid Ordering Intent Flags (Language-Agnostic) =====
    distanceIntent: z.boolean(),
    openNowRequested: z.boolean(),
    priceIntent: z.enum(["cheap", "any"]),
    qualityIntent: z.boolean(),
    occasion: z.enum(["romantic"]).nullable(),
    cuisineKey: z.string().nullable(),
  })
  .strict();
```

### 2. `server/src/services/search/route2/stages/intent/intent.prompt.ts`

**Changes:**

- ✅ Updated `INTENT_SYSTEM_PROMPT` with comprehensive flag extraction guidelines
- ✅ Added examples for each flag type
- ✅ Emphasized language-agnostic semantic intent detection
- ✅ Updated `INTENT_JSON_SCHEMA` to include all 6 new required fields

**Key Prompt Sections:**

```
**NEW: Hybrid Ordering Intent Flags (Language-Agnostic)**

These flags drive deterministic weight adjustments for result ordering.
Set these flags based on SEMANTIC INTENT, not language/keywords.
The same query in different languages should produce the SAME flags.

1. **distanceIntent** (boolean):
   - true if: "near me", "לידי", "קרוב", "בקרבתי", "close by", "nearby"
   - true if: route=NEARBY (proximity implied)

2. **openNowRequested** (boolean):
   - true if: "open now", "פתוח עכשיו", "open right now", "currently open"

3. **priceIntent** ("cheap" | "any"):
   - "cheap" if: "cheap", "זול", "inexpensive", "budget", "affordable"

4. **qualityIntent** (boolean):
   - true if: "best", "הכי טוב", "recommended", "מומלץ", "romantic", "רומנטי"

5. **occasion** ("romantic" | null):
   - "romantic" if: "romantic", "רומנטי", "date night", "דייט", "anniversary"

6. **cuisineKey** (string | null):
   - Extract canonical cuisine identifier: "italian", "japanese", "asian", etc.

**CRITICAL:** These flags are language-independent!
- "romantic italian" (en) and "איטלקית רומנטית" (he) → SAME flags
```

**JSON Schema Update:**

```json
{
  "properties": {
    ...existing fields...,
    "distanceIntent": { "type": "boolean" },
    "openNowRequested": { "type": "boolean" },
    "priceIntent": { "type": "string", "enum": ["cheap", "any"] },
    "qualityIntent": { "type": "boolean" },
    "occasion": { "type": ["string", "null"], "enum": ["romantic", null] },
    "cuisineKey": { "type": ["string", "null"] }
  },
  "required": [
    ...existing fields...,
    "distanceIntent",
    "openNowRequested",
    "priceIntent",
    "qualityIntent",
    "occasion",
    "cuisineKey"
  ]
}
```

### 3. `server/src/services/search/route2/stages/intent/intent.stage.ts`

**Changes:**

- ✅ Updated `createFallbackResult()` to include default values for new flags
- ✅ Updated NEARBY fallback return to pass through all intent flags
- ✅ Updated main return statement to pass through all intent flags

**Fallback Defaults:**

```typescript
function createFallbackResult(query: string, isTimeout: boolean): IntentResult {
  return {
    ...existing fields...,
    // NEW: Default hybrid ordering flags for fallback
    distanceIntent: false,
    openNowRequested: false,
    priceIntent: 'any',
    qualityIntent: false,
    occasion: null,
    cuisineKey: null
  };
}
```

### 4. `server/src/services/search/route2/types.ts`

**Changes:**

- ✅ Added 6 new fields to `IntentResult` interface

**Code:**

```typescript
export interface IntentResult {
  route: MappingRoute;
  confidence: number;
  reason: string;
  language: Gate2Language;
  languageConfidence: number;
  regionCandidate: string | null;
  regionConfidence: number;
  regionReason: string;
  cityText?: string;

  // ===== NEW: Hybrid Ordering Intent Flags (Language-Agnostic) =====
  distanceIntent: boolean;
  openNowRequested: boolean;
  priceIntent: "cheap" | "any";
  qualityIntent: boolean;
  occasion: "romantic" | null;
  cuisineKey: string | null;
}
```

### 5. `server/src/services/search/route2/orchestrator.response.ts`

**Changes:**

- ✅ Updated `buildFinalResponse` to use intent flags directly
- ✅ Removed keyword-based detection (was language-dependent)
- ✅ Added fallback logic for when intent doesn't provide flags (backward compatibility)

**Before (keyword-based detection):**

```typescript
// ❌ Language-dependent keyword matching
const qualityIntent =
  intentDecision.reason?.includes("quality") ||
  intentDecision.reason?.includes("recommended") ||
  intentDecision.reason?.includes("romantic") ||
  false;

const distanceIntent =
  intentDecision.reason?.includes("nearby") ||
  intentDecision.reason?.includes("proximity") ||
  false;
```

**After (use intent flags directly):**

```typescript
// ✅ Language-agnostic structured flags from LLM
const hybridContext: HybridWeightContext = {
  method: mapping.providerMethod === "nearbySearch" ? "nearby" : "textsearch",
  hasUserLocation: !!ctx.userLocation,
  // Use intent flags directly (already language-agnostic)
  distanceIntent: intentDecision.distanceIntent ?? false,
  openNowRequested: intentDecision.openNowRequested ?? false,
  priceIntent: intentDecision.priceIntent ?? derivedPriceIntent,
  qualityIntent: intentDecision.qualityIntent ?? false,
  occasion: intentDecision.occasion ?? null,
  cuisineKey: intentDecision.cuisineKey ?? mapping.cuisineKey ?? null,
  requestId,
};
```

### 6. **NEW:** `server/src/services/search/route2/stages/intent/__tests__/intent-hybrid-flags.test.ts`

**Comprehensive Tests** - 13 test cases

**Test Suites:**

1. **Language-Agnostic Flag Detection** (6 tests)

   - Italian query in Hebrew vs English → same cuisineKey
   - Romantic query in Hebrew vs English → same qualityIntent + occasion
   - Near me query in Hebrew vs English → same distanceIntent
   - Cheap query in Hebrew vs English → same priceIntent
   - Open now query in Hebrew vs English → same openNowRequested
   - Complex query with multiple flags → all flags match across languages

2. **Schema Validation** (5 tests)

   - Accepts valid intent with all flags
   - Rejects intent missing flags
   - Rejects invalid priceIntent value
   - Rejects invalid occasion value
   - Accepts null values for nullable fields

3. **Default Values** (2 tests)
   - Default "any" for priceIntent
   - Default false for boolean flags

**Test Results:** ✅ **All 13 tests pass** (3/3 suites)

---

## Language-Agnostic Examples

### Example 1: Italian Restaurant

**Hebrew Query:** "מסעדות איטלקיות בתל אביב"
**English Query:** "Italian restaurants in Tel Aviv"

**Expected Flags (BOTH languages):**

```json
{
  "distanceIntent": false,
  "openNowRequested": false,
  "priceIntent": "any",
  "qualityIntent": false,
  "occasion": null,
  "cuisineKey": "italian"
}
```

### Example 2: Romantic Restaurant

**Hebrew Query:** "מסעדות רומנטיות"
**English Query:** "romantic restaurants"

**Expected Flags (BOTH languages):**

```json
{
  "distanceIntent": false,
  "openNowRequested": false,
  "priceIntent": "any",
  "qualityIntent": true,
  "occasion": "romantic",
  "cuisineKey": null
}
```

### Example 3: Cheap Pizza Near Me Open Now

**Hebrew Query:** "פיצה זולה לידי פתוח עכשיו"
**English Query:** "cheap pizza near me open now"

**Expected Flags (BOTH languages):**

```json
{
  "distanceIntent": true,
  "openNowRequested": true,
  "priceIntent": "cheap",
  "qualityIntent": false,
  "occasion": null,
  "cuisineKey": "italian"
}
```

---

## Verification Steps

### 1. Run Tests

```bash
cd server
npm test -- src/services/search/route2/stages/intent/__tests__/intent-hybrid-flags.test.ts
```

**Expected:** ✅ All 13 tests pass

### 2. Backend Logs Check

**Search: "מסעדות איטלקיות בגדרה"**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": ["BASE_BALANCED"],
  "ctx": {
    "cuisineKey": "italian",
    "distanceIntent": false,
    "openNowRequested": false,
    "priceIntent": "any",
    "qualityIntent": false,
    "occasion": null
  }
}
```

**Search: "מסעדות רומנטיות"**

```bash
grep "order_weights_resolved" server/logs/server.log | tail -1
```

**Expected:**

```json
{
  "event": "order_weights_resolved",
  "reasonCodes": ["BASE_BALANCED", "RULE_D_QUALITY"],
  "ctx": {
    "cuisineKey": null,
    "distanceIntent": false,
    "openNowRequested": false,
    "priceIntent": "any",
    "qualityIntent": true,
    "occasion": "romantic"
  }
}
```

### 3. Language-Agnostic Verification

Perform the SAME semantic search in two languages:

**Test A - Hebrew:** "מסעדות רומנטיות בתל אביב"
**Test B - English:** "romantic restaurants in Tel Aviv"

**Expected:**

- ✅ Both have `qualityIntent: true`
- ✅ Both have `occasion: "romantic"`
- ✅ Both have `cuisineKey: null`
- ✅ Both apply `RULE_D_QUALITY`
- ✅ Both produce identical weights (40/35/5/10/10)

**Verify in logs:**

```bash
# Hebrew search
grep "order_weights_resolved" server/logs/server.log | grep "romantic" | tail -1

# English search
grep "order_weights_resolved" server/logs/server.log | grep "romantic" | tail -1

# Compare ctx.qualityIntent and ctx.occasion - should be identical
```

---

## Integration Flow

### End-to-End Data Flow

```
User Query: "מסעדות רומנטיות בתל אביב"
   ↓
[1] Intent Stage (LLM)
   → Outputs: {
       route: "TEXTSEARCH",
       language: "he",
       cityText: "תל אביב",
       qualityIntent: true,      ← NEW
       occasion: "romantic",     ← NEW
       cuisineKey: null,         ← NEW
       distanceIntent: false,    ← NEW
       openNowRequested: false,  ← NEW
       priceIntent: "any"        ← NEW
     }
   ↓
[2] Route-LLM Stage
   → Generates mapping (textQuery, etc.)
   ↓
[3] Google Places API
   → Returns raw results
   ↓
[4] Filters & Ranking
   ↓
[5] Response Builder
   → Builds HybridWeightContext from intent flags:
     {
       method: "textsearch",
       hasUserLocation: true,
       distanceIntent: false,           ← From intent
       openNowRequested: false,         ← From intent
       priceIntent: "any",              ← From intent
       qualityIntent: true,             ← From intent
       occasion: "romantic",            ← From intent
       cuisineKey: null                 ← From intent
     }
   ↓
[6] Hybrid Order Weights
   → Applies RULE_D_QUALITY
   → Returns: { rating: 40, reviews: 35, distance: 10, ... }
   ↓
[7] Response
   → meta.order.weights = { rating: 40, reviews: 35, ... }
   → Client displays: "Order: Balanced ⚙️"
   → Weights: ⭐ 40%  💬 35%  📍 10%  🟢 10%  💰 5%
```

---

## Schema Prompt Examples

### Example Prompt for Italian Query

**User Query:** "מסעדות איטלקיות בגדרה"

**LLM Response:**

```json
{
  "route": "TEXTSEARCH",
  "confidence": 0.9,
  "reason": "explicit_city_mentioned",
  "language": "he",
  "languageConfidence": 0.95,
  "regionCandidate": "IL",
  "regionConfidence": 0.9,
  "regionReason": "hebrew_query",
  "cityText": "גדרה",
  "distanceIntent": false,
  "openNowRequested": false,
  "priceIntent": "any",
  "qualityIntent": false,
  "occasion": null,
  "cuisineKey": "italian"
}
```

### Example Prompt for Romantic Query

**User Query:** "מסעדות רומנטיות כשרות בתל אביב"

**LLM Response:**

```json
{
  "route": "TEXTSEARCH",
  "confidence": 0.9,
  "reason": "explicit_city_mentioned",
  "language": "he",
  "languageConfidence": 0.95,
  "regionCandidate": "IL",
  "regionConfidence": 0.9,
  "regionReason": "hebrew_query",
  "cityText": "תל אביב",
  "distanceIntent": false,
  "openNowRequested": false,
  "priceIntent": "any",
  "qualityIntent": true,
  "occasion": "romantic",
  "cuisineKey": null
}
```

### Example Prompt for Complex Query

**User Query:** "cheap italian near me open now"

**LLM Response:**

```json
{
  "route": "NEARBY",
  "confidence": 0.9,
  "reason": "near_me_phrase",
  "language": "en",
  "languageConfidence": 0.95,
  "regionCandidate": "US",
  "regionConfidence": 0.8,
  "regionReason": "english_query",
  "cityText": null,
  "distanceIntent": true,
  "openNowRequested": true,
  "priceIntent": "cheap",
  "qualityIntent": false,
  "occasion": null,
  "cuisineKey": "italian"
}
```

---

## Backward Compatibility

### Fallback Logic

The orchestrator includes fallback logic for when intent doesn't provide flags (e.g., old cached responses, fallback mode):

```typescript
const hybridContext: HybridWeightContext = {
  method: mapping.providerMethod === "nearbySearch" ? "nearby" : "textsearch",
  hasUserLocation: !!ctx.userLocation,
  // Use intent flags directly, with fallbacks
  distanceIntent: intentDecision.distanceIntent ?? false,
  openNowRequested: intentDecision.openNowRequested ?? filters.openNow === true,
  priceIntent: intentDecision.priceIntent ?? derivedPriceIntent,
  qualityIntent: intentDecision.qualityIntent ?? false,
  occasion: intentDecision.occasion ?? null,
  cuisineKey: intentDecision.cuisineKey ?? mapping.cuisineKey ?? null,
  requestId,
};
```

**Fallback Sources:**

- `openNowRequested`: Falls back to `filters.openNow`
- `priceIntent`: Falls back to derived from `filters.priceLevel`
- `cuisineKey`: Falls back to `mapping.cuisineKey` (from textsearch mapper)
- Others: Default to safe values (false, null, 'any')

---

## PASS Criteria

### ✅ Must Pass (Critical)

1. **Schema validation:**

   - ✅ All 6 new fields are required in IntentLLMSchema
   - ✅ JSON schema enforces types (boolean, enum, nullable)
   - ✅ Missing fields → schema validation fails

2. **Language-agnostic:**

   - ✅ "romantic" (en) and "רומנטי" (he) → both set `qualityIntent: true, occasion: "romantic"`
   - ✅ "cheap" (en) and "זול" (he) → both set `priceIntent: "cheap"`
   - ✅ "near me" (en) and "לידי" (he) → both set `distanceIntent: true`

3. **Integration:**

   - ✅ Orchestrator uses intent flags directly
   - ✅ No keyword tables or string matching
   - ✅ Flags flow through to hybrid weight resolution

4. **Tests:**
   - ✅ All 13 intent flag tests pass
   - ✅ Tests verify language-agnostic behavior

---

## Summary

### What Changed

- ✅ Added 6 language-agnostic intent flags to IntentLLMSchema
- ✅ Updated prompt with comprehensive flag extraction guidelines
- ✅ Updated JSON schema with new required fields
- ✅ Updated fallback logic to include default flag values
- ✅ Updated IntentResult interface in types.ts
- ✅ Updated orchestrator to use intent flags directly (no keyword matching)
- ✅ Added 13 comprehensive tests (all passing)

### What's Now Language-Agnostic

- cuisineKey: "italian" detected from both "איטלקית" (he) and "italian" (en)
- qualityIntent: true for both "רומנטי" (he) and "romantic" (en)
- distanceIntent: true for both "לידי" (he) and "near me" (en)
- priceIntent: "cheap" for both "זול" (he) and "cheap" (en)
- openNowRequested: true for both "פתוח עכשיו" (he) and "open now" (en)

### PASS Criteria Met

- ✅ Intent outputs structured flags via LLM JSON schema
- ✅ No keyword tables (pure LLM extraction)
- ✅ Language-agnostic (same semantic query → same flags)
- ✅ Tests verify Hebrew/English produce identical flags
- ✅ uiLanguage drives narration, but ordering flags are language-independent
- ✅ All 13 tests pass

The intent stage now provides clean, structured, language-agnostic flags that drive the hybrid ordering system! 🎉
