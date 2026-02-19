# Opening Hours Filtering Architecture

## Overview
Extended opening hours filtering to support time-based queries in Route2 pipeline.

## Filter Types

### 1. OPEN_NOW / CLOSED_NOW (Simple)
- Uses `currentOpeningHours.openNow` boolean
- Filters at current moment
- Examples: "מסעדות פתוחות עכשיו", "closed restaurants"

### 2. OPEN_AT (Time-specific)
- Filters places open at specific time
- Examples: "פתוח ב-21:30", "open at 9pm", "פתוח מחר ב-20:00"
- Parameters:
  - `timeHHmm`: Required (e.g., "21:30")
  - `day`: Optional 0-6 (0=Sunday, 6=Saturday)
  - `timezone`: Optional (defaults to local)

### 3. OPEN_BETWEEN (Time range)
- Filters places open during entire time range
- Examples: "פתוח בין 18:00 ל-22:00", "open 6pm-10pm"
- Parameters:
  - `startHHmm`: Required
  - `endHHmm`: Required
  - `day`: Optional
  - `timezone`: Optional

## Architecture

### 1. BASE_FILTERS_LLM (Detection)
**File**: `shared/base-filters-llm.ts`  
**Purpose**: Extract time-based filters from query using LLM

**Output**:
```typescript
{
  language: 'he' | 'en' | 'auto',
  openState: 'OPEN_NOW' | 'CLOSED_NOW' | 'OPEN_AT' | 'OPEN_BETWEEN' | null,
  openAt: { day?: number, timeHHmm?: string } | null,
  openBetween: { day?: number, startHHmm: string, endHHmm: string } | null,
  regionHint: string | null
}
```

**Rules**:
- Default: `openState = null` (show all)
- Only set if user explicitly asks
- Extract time parameters when present

### 2. POST_RESULT_FILTER (Evaluation)
**File**: `post-filters/post-results.filter.ts`  
**Purpose**: Evaluate structured opening hours data

**Data Sources**:
1. `currentOpeningHours.openNow` - Current status (boolean)
2. `currentOpeningHours.periods` - Structured hours (primary)
3. `regularOpeningHours.periods` - Fallback if current unavailable
4. `utcOffsetMinutes` - Timezone info

**Evaluation Logic**:
- For `OPEN_NOW/CLOSED_NOW`: Use `openNow` boolean
- For `OPEN_AT`: Check if any period covers target time on target day
- For `OPEN_BETWEEN`: Check if place is open at both start AND end time
- Missing/unparseable data → exclude (defensive)

**Period Structure** (Google Places API New):
```javascript
{
  periods: [
    {
      open: { day: 0-6, hour: 0-23, minute: 0-59 },
      close: { day: 0-6, hour: 0-23, minute: 0-59 }
    }
  ]
}
```

### 3. Google API Field Mask
**File**: `stages/google-maps.stage.ts`  
**Fields**:
- `places.currentOpeningHours` - Current hours with openNow
- `places.regularOpeningHours` - Regular weekly schedule
- `places.utcOffsetMinutes` - Timezone offset

## Examples

### Query: "מסעדות פתוחות עכשיו"
```
BASE_FILTERS_LLM:
  openState: "OPEN_NOW"
  openAt: null
  openBetween: null

POST_RESULT_FILTER:
  Check: currentOpeningHours.openNow === true
  Exclude: UNKNOWN (missing openNow)
```

### Query: "פתוח ב-21:30 בגדרה"
```
BASE_FILTERS_LLM:
  openState: "OPEN_AT"
  openAt: { timeHHmm: "21:30" }
  openBetween: null

POST_RESULT_FILTER:
  Check: periods contain 21:30 on current day
  Convert 21:30 → 1290 minutes
  Match against period open/close times
  Exclude: Missing periods (UNKNOWN)
```

### Query: "מסעדות פתוחות בין 18:00 ל-22:00"
```
BASE_FILTERS_LLM:
  openState: "OPEN_BETWEEN"
  openAt: null
  openBetween: { startHHmm: "18:00", endHHmm: "22:00" }

POST_RESULT_FILTER:
  Check: Open at 18:00 AND open at 22:00
  Both must be true
  Exclude: Missing periods (UNKNOWN)
```

## Limitations & Defensive Behavior

1. **Missing Data**:
   - No `periods` → Exclude (return `null`)
   - No `openNow` for OPEN_NOW/CLOSED_NOW → Exclude

2. **Free Text**:
   - Do NOT parse `weekdayDescriptions` (too brittle)
   - Only use structured `periods` data

3. **Timezone**:
   - Use place's `utcOffsetMinutes` if available
   - Otherwise assume local time

4. **Midnight Crossing**:
   - Handle periods that cross midnight
   - Check if `close.day` differs from `open.day`

## Logging

```javascript
{
  event: 'post_filter_applied',
  openState: 'OPEN_AT',
  openAt: { timeHHmm: '21:30' },
  openBetween: null,
  stats: {
    before: 20,
    after: 8,
    removed: 12,
    unknownExcluded: 5  // Places without structured hours
  }
}
```

## Testing

1. **OPEN_NOW**: "מסעדות פתוחות עכשיו" → filters to currently open
2. **CLOSED_NOW**: "מסעדות סגורות" → filters to currently closed
3. **OPEN_AT**: "פתוח ב-21:30 בגדרה" → filters to open at 21:30
4. **OPEN_BETWEEN**: "פתוח בין 18 ל-22" → filters to open during range
5. **Missing data**: Places without hours excluded from filtered results

## Changed Files

1. `shared/shared-filters.types.ts` - Added OPEN_AT/OPEN_BETWEEN types
2. `shared/base-filters-llm.ts` - Extended LLM prompt for time extraction
3. `shared/filters-resolver.ts` - Pass through new filter fields
4. `post-filters/post-results.filter.ts` - Evaluate structured hours
5. `stages/google-maps.stage.ts` - Added `regularOpeningHours` to field mask
