# Assistant SUMMARY Upgrade - Insight-Based Narration

**Date:** 2026-01-29  
**Status:** ✅ COMPLETE

## Summary

Upgraded the Assistant SUMMARY messages from generic "found X results" text to intelligent, insight-based narration that provides context and suggestions based on search results metadata.

## Problem

Previously, SUMMARY messages were generic and unhelpful:
- ❌ "מצאתי 12 מסעדות שמתאימות לחיפוש שלך" (Found 12 restaurants matching your search)
- ❌ "Found 12 restaurants matching your search."
- No context about why results look this way
- No suggestions for improving or refining search

## Solution

### New Approach: Insight-Based Narration

SUMMARY messages now provide:
1. **One short insight** - Why results look this way
2. **Optional suggestion** - How to narrow or expand search
3. **Based on real metadata** - No invented data

**Rules:**
- ✅ NO generic "thank you" or "found X results" phrases
- ✅ Use ONLY existing metadata (resultsCount, openNowCount, hour, radius, filtersApplied)
- ✅ Max 2 sentences total
- ✅ Same language as user query
- ✅ Assistant layer ONLY (no deterministic logic changes)

## Implementation

### 1. Enhanced Metadata in Context

**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts`

Added `metadata` field to `AssistantSummaryContext`:

```typescript
export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  top3Names: string[];
  // NEW: Insight metadata for intelligent narration
  metadata?: {
    openNowCount?: number;     // How many results are currently open
    currentHour?: number;       // Current hour (0-23) for time-based insights
    radiusKm?: number;          // Search radius in kilometers
    filtersApplied?: string[];  // Active filters
  };
  dietaryNote?: {
    type: 'gluten-free';
    shouldInclude: boolean;
  };
}
```

### 2. Intelligent Prompt

**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts` (lines 139-180)

Updated LLM prompt to generate insight-based narration:

**Key Instructions:**
1. NO generic phrases like "thank you", "here are", "found X results"
2. Provide ONE short insight (why results look this way) based on metadata
3. Optionally suggest: narrow search (filters, rating), expand search (radius, remove filters), or time-based advice
4. Use ONLY existing metadata - DO NOT invent weather, delivery, availability
5. Max 2 sentences total

**Examples Provided to LLM:**
- (Hebrew) "רוב המקומות סגורים עכשיו בשעה מאוחרת. אפשר לסנן לפתוח עכשיו או לחפש למחר."
- (English) "Most places are rated highly in this area. Try sorting by closest if you want nearby options."

### 3. Updated Fallback Messages

**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts` (lines 419-457, 462-500)

Deterministic fallbacks now also use insight-based approach:

**Hebrew Fallbacks:**
```typescript
// No results
'לא מצאתי תוצאות. נסה להרחיב רדיוס חיפוש או להסיר סינון.'

// Most places closed
'רוב המקומות סגורים עכשיו. אפשר לסנן ל"פתוח עכשיו" או לחפש שוב מאוחר יותר.'

// Default insight
'יש כמה אפשרויות טובות באזור. אפשר למיין לפי מרחק או דירוג.'
```

**English Fallbacks:**
```typescript
// No results
'No results found. Try expanding search radius or removing filters.'

// Most places closed
'Most places are closed right now. Filter by "open now" or search again later.'

// Default insight
'Several good options in the area. Sort by distance or rating to refine.'
```

### 4. Metadata Collection in Orchestrator

**File:** `server/src/services/search/route2/orchestrator.response.ts` (lines 43-73)

Calculate and pass metadata when creating SUMMARY context:

```typescript
// Calculate metadata for intelligent narration
const openNowCount = finalResults.filter((r: any) => r.isOpenNow === true).length;
const currentHour = new Date().getHours();
const radiusKm = (mapping as any).radiusMeters 
  ? Math.round((mapping as any).radiusMeters / 1000) 
  : undefined;
const appliedFilters = buildAppliedFiltersArray(filtersForPostFilter);

const assistantContext: AssistantSummaryContext = {
  // ... existing fields ...
  metadata: {
    openNowCount,
    currentHour,
    radiusKm,
    filtersApplied: appliedFilters.length > 0 ? appliedFilters : undefined
  }
};
```

## Example Outputs

### Before (Generic)
```
מצאתי 12 מסעדות שמתאימות לחיפוש שלך.
```

### After (Insight-Based)

**Scenario: Late night, most closed**
```
רוב המקומות סגורים בשעה מאוחרת. אפשר לסנן ל"פתוח עכשיו" או לחפש ליד סנטר עירוני.
```

**Scenario: Many results, no filters**
```
יש הרבה אפשרויות באזור. כדאי למיין לפי מרחק או לסנן לדירוג גבוה.
```

**Scenario: Few results with filters**
```
יש רק כמה אפשרויות עם הסינון הזה. אפשר להרחיב רדיוס או להסיר חלק מהסינון.
```

**Scenario: Good mix of open places**
```
יש כמה מקומות פתוחים עכשיו. אפשר למיין לפי דירוג למקומות הכי מומלצים.
```

## Metadata Available

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `resultCount` | number | Total results | 12 |
| `openNowCount` | number | Currently open | 4 |
| `currentHour` | number | Hour (0-23) | 22 |
| `radiusKm` | number | Search radius | 5 |
| `filtersApplied` | string[] | Active filters | ['OPEN_NOW', 'kosher'] |
| `top3Names` | string[] | Top 3 restaurant names | ['Pizza Shop', 'Burger Place', 'Sushi Bar'] |

## Suggestion Types

The LLM can suggest:
1. **Narrow search**: Add filters (open now, rating, price)
2. **Expand search**: Remove filters, increase radius
3. **Time-based**: Search at different time, check later
4. **Sort/organize**: Sort by distance, rating, price

## Technical Details

### Changes Made

1. **`assistant-llm.service.ts`**
   - Added `metadata` field to `AssistantSummaryContext` interface
   - Updated SUMMARY prompt with metadata context and instructions
   - Updated Hebrew and English fallback messages to be insight-based

2. **`orchestrator.response.ts`**
   - Calculate `openNowCount` from results (`isOpenNow === true`)
   - Get `currentHour` from system time
   - Extract `radiusKm` from mapping
   - Get `appliedFilters` from existing `buildAppliedFiltersArray()` function
   - Pass metadata to assistant context

### Schema Unchanged

- Output schema remains the same (type, message, question, suggestedAction, blocksSearch)
- No changes to WebSocket protocol
- No changes to frontend components
- Fully backward compatible

### Assistant Layer Only

- ✅ All changes in assistant LLM service
- ✅ Metadata calculation in response builder (read-only)
- ❌ No deterministic logic changes
- ❌ No policy changes
- ❌ No filter behavior changes

## Data Safety

**DO NOT Invent:**
- ❌ Weather conditions
- ❌ Delivery availability
- ❌ Specific restaurant availability
- ❌ Traffic conditions
- ❌ Events or special occasions

**DO Use:**
- ✅ Result counts
- ✅ Open/closed status (from API)
- ✅ Current time
- ✅ Applied filters
- ✅ Search radius

## Testing

### Manual Testing Scenarios

1. **Late night search (22:00-04:00)**
   - Expected: Mention time, suggest "open now" filter or search during day

2. **Many results (>20) with no filters**
   - Expected: Suggest filtering/sorting to narrow down

3. **Few results (<5) with filters active**
   - Expected: Suggest expanding radius or removing filters

4. **Many open places during lunch (12:00-14:00)**
   - Expected: Positive insight, suggest sorting by rating or distance

5. **Zero results**
   - Expected: Suggest expanding radius or removing filters

### LLM Validation

- Language enforcement still active
- Format validation (max 2 sentences) still active
- Invariants enforced (blocksSearch=false, suggestedAction=NONE)

## Benefits

✅ **More helpful** - Provides context and actionable suggestions  
✅ **User-friendly** - No jargon, natural language  
✅ **Intelligent** - Adapts to situation (time, filters, results)  
✅ **Safe** - Uses only real metadata, no invented data  
✅ **Multilingual** - Works in Hebrew and English  
✅ **Consistent** - Fallbacks also use insight-based approach  

## Files Changed

1. `server/src/services/search/route2/assistant/assistant-llm.service.ts`
   - Added metadata field to AssistantSummaryContext interface
   - Updated SUMMARY prompt with intelligent instructions
   - Updated Hebrew and English fallback messages

2. `server/src/services/search/route2/orchestrator.response.ts`
   - Calculate and pass metadata (openNowCount, currentHour, radiusKm, filtersApplied)

## Verification

✅ All TODOs completed  
✅ No linter errors  
✅ Schema unchanged (backward compatible)  
✅ Assistant layer only (no deterministic logic)  
✅ Fallbacks updated  
✅ Language enforcement preserved  
