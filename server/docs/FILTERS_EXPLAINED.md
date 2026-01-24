# Filters Explained - Route2 Pipeline

## Overview

The Route2 pipeline has **3 filter layers** that work together to extract, resolve, and apply search constraints:

```
User Query: "מסעדות איטלקיות פתוחות עכשיו בתל אביב"
            (Italian restaurants open now in Tel Aviv)

     ┌────────────────────────────────────────────┐
     │  1. BASE FILTERS (LLM)                     │
     │     Extract intent from natural language   │
     └──────────────┬─────────────────────────────┘
                    │
                    ▼
     ┌────────────────────────────────────────────┐
     │  2. FILTER RESOLVER                        │
     │     Merge, validate, resolve conflicts     │
     └──────────────┬─────────────────────────────┘
                    │
                    ▼
     ┌────────────────────────────────────────────┐
     │  GOOGLE MAPS API                           │
     │  (gets ~20 results)                        │
     └──────────────┬─────────────────────────────┘
                    │
                    ▼
     ┌────────────────────────────────────────────┐
     │  3. POST FILTERS (Deterministic)           │
     │     Filter results after Google call       │
     └────────────────────────────────────────────┘
```

---

## 1. BASE FILTERS (LLM) 🤖

**File**: `server/src/services/search/route2/shared/base-filters-llm.ts`

### Purpose
Extract structured filter constraints from natural language query using LLM.

### Input
- User query (string)
- Query language hint

### Process
```
LLM Call (GPT-4o-mini)
├─ Timeout: 4000ms
├─ Schema: PreGoogleBaseFiltersSchema (Zod)
└─ Output: PreGoogleBaseFilters
```

### Output: `PreGoogleBaseFilters`
```typescript
{
  language: "he" | "en" | "auto",
  openState: "OPEN_NOW" | "OPEN_AT" | "OPEN_BETWEEN" | null,
  openAt: {
    day: 0-6 | null,        // 0=Sun, 6=Sat
    timeHHmm: "HH:mm" | null,
    timezone: string | null
  } | null,
  openBetween: {
    day: 0-6 | null,
    startHHmm: "HH:mm" | null,
    endHHmm: "HH:mm" | null,
    timezone: string | null
  } | null,
  regionHint: "IL" | "US" | null
}
```

### Examples

#### Example 1: "פתוחות עכשיו"
```json
{
  "language": "he",
  "openState": "OPEN_NOW",
  "openAt": null,
  "openBetween": null,
  "regionHint": "IL"
}
```

#### Example 2: "open at 9pm tomorrow"
```json
{
  "language": "en",
  "openState": "OPEN_AT",
  "openAt": {
    "day": 3,  // Tomorrow (if today is Tue)
    "timeHHmm": "21:00",
    "timezone": null
  },
  "openBetween": null,
  "regionHint": null
}
```

#### Example 3: "pizza restaurants"
```json
{
  "language": "en",
  "openState": null,
  "openAt": null,
  "openBetween": null,
  "regionHint": null
}
```

### Key Features
- ✅ Fast: 4s timeout
- ✅ Handles Hebrew & English
- ✅ Extracts temporal constraints (open now, at time, between times)
- ✅ Minimal fields (only what's needed for opening hours)

### Used By
- **Pre-Google**: Not directly (see Filter Resolver)
- **Post-Google**: Opening hours filtering

---

## 2. FILTER RESOLVER 🔧

**File**: `server/src/services/search/route2/shared/filters-resolver.ts`

### Purpose
Merge filters from multiple sources, validate, resolve conflicts, and prepare for Google API.

### Input Sources
1. **Base Filters** (from LLM)
2. **Intent** (from intent stage - language, region)
3. **Request Context** (userLocation, regionCode)

### Process
```
resolveFilters()
├─ Merge base filters + intent + context
├─ Validate consistency
├─ Resolve conflicts (e.g., language mismatch)
├─ Apply defaults
└─ Output: FinalSharedFilters
```

### Output: `FinalSharedFilters`
```typescript
{
  // From Intent
  language: "he" | "en" | "ru" | ...,
  region: "IL" | "US" | ...,
  
  // From Base Filters
  openState: "OPEN_NOW" | "OPEN_AT" | "OPEN_BETWEEN" | null,
  openAt: TemporalFilter | null,
  openBetween: TemporalRangeFilter | null,
  
  // Computed
  timezone: string  // e.g., "Asia/Jerusalem"
}
```

### Tightening Logic

**File**: `server/src/services/search/route2/shared/shared-filters.tighten.ts`

After resolving, filters are "tightened" to ensure consistency:

```typescript
tightenSharedFilters()
├─ If openState = "OPEN_NOW" → ensure openAt/openBetween are null
├─ If openAt exists → ensure openState = "OPEN_AT"
├─ If openBetween exists → ensure openState = "OPEN_BETWEEN"
├─ Validate temporal fields (day 0-6, time HH:mm format)
└─ Log inconsistencies for debugging
```

### Example Flow

#### Input
```javascript
// Base Filters (LLM)
{ openState: "OPEN_NOW", language: "he", regionHint: "IL" }

// Intent
{ language: "he", region: "IL" }

// Context
{ userRegionCode: "IL", timezone: "Asia/Jerusalem" }
```

#### Output
```javascript
{
  language: "he",
  region: "IL",
  openState: "OPEN_NOW",
  openAt: null,
  openBetween: null,
  timezone: "Asia/Jerusalem"
}
```

### Key Features
- ✅ Merges 3 sources (base filters, intent, context)
- ✅ Validates consistency
- ✅ Resolves conflicts (intent wins over base filters)
- ✅ Adds defaults (timezone from region)
- ✅ Type-safe with Zod validation

---

## 3. POST FILTERS (Deterministic) 🔍

**File**: `server/src/services/search/route2/post-filters/post-results.filter.ts`

### Purpose
Filter Google API results based on resolved filters. This is **deterministic** (no LLM), runs after Google API call.

### Input
- **Results**: Array of Google Place objects
- **Shared Filters**: FinalSharedFilters from resolver

### Process
```
applyPostFilters()
├─ For each result in results[]
│   ├─ Check opening hours against filters
│   │   ├─ openState = "OPEN_NOW" → check currentOpeningHours.openNow
│   │   ├─ openState = "OPEN_AT" → check if open at specific time
│   │   └─ openState = "OPEN_BETWEEN" → check if open in time range
│   └─ Keep or remove result
└─ Return filtered results + stats
```

### Opening Hours Logic (Tristate)

Google API returns 3 possible states for opening hours:
1. **KNOWN** - `currentOpeningHours` exists with `openNow: true/false`
2. **UNKNOWN** - `currentOpeningHours` missing or incomplete
3. **ERROR** - Parse error or invalid data

```typescript
// Tristate handling
if (openingHours === "UNKNOWN") {
  // Keep by default (don't remove unknowns)
  return true;
}

if (openingHours === "ERROR") {
  // Keep by default (don't remove errors)
  return true;
}

// KNOWN state - apply filter
if (filter.openState === "OPEN_NOW") {
  return openingHours.openNow === true;
}
```

### Output
```typescript
{
  resultsFiltered: Place[],  // Filtered results
  applied: {
    openState: "OPEN_NOW" | null,
    openAt: TemporalFilter | null,
    openBetween: TemporalRangeFilter | null
  },
  stats: {
    before: number,          // Input count
    after: number,           // Output count
    removed: number,         // Filtered out
    unknownExcluded: number  // Unknowns excluded (should be 0)
  }
}
```

### Example

#### Input
```javascript
// 20 Google results
// 5 have openNow=false
// 12 have openNow=true
// 3 have UNKNOWN opening hours

// Filter
{ openState: "OPEN_NOW" }
```

#### Output
```javascript
{
  resultsFiltered: [...],  // 15 results (12 open + 3 unknown)
  applied: { openState: "OPEN_NOW" },
  stats: {
    before: 20,
    after: 15,
    removed: 5,
    unknownExcluded: 0  // We keep unknowns by default
  }
}
```

### Key Features
- ✅ Deterministic (no LLM, no API calls)
- ✅ Fast (~1-5ms for 20 results)
- ✅ Tristate logic (KNOWN, UNKNOWN, ERROR)
- ✅ Conservative (keeps unknowns by default)
- ✅ Detailed stats for observability

---

## Complete Flow Example

### Query: "מסעדות איטלקיות פתוחות עכשיו בתל אביב"

```
┌────────────────────────────────────────────────────────────┐
│ 1. BASE FILTERS (LLM)                                      │
│ ────────────────────────────────────────────────────────── │
│ Input: "מסעדות איטלקיות פתוחות עכשיו בתל אביב"            │
│ Output:                                                     │
│   {                                                         │
│     language: "he",                                         │
│     openState: "OPEN_NOW",                                  │
│     openAt: null,                                           │
│     openBetween: null,                                      │
│     regionHint: "IL"                                        │
│   }                                                         │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 2. FILTER RESOLVER                                         │
│ ────────────────────────────────────────────────────────── │
│ Merge with Intent:                                         │
│   intent.language = "he"                                   │
│   intent.region = "IL"                                     │
│                                                             │
│ Add Context:                                               │
│   timezone = "Asia/Jerusalem"                              │
│                                                             │
│ Tighten:                                                   │
│   ✓ openState="OPEN_NOW" → openAt/openBetween = null      │
│                                                             │
│ Output (FinalSharedFilters):                               │
│   {                                                         │
│     language: "he",                                         │
│     region: "IL",                                           │
│     openState: "OPEN_NOW",                                  │
│     openAt: null,                                           │
│     openBetween: null,                                      │
│     timezone: "Asia/Jerusalem"                              │
│   }                                                         │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ GOOGLE MAPS API CALL                                       │
│ ────────────────────────────────────────────────────────── │
│ textSearch("מסעדה איטלקית תל אביב")                        │
│ → Returns 20 results                                       │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 3. POST FILTERS (Deterministic)                            │
│ ────────────────────────────────────────────────────────── │
│ For each of 20 results:                                    │
│   - 8 have openNow = false → REMOVE                        │
│   - 10 have openNow = true → KEEP                          │
│   - 2 have UNKNOWN → KEEP (by default)                     │
│                                                             │
│ Output:                                                     │
│   resultsFiltered: [12 results]                            │
│   stats: {                                                  │
│     before: 20,                                             │
│     after: 12,                                              │
│     removed: 8,                                             │
│     unknownExcluded: 0                                      │
│   }                                                         │
└────────────────────────────────────────────────────────────┘
                          ↓
                    Final Results
                    (12 restaurants)
```

---

## Timing Breakdown

```
BASE FILTERS (LLM):     ~1200ms  ⏱️ (LLM call)
FILTER RESOLVER:        ~1ms     ⚡ (in-memory merge)
GOOGLE API:             ~400ms   🌐 (network)
POST FILTERS:           ~3ms     ⚡ (deterministic)
────────────────────────────────────────────
TOTAL:                  ~1604ms
```

---

## Architecture Principles

### 1. Separation of Concerns
- **Base Filters**: Extract intent (LLM)
- **Resolver**: Merge & validate (deterministic)
- **Post Filters**: Apply constraints (deterministic)

### 2. Fail Safe
- **Base Filters** fail → Use empty filters, continue pipeline
- **Resolver** conflict → Intent wins, log warning
- **Post Filters** error → Return unfiltered results, log error

### 3. Observable
- Every stage logs input/output
- Timing tracked for each stage
- Stats returned (before/after counts)

### 4. Conservative
- Unknown opening hours → **Keep by default**
- Unparseable data → **Keep by default**
- Missing fields → **Use nulls, not errors**

---

## Common Patterns

### Pattern 1: "Open Now"
```
Base Filters → { openState: "OPEN_NOW" }
Resolver     → { openState: "OPEN_NOW", timezone: "Asia/Jerusalem" }
Post Filters → Keep only results with openNow=true (or UNKNOWN)
```

### Pattern 2: "Open at 9pm"
```
Base Filters → { openState: "OPEN_AT", openAt: { day: null, timeHHmm: "21:00" } }
Resolver     → Add timezone, validate time format
Post Filters → Check if place is open at 21:00 today/tomorrow
```

### Pattern 3: "Open between 6-10pm"
```
Base Filters → { openState: "OPEN_BETWEEN", openBetween: { startHHmm: "18:00", endHHmm: "22:00" } }
Resolver     → Add timezone, validate range
Post Filters → Check if place is open during 18:00-22:00 window
```

### Pattern 4: No time filter
```
Base Filters → { openState: null }
Resolver     → { openState: null }
Post Filters → Skip (no filtering applied)
```

---

## Testing

### Base Filters Test
```typescript
// Input
const query = "פתוחות עכשיו";

// Expected Output
{
  language: "he",
  openState: "OPEN_NOW",
  openAt: null,
  openBetween: null,
  regionHint: "IL"
}
```

### Filter Resolver Test
```typescript
// Input
const baseFilters = { openState: "OPEN_NOW", language: "he" };
const intent = { language: "he", region: "IL" };
const context = { userRegionCode: "IL" };

// Expected Output
{
  language: "he",
  region: "IL",
  openState: "OPEN_NOW",
  openAt: null,
  openBetween: null,
  timezone: "Asia/Jerusalem"
}
```

### Post Filters Test
```typescript
// Input
const results = [
  { id: "1", openNow: true },
  { id: "2", openNow: false },
  { id: "3", openingHours: "UNKNOWN" }
];
const filters = { openState: "OPEN_NOW" };

// Expected Output
{
  resultsFiltered: [
    { id: "1", openNow: true },
    { id: "3", openingHours: "UNKNOWN" }  // Kept!
  ],
  stats: { before: 3, after: 2, removed: 1 }
}
```

---

## Future Enhancements

- [ ] Cache Base Filters LLM responses (similar queries → same filters)
- [ ] Add more filter types (price, rating, dietary restrictions)
- [ ] Support complex time expressions ("every Friday evening")
- [ ] Add filter analytics (which filters are most common?)
- [ ] Implement filter suggestions (if no results, suggest relaxing filters)
