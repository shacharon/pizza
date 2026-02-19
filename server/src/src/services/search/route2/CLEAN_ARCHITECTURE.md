# Route2 Clean Architecture

## Overview
Minimal, single-responsibility design for search filters in Route2 pipeline.

## Architecture (2 stages)

### 1. BASE_FILTERS_LLM (Single source of truth)
**File**: `shared/base-filters-llm.ts`  
**Purpose**: Decides SearchFilters using LLM  
**Output**: `PreGoogleBaseFilters { language, openState, regionHint }`

**Rules**:
- `openState` defaults to `null` (show ALL results)
- `openState="OPEN_NOW"` ONLY if user explicitly asks for open places
- `openState="CLOSED_NOW"` ONLY if user explicitly asks for closed places
- NO keyword fallback - LLM only (timeout fallback returns `null`)

### 2. POST_RESULT_FILTER (Single place to apply)
**File**: `post-filters/post-results.filter.ts`  
**Purpose**: Apply filters AFTER Google results received  
**Input**: Google results + FinalSharedFilters  
**Output**: Filtered results

**Logic**:
- `openState=null` → return ALL results (no filtering)
- `openState="OPEN_NOW"` → keep only `currentOpeningHours.openNow === true`
- `openState="CLOSED_NOW"` → keep only `currentOpeningHours.openNow === false`
- Missing `openNow` → exclude (defensive)

## Flow

```
1. BASE_FILTERS_LLM 
   ↓ (decides openState)
2. INTENT → ROUTE_LLM → GOOGLE_MAPS
   ↓ (Google returns all results)
3. POST_RESULT_FILTER
   ↓ (applies openState filtering)
4. Response to client
```

## Key Principles

1. **Single source**: `openState` decided ONCE in BASE_FILTERS_LLM
2. **Single application**: `openState` applied ONCE in POST_RESULT_FILTER
3. **No pre-filtering**: Google API receives NO openState/openNow params
4. **No duplication**: Route mappers do NOT set/modify openState
5. **Defensive**: Missing data treated as UNKNOWN and excluded when filtering

## Example Queries

| Query | openState | Results |
|-------|-----------|---------|
| "מסעדות בגדרה" | `null` | ALL (no filter) |
| "מסעדות פתוחות לידי" | `"OPEN_NOW"` | Only open=true |
| "מסעדות סגורות בהרצליה" | `"CLOSED_NOW"` | Only open=false |

## Changed Files

**Removed (cleanup)**:
- `FIXES_SUMMARY.md` (experiment docs)
- `FIXES_CRITICAL_SUMMARY.md` (experiment docs)
- `post-filters/TRISTATE_IMPLEMENTATION.md` (experiment docs)

**Simplified**:
- `shared/base-filters-llm.ts` - Restored LLM-based approach (removed deterministic keyword logic)
- `route2.orchestrator.ts` - Removed complex tightening/locking logic
- `shared/filters-resolver.ts` - NEW: Simple language/region resolution (no openState modification)

**Unchanged (clean)**:
- `post-filters/post-results.filter.ts` - Already correct (single application point)
- `shared/shared-filters.types.ts` - Types remain the same

## Testing

Run queries:
1. "מסעדות פתוחות לידי" → should filter to open only
2. "מסעדות סגורות בהרצליה" → should filter to closed only  
3. "פיצה בגדרה" → should return all (no filter)

Verify logs:
- `base_filters_llm_completed` shows correct `openState`
- `post_filter_applied` shows before/after counts
- NO `openState` in Google request payload
