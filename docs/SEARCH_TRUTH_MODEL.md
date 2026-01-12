# Search Truth Model

**Status:** Authoritative  
**Version:** 1.0  
**Created:** January 12, 2026  
**Purpose:** Constitutional document defining search behavior, boundaries, and responsibilities

---

## Overview

This document defines the **core search truth model** for the food discovery product. It establishes what the system is and is not, the separation of responsibilities between LLM and deterministic code, the concept of anchors, and high-level rules for search execution.

**This document is the source of truth.** All future decisions about search behavior, filtering, ranking, and assistant behavior must be validated against these principles.

---

## 1. System Identity & Boundaries

### What the System IS

A **language-first food discovery engine** that combines:

- **Search Engine**: Deterministic, provider-backed restaurant search
- **Language Assistant**: Natural language understanding and contextual guidance

**Core Principle:** Understanding, not inventing.

The system understands user intent and executes precise searches against real data sources. The assistant explains and guides, but never fabricates results.

### What the System IS NOT

- ❌ **AI guessing engine** - Does not infer or hallucinate restaurants
- ❌ **Recipe finder** - Not for cooking at home
- ❌ **General chatbot** - Food discovery only
- ❌ **Restaurant database** - Does not maintain proprietary listings
- ❌ **Booking platform** - Does not handle reservations
- ❌ **Menu scraper** - Does not aggregate menus

**Scope:** Food and restaurant discovery through natural language queries.

---

## 2. Separation of Responsibilities

### LLM Domain (Language & Intent)

The LLM is responsible for **understanding** and **explaining**, never for **deciding** or **executing**.

**LLM Responsibilities:**

1. **Natural language → Structured intent**
   - Extract food type/cuisine from user text
   - Extract location from user text
   - Extract filters (price, dietary, open now)
   - Detect language (Hebrew, English, Arabic, Russian)

2. **Intent Detection**
   - Classify query intent (search, refine, check status)
   - Determine confidence level
   - Identify ambiguous queries requiring clarification

3. **Explanations & Narration**
   - Generate contextual messages in user's language
   - Explain why results match the query
   - Guide recovery when no results found
   - Select actions from pre-generated allowlist

**LLM Temperature & Constraints:**

- Intent parsing: Temperature 0.1-0.2 (deterministic)
- Narration: Temperature 0.3 (slightly creative)
- Timeout: 5-8 seconds maximum
- Fallback: Deterministic i18n templates if LLM fails

### Deterministic Domain (Search Execution & Truth)

All search execution, filtering, ranking, and state detection is **code-only**. No LLM involvement.

**Deterministic Responsibilities:**

1. **Search Execution**
   - API calls to Places providers (Google, etc.)
   - Query construction (textsearch, nearbysearch, findplace)
   - Result retrieval and pagination

2. **Filtering (Hard Constraints)**
   - Distance radius (eliminates out-of-radius results)
   - Open/closed status (`openNow` filter)
   - Price level constraints
   - Dietary filters (self-reported data only)

3. **Distance Calculation**
   - Haversine formula for coordinates
   - Deterministic, no estimation

4. **Ranking & Scoring**
   - Scoring algorithm based on: rating, distance, price match, open status
   - Deterministic precedence rules
   - No ML-based ranking

5. **Grouping**
   - Granularity detection (city, street, POI)
   - Distance-based grouping rules

6. **State Detection**
   - No results detection
   - Low confidence detection
   - API failure detection
   - Live data unavailability detection

7. **Chip Generation**
   - Context-aware filter/sort chips
   - Recovery chips
   - Clarification chips
   - All labels from i18n (no LLM generation)

### Immutable Boundary

**LLM output NEVER overrides deterministic truth.**

Examples of forbidden LLM behavior:

- ❌ Claiming a restaurant is "open now" when `openNow !== true`
- ❌ Inventing a restaurant name or address
- ❌ Changing result ordering or scoring
- ❌ Adding filters not in the original intent
- ❌ Inferring dietary compatibility from descriptions
- ❌ Estimating distance or price without data

**If the LLM generates conflicting information, the deterministic value wins.**

---

## 3. Anchor Model

### Definition

An **anchor** is a required component of user intent that allows search execution.

**Two Anchor Types:**

1. **Food Anchor**: Explicit food type, cuisine, or category
   - Examples: "pizza", "sushi", "Italian restaurant", "burger"
   - NOT valid: "food", "restaurant", "place to eat" (too broad)

2. **Location Anchor**: City, coordinates, or resolvable place
   - Examples: "Tel Aviv", GPS coordinates, "near Azrieli Center"
   - NOT valid: "nearby", "around here" (without GPS)

### Search Execution Rules

```
IF (Food Anchor present) AND (Location Anchor present):
  → Execute FULL SEARCH
  
IF (Food Anchor present) AND (Location Anchor missing):
  → Enter ASSISTED SEARCH mode
  → Attempt location resolution (GPS or city fallback)
  → If location resolved: Execute search with transparency
  → If location unresolved: CLARIFY mode (ask for location)
  
IF (Food Anchor missing):
  → CLARIFY mode (ask for food anchor)
  → NO search execution
```

### Full Search vs Assisted Search

**Full Search:**
- Both anchors explicitly provided by user
- Example: "pizza in Tel Aviv"
- No ambiguity, immediate execution

**Assisted Search:**
- Food anchor provided, location resolved via GPS or fallback
- Example: User says "pizza", system uses GPS location
- System must be transparent: "Searching for pizza near your location"
- If GPS unavailable and no fallback: Enter CLARIFY mode

### Why Both Anchors Are Required

**Food Anchor:**
- Prevents broad queries like "show me restaurants" → 1000 results
- Ensures user has specific intent
- REQUIRED for all searches

**Location Anchor:**
- Defines search boundary (radius, city)
- Required for full search
- May be assisted via GPS or fallback, but must be transparent
- If unresolvable: Must ask user

**No search is executed without both anchors present or resolved.**

---

## 4. High-Level Rules

### 4.1 Dietary Handling

**Source of Truth:** Restaurant self-reported data only.

**Rules:**

1. **No Inference**
   - LLM never guesses dietary compatibility from descriptions
   - No "this sounds vegan" or "probably kosher"
   - Filter only on explicit provider data

2. **Filtering Mechanism**
   - Deterministic filter: `dietary.vegan === true`
   - Binary decision (yes/no), no confidence scores

3. **Mandatory Disclaimer**
   - When dietary filter active, ALWAYS show disclaimer
   - Example: "Based on restaurant-reported information"
   - Displayed in UI, included in assistant message

4. **No Validation**
   - System trusts provider data (Google Places, etc.)
   - Does not verify or validate dietary claims
   - Does not cross-reference with reviews or descriptions

5. **Supported Dietary Types**
   - Vegan
   - Vegetarian
   - Kosher
   - Halal
   - Gluten-free

**Dietary Integrity:** Self-reported data + mandatory disclaimer = user informed decision.

---

### 4.2 Distance & Radius

**Distance Calculation:** Haversine formula (deterministic, code-only).

**Radius as Hard Filter:**
- Results outside the radius are **ELIMINATED** (not returned)
- Radius is a hard constraint, not a ranking factor alone
- Users see only in-radius results

**Radius Defaults (v1 Rules):**

| Query Type | Radius |
|------------|--------|
| **Near-me** (GPS-based) | 500–1000 meters |
| **City** | 2000 meters |
| **Street** | 200 meters |
| **POI / Landmark** | 1000 meters |

**Ranking Factor:**
- Distance affects score **ONLY within the in-radius result set**
- Closer results rank higher (all else being equal)
- Distance never eliminates results that passed radius filter

**Hard Constraints:**
- Radius: Eliminates out-of-radius results
- `openNow`: Eliminates closed restaurants (when filter active)

**Example:**

```
Query: "pizza near me"
User Location: (32.07, 34.78)
Radius: 500 meters

Step 1: Fetch all pizza places within 500m (HARD FILTER)
Step 2: Rank by distance + rating + price within those results
Step 3: Return top N
```

**No results at 501 meters appear, regardless of rating.**

---

### 4.3 Assistant Role

**Purpose:** Explain, guide, contextualize. Never decide or modify.

**The Assistant MAY:**

1. **Explain Results**
   - Why results match the query
   - What factors influenced ranking
   - Reference user's original query

2. **Suggest Actions**
   - Select actions from pre-generated chip allowlist
   - Guide user to next best action
   - Offer recovery strategies when no results

3. **Provide Context**
   - Explain search constraints (radius, filters)
   - Clarify ambiguous queries
   - Guide refinement

4. **Adapt Tone**
   - Reassurance in normal mode
   - Helpful guidance in recovery mode
   - Question-based in clarify mode

**The Assistant MUST NOT:**

1. ❌ **Modify Result Ordering**
   - Cannot re-rank results
   - Cannot promote/demote restaurants
   - Cannot insert "recommendations" not in the ranked list

2. ❌ **Invent Restaurants**
   - Cannot suggest restaurants not in the result set
   - Cannot hallucinate names, addresses, or details

3. ❌ **Claim Unverified Status**
   - Cannot say "open now" without `openNow === true`
   - Cannot claim "cheap" without `priceLevel <= 2`
   - Cannot claim "nearby" without calculated distance

4. ❌ **Override Deterministic State**
   - Cannot change `failureReason`
   - Cannot alter confidence scores
   - Cannot modify filters

5. ❌ **Create New Filters**
   - Can only reference pre-generated chips
   - Cannot invent new filtering criteria

6. ❌ **Hallucinate Facts**
   - Cannot guess menu items
   - Cannot estimate prices not provided
   - Cannot infer hours of operation

**Principle:** The assistant amplifies truth, never contradicts it.

**Example of Correct Behavior:**

```
User: "pizza open now in Tel Aviv"
Results: [{ name: "Pizzeria A", openNow: true, rating: 4.3 }]
Assistant: "I found Pizzeria A, currently open with a 4.3★ rating."
```

**Example of Forbidden Behavior:**

```
User: "pizza open now in Tel Aviv"
Results: [{ name: "Pizzeria A", openNow: 'UNKNOWN', rating: 4.3 }]
Assistant: "I found Pizzeria A, currently open with a 4.3★ rating." ❌
```

**Correct recovery:**

```
Assistant: "I found Pizzeria A (4.3★), but I can't verify if it's open right now. Would you like to see the closest options?"
```

---

## 5. Truth Verification

### Verifiable Facts (Code-Only)

These facts are **deterministic** and come from provider APIs or calculations:

| Fact | Source | Type |
|------|--------|------|
| `openNow` | Places API `opening_hours.open_now` | Boolean |
| `priceLevel` | Places API `price_level` | Integer (1-4) |
| `rating` | Places API `rating` | Float (0-5) |
| `reviewCount` | Places API `user_ratings_total` | Integer |
| `distance` | Calculated (Haversine) | Float (meters) |
| `location` | Places API `geometry.location` | Coordinates |
| `address` | Places API `formatted_address` | String |

**These facts are never inferred, estimated, or guessed by the LLM.**

### Unverifiable Claims (FORBIDDEN)

The assistant must NOT make these claims without supporting data:

| Claim | Allowed Only If |
|-------|-----------------|
| "Best pizza in town" | Explicitly from ranking explanation (e.g., "top-ranked") |
| "Cheap" | `priceLevel <= 2` |
| "Expensive" | `priceLevel >= 3` |
| "Open now" | `openNow === true` |
| "Closed" | `openNow === false` |
| "Nearby" | `distance` calculated and within threshold |
| "Highly rated" | `rating >= 4.5` |
| "Popular" | `reviewCount >= threshold` |

**Rule:** If data is missing or unknown, the assistant says so explicitly.

---

## 6. Validation Checklist

Use this checklist to validate any search behavior change:

### Anchor Validation
- [ ] Food anchor present?
- [ ] Location anchor present or resolvable?
- [ ] Full search or assisted search mode correct?
- [ ] Clarify mode triggered when anchors missing?

### Distance Validation
- [ ] Radius applied as hard filter?
- [ ] Correct radius default for query type?
- [ ] Distance ranking applied only within in-radius set?
- [ ] No out-of-radius results returned?

### Dietary Validation
- [ ] Filter applied on self-reported data only?
- [ ] No LLM inference of dietary compatibility?
- [ ] Mandatory disclaimer shown?

### Assistant Validation
- [ ] Assistant explains but does not modify results?
- [ ] No unverified claims (open/closed without data)?
- [ ] No hallucinated restaurants?
- [ ] Chips selected from allowlist only?

### Truth Validation
- [ ] All facts from deterministic sources?
- [ ] No LLM overriding provider data?
- [ ] Unknown data acknowledged, not guessed?

---

## 7. Design Principles

This model enforces five core principles:

1. **Clarity over Flexibility**
   - Explicit rules, no ambiguity
   - Binary decisions where possible
   - No "it depends" without clear criteria

2. **Determinism over ML**
   - Search is code, not trained models
   - Ranking is algorithmic, not learned
   - Filters are boolean, not probabilistic

3. **Anchors over Broad Search**
   - Require intent, prevent spam
   - No "show me everything" queries
   - User must specify what and where

4. **Disclaimers over Trust**
   - Self-reported data acknowledged
   - System does not validate claims
   - User makes informed decision

5. **Explanation over Silence**
   - Assistant always contextualizes
   - Failures explained, not hidden
   - Transparency in all modes

---

## 8. Integration with Existing Documents

This document is the **constitutional layer** and integrates with:

- **[PHASE_0_SYSTEM_DEFINITION.md](PHASE_0_SYSTEM_DEFINITION.md)**: Technical boundaries, LLM usage limits
- **[SYSTEM_TOOLS_AND_OPTIONS.md](SYSTEM_TOOLS_AND_OPTIONS.md)**: UI controls, chips, actions
- **[COMPREHENSIVE_TEST_COVERAGE.md](COMPREHENSIVE_TEST_COVERAGE.md)**: Test cases validating these rules

**Hierarchy:**
```
SEARCH_TRUTH_MODEL.md          ← Principles (this document)
    ↓
PHASE_0_SYSTEM_DEFINITION.md   ← Technical implementation
    ↓
SYSTEM_TOOLS_AND_OPTIONS.md    ← UI manifestation
```

**All PRs, features, and refactors must reference compliance with this model.**

---

## 9. Non-Compliance Examples

### Example 1: Location Anchor Violation

❌ **Incorrect:**
```
User: "pizza"
System: [Executes full search using default city]
```

✅ **Correct:**
```
User: "pizza"
System: [Enters ASSISTED mode, attempts GPS]
If GPS available: "Searching for pizza near your location..."
If GPS unavailable: "Where would you like to search for pizza?"
```

### Example 2: Distance Filter Violation

❌ **Incorrect:**
```
Query: "pizza near me" (radius: 500m)
Results: 10 restaurants (2 within 500m, 8 within 2km)
Ranking: All 10 ranked by rating, closest not prioritized
```

✅ **Correct:**
```
Query: "pizza near me" (radius: 500m)
Results: 2 restaurants (only within 500m)
Ranking: Closest first, then by rating
```

### Example 3: Assistant Hallucination

❌ **Incorrect:**
```
User: "vegan pizza in Tel Aviv"
Results: [{ name: "Pizzeria A", dietary: { vegan: false } }]
Assistant: "Pizzeria A has vegan options available."
```

✅ **Correct:**
```
User: "vegan pizza in Tel Aviv"
Results: []
Assistant: "I didn't find restaurants with reported vegan options. Try expanding your search?"
```

---

## 10. Conclusion

This document defines the **immutable search truth model** for the food discovery product.

**Key Takeaways:**

1. **Anchors are Required**: Both food and location (explicit or assisted)
2. **Radius is Hard**: Eliminates out-of-radius results
3. **LLM Understands, Code Executes**: Clear separation of responsibilities
4. **Assistant Explains, Never Modifies**: Transparency over cleverness
5. **Truth is Deterministic**: No guessing, no hallucinating

**This model is final and authoritative.**

Any deviation from these principles requires explicit documentation and justification.

---

**Version:** 1.0  
**Last Updated:** January 12, 2026  
**Next Review:** After major feature release or architectural change

