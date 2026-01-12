# Search Intent Contract

**Status:** Authoritative  
**Version:** 1.0  
**Created:** January 12, 2026  
**Purpose:** Define the exact intent schema the LLM may output

---

## Overview

This document defines the **canonical intent schema** that the LLM must output during intent detection. It establishes a clear boundary between what the LLM understands (intent) and what the system executes (search behavior).

**Key Principle:** Intent describes user desire, not system behavior.

**This contract is final.** All LLM prompts, intent parsing, and validation must conform to this schema.

---

## 1. Intent Schema

### Core Structure

```typescript
{
  // ANCHORS (Required for search)
  foodAnchor: {
    type: string;           // "pizza", "sushi", "italian"
    present: boolean;       // True if food type detected
  },

  locationAnchor: {
    text: string;           // "Tel Aviv", "Allenby Street", "near me"
    type: "city" | "street" | "poi" | "gps";
    present: boolean;       // True if location intent detected
  },
  
  nearMe: boolean;          // True if user said "near me", "קרוב אליי"

  // USER-SPECIFIED DISTANCE (Explicit only)
  explicitDistance: {
    meters: number | null;      // e.g., 500 for "within 500m"
    originalText: string | null; // e.g., "within 500m", "up to 3km"
  },

  // FILTERS (User preferences, NOT execution rules)
  preferences: {
    dietary?: string[];      // ["vegan", "gluten_free"] - supports multiple
    priceLevel?: 1 | 2 | 3 | 4;  // User's desired price range
    openNow?: boolean;           // User wants currently open places
    delivery?: boolean;          // User wants delivery option
    takeout?: boolean;           // User wants takeout option
  },

  // METADATA
  language: "he" | "en" | "ar" | "ru";
  confidence: number;  // 0-1, LLM's confidence in extraction
  originalQuery: string;
}
```

### What's Included

- ✅ Food type/cuisine the user mentioned
- ✅ Location the user mentioned
- ✅ Near-me intent (if user wants GPS-based search)
- ✅ Explicit user-specified distance (only if stated)
- ✅ User preferences (dietary, price, open now)
- ✅ Query language
- ✅ Confidence in extraction

### What's FORBIDDEN

- ❌ Default radius values (only explicit user distance allowed)
- ❌ Search center coordinates
- ❌ Filter execution instructions
- ❌ Ranking weights
- ❌ API parameters
- ❌ Execution strategy

---

## 2. Intent vs Execution Separation

### Intent Layer (LLM Domain)

```
User says: "cheap vegan pizza in Tel Aviv"

LLM outputs: {
  foodAnchor: { type: "pizza", present: true },
  locationAnchor: { text: "Tel Aviv", type: "city", present: true },
  nearMe: false,
  explicitDistance: { meters: null, originalText: null },
  preferences: { dietary: ["vegan"], priceLevel: 1 },
  language: "en",
  confidence: 0.95,
  originalQuery: "cheap vegan pizza in Tel Aviv"
}
```

### Execution Layer (Code Domain)

```
Code receives intent and:
1. Geocodes "Tel Aviv" → coordinates + radius (2000m for city)
2. Constructs Places API query
3. Applies dietary filter to results
4. Ranks by price level match
5. Returns results
```

**Boundary:** LLM stops at intent. Code starts at execution.

---

## 3. Field-by-Field Rules

### 3.1 foodAnchor

**Purpose:** What food/cuisine the user wants

**Rules:**
- Extract explicit food mentions only
- "pizza" → `{ type: "pizza", present: true }`
- "something to eat" → `{ type: "", present: false }`
- "food" → `{ type: "", present: false }` (too broad)

**Forbidden:**
- ❌ Inferring food type from context without explicit mention
- ❌ Defaulting to generic "restaurant"
- ❌ Expanding to related cuisines

---

### 3.2 locationAnchor + nearMe

**Purpose:** Where the user wants to search

**Rules:**
- Extract location text exactly as mentioned
- Classify type: city, street, poi, gps
- "Tel Aviv" → `{ text: "Tel Aviv", type: "city", present: true }`, `nearMe: false`
- "near me" / "קרוב אליי" → `{ text: "near me", type: "gps", present: true }`, `nearMe: true`
- No location mentioned → `{ text: "", type: "", present: false }`, `nearMe: false`

**Near-Me Intent:**
- If user says "near me", "nearby", "קרוב אליי": Set `nearMe: true` AND `locationAnchor.present: true`
- Location intent exists (user wants location-based search)
- Whether GPS coords are available is handled by code (Full vs Assisted search)

**Forbidden:**
- ❌ Deciding radius values (unless explicitly stated by user)
- ❌ Converting to coordinates
- ❌ Defaulting to popular cities
- ❌ Inferring location from previous context (unless explicit continuation)

---

### 3.3 explicitDistance

**Purpose:** User's explicitly stated distance constraint

**Rules:**
- Extract ONLY if user explicitly states a distance
- "within 500m" → `{ meters: 500, originalText: "within 500m" }`
- "up to 3 kilometers" → `{ meters: 3000, originalText: "up to 3 kilometers" }`
- No distance mentioned → `{ meters: null, originalText: null }`

**Critical:**
- LLM MAY extract explicit user-specified distance
- LLM MUST NOT set default distances
- Code still decides search center, mode, and execution

**Forbidden:**
- ❌ Setting default distances
- ❌ Inferring distance from location type
- ❌ Estimating or guessing distance preferences

---

### 3.4 preferences

**Purpose:** User's stated preferences (not filters)

**Rules:**
- Extract only what user explicitly mentioned
- `dietary`: Array of dietary requirements - ["vegan"], ["kosher", "gluten_free"]
- `priceLevel`: User said "cheap" (1-2), "expensive" (3-4)
- `openNow`: User said "open now", "currently open"
- `delivery`: User said "delivery", "משלוחים"
- `takeout`: User said "takeout", "take away"

**Multiple Dietary Requirements:**
- "vegan and gluten-free" → `dietary: ["vegan", "gluten_free"]`
- "kosher vegetarian" → `dietary: ["kosher", "vegetarian"]`

**Forbidden:**
- ❌ Adding filters user didn't mention
- ❌ Inferring preferences from demographics
- ❌ Defaulting missing preferences

---

### 3.5 language

**Purpose:** Detected query language

**Rules:**
- Detect from user's query text
- Return ISO code: "he", "en", "ar", "ru"
- Default to "en" if uncertain

**Forbidden:**
- ❌ Using browser language instead of query language
- ❌ Mixing languages in response

---

### 3.6 confidence

**Purpose:** LLM's confidence in extraction

**Rules:**
- 0.0 - 1.0 scale
- High confidence (≥0.8): Clear, unambiguous query
- Medium (0.5-0.8): Some ambiguity
- Low (<0.5): Very unclear or missing anchors

**Forbidden:**
- ❌ Using confidence to decide execution strategy (code's job)

---

## 4. Examples

### Example 1: Full Intent

```json
User: "pizza in Tel Aviv, open now"

Intent: {
  "foodAnchor": { "type": "pizza", "present": true },
  "locationAnchor": { "text": "Tel Aviv", "type": "city", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": { "openNow": true },
  "language": "en",
  "confidence": 0.95,
  "originalQuery": "pizza in Tel Aviv, open now"
}
```

### Example 2: Missing Location

```json
User: "פיצה"

Intent: {
  "foodAnchor": { "type": "pizza", "present": true },
  "locationAnchor": { "text": "", "type": "", "present": false },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "he",
  "confidence": 0.85,
  "originalQuery": "פיצה"
}
```

### Example 3: Missing Food

```json
User: "what's good in Tel Aviv"

Intent: {
  "foodAnchor": { "type": "", "present": false },
  "locationAnchor": { "text": "Tel Aviv", "type": "city", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "en",
  "confidence": 0.7,
  "originalQuery": "what's good in Tel Aviv"
}
```

### Example 4: Dietary + Price

```json
User: "vegan sushi, not expensive, Jerusalem"

Intent: {
  "foodAnchor": { "type": "sushi", "present": true },
  "locationAnchor": { "text": "Jerusalem", "type": "city", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": { "dietary": ["vegan"], "priceLevel": 2 },
  "language": "en",
  "confidence": 0.9,
  "originalQuery": "vegan sushi, not expensive, Jerusalem"
}
```

### Example 5: Street-Level

```json
User: "burger on Rothschild"

Intent: {
  "foodAnchor": { "type": "burger", "present": true },
  "locationAnchor": { "text": "Rothschild", "type": "street", "present": true },
  "nearMe": false,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "en",
  "confidence": 0.85,
  "originalQuery": "burger on Rothschild"
}
```

### Example 6: Near Me

```json
User: "pizza near me"

Intent: {
  "foodAnchor": { "type": "pizza", "present": true },
  "locationAnchor": { "text": "near me", "type": "gps", "present": true },
  "nearMe": true,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": {},
  "language": "en",
  "confidence": 0.9,
  "originalQuery": "pizza near me"
}
```

### Example 7: Explicit Distance

```json
User: "sushi within 500 meters"

Intent: {
  "foodAnchor": { "type": "sushi", "present": true },
  "locationAnchor": { "text": "", "type": "", "present": false },
  "nearMe": false,
  "explicitDistance": { "meters": 500, "originalText": "within 500 meters" },
  "preferences": {},
  "language": "en",
  "confidence": 0.85,
  "originalQuery": "sushi within 500 meters"
}
```

### Example 8: Multiple Dietary + Near Me

```json
User: "kosher gluten-free pizza קרוב אליי"

Intent: {
  "foodAnchor": { "type": "pizza", "present": true },
  "locationAnchor": { "text": "קרוב אליי", "type": "gps", "present": true },
  "nearMe": true,
  "explicitDistance": { "meters": null, "originalText": null },
  "preferences": { "dietary": ["kosher", "gluten_free"] },
  "language": "he",
  "confidence": 0.9,
  "originalQuery": "kosher gluten-free pizza קרוב אליי"
}
```

---

## 5. Explicit Boundaries (What LLM MUST NOT Do)

### Forbidden Zone 1: Radius & Distance

❌ **LLM MUST NOT:**
- Decide default radius values
- Estimate distances not stated by user
- Choose between near/far thresholds
- Suggest "expand search" radius

✅ **LLM MAY:**
- Extract location type (city, street, poi, gps)
- Set `nearMe: true` when user says "near me"
- Extract explicit user-specified distance ONLY when stated

**Examples:**

```json
// ✅ CORRECT
User: "pizza nearby"
{ 
  "nearMe": true, 
  "locationAnchor": { "type": "gps", "present": true },
  "explicitDistance": { "meters": null, "originalText": null }
}

// ✅ CORRECT
User: "pizza within 500 meters"
{
  "nearMe": false,
  "explicitDistance": { "meters": 500, "originalText": "within 500 meters" }
}

// ❌ FORBIDDEN
{
  "radius": 1000,  // LLM deciding default radius
  "searchCenter": { "lat": 32.07, "lng": 34.78 }  // LLM choosing coordinates
}
```

---

### Forbidden Zone 2: Search Center Coordinates

❌ **LLM MUST NOT:**
- Convert city names to coordinates
- Geocode addresses
- Provide lat/lng values
- Choose default locations

✅ **LLM MAY:**
- Extract location text as-is
- Classify location type

---

### Forbidden Zone 3: Filter Execution

❌ **LLM MUST NOT:**
- Decide which results to filter out
- Apply dietary filters
- Filter by price
- Filter by open/closed
- Order filtering precedence

✅ **LLM MAY:**
- Extract user's dietary preference
- Extract user's price preference
- Note user wants "open now"

---

### Forbidden Zone 4: Ranking & Scoring

❌ **LLM MUST NOT:**
- Decide ranking weights
- Order results
- Score restaurants
- Suggest "best match" criteria
- Prioritize factors (distance vs rating)

✅ **LLM MAY:**
- Extract what user values ("highly rated", "closest")
- Include in preferences as text

---

## 6. Validation Rules

### Valid Intent Checklist

- [ ] Only contains schema-defined fields
- [ ] No radius, coordinates, or API parameters
- [ ] No execution instructions
- [ ] Confidence is 0-1 float
- [ ] Language is valid ISO code
- [ ] foodAnchor.present reflects actual detection
- [ ] locationAnchor.present reflects actual detection
- [ ] nearMe is boolean
- [ ] explicitDistance.meters is null OR positive number
- [ ] preferences.dietary is array (if present)

### Invalid Intent Examples

```json
// ❌ Contains radius (execution detail)
{
  "foodAnchor": { "type": "pizza", "present": true },
  "radius": 1000
}

// ❌ Contains coordinates (execution detail)
{
  "foodAnchor": { "type": "pizza", "present": true },
  "searchCenter": { "lat": 32.07, "lng": 34.78 }
}

// ❌ Contains ranking weights (execution detail)
{
  "foodAnchor": { "type": "pizza", "present": true },
  "rankingWeights": { "distance": 0.5, "rating": 0.3 }
}
```

---

## 7. Compliance with SEARCH_TRUTH_MODEL.md

### Anchor Alignment

- Intent schema requires both foodAnchor and locationAnchor
- `present` field maps to SEARCH_TRUTH_MODEL anchor requirements
- LLM detects anchors, code decides search mode (Full vs Assisted)

### Separation Alignment

- Intent = LLM Domain ✅
- Radius, filtering, ranking = Deterministic Domain ✅
- No overlap

### Language Alignment

- Intent.language drives all downstream i18n
- Matches SEARCH_TRUTH_MODEL language invariants

---

## 8. Usage Contract

### For LLM Prompt Engineers

- Use this schema in all intent extraction prompts
- Validate LLM output against this schema
- Reject non-compliant outputs

### For Backend Developers

- Accept only this intent schema
- Never extend schema without updating this document
- Treat intent as read-only input

### For QA/Validation

- Test intent extraction against examples
- Verify no forbidden fields in LLM output
- Check compliance with SEARCH_TRUTH_MODEL

---

## 9. Integration

This contract integrates with:

- **[SEARCH_TRUTH_MODEL.md](SEARCH_TRUTH_MODEL.md)**: Defines anchor model and separation of responsibilities
- **Phase 1 Implementation**: Deterministic resolvers consume this intent schema

**Hierarchy:**
```
SEARCH_INTENT_CONTRACT.md  ← LLM output format (this document)
    ↓
Deterministic Resolvers     ← Code layer (Phase 1)
    ↓
Search Execution           ← Places API calls
```

---

**Version:** 1.0  
**Last Updated:** January 12, 2026  
**Next Review:** After LLM prompt implementation

