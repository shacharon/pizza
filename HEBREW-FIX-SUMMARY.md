# Route2 Hebrew Query Fix - Summary

## Problem
Hebrew query "מסעדות פתוחות מסביבי" was misclassified by Gate2 and assistant replied in English.

### Issues Identified
1. **Gate2 Misclassification**: Query was classified as `UNCERTAIN` → `ASK_CLARIFY` instead of `YES` → `CONTINUE`
2. **Language Detection Failure**: `detectedLanguage` was set to `"other"` causing assistant to respond in English

## Changes Made

### 1. Gate2 Prompt Enhancement (`server/src/services/search/route2/stages/gate2.stage.ts`)

**Version**: Updated from `gate2_v4` to `gate2_v5`

**Changes**:
- Added critical rule: Queries with "restaurants"/"מסעדות" + proximity phrases ("near me"/"מסביבי"/"לידי") = YES (NOT UNCERTAIN)
- Added 5 minimal examples in system prompt:
  - "מסעדות פתוחות מסביבי" → YES
  - "restaurants near me open now" → YES
  - "pizza near me" → YES
  - "near me" → UNCERTAIN
  - "weather today" → NO

**Impact**: LLM will now correctly classify Hebrew restaurant queries with proximity as food-related.

### 2. Hebrew Language Detection Fix (`server/src/services/search/route2/orchestrator.helpers.ts`)

**Changes**:
1. Added import: `detectQueryLanguage` from `./utils/query-language-detector.js`
2. Updated `decideAssistantLanguage()` function signature to accept `request?: SearchRequest`
3. Added **Priority 1.5** logic:
   ```typescript
   // When LLM returns 'other', check if query contains Hebrew characters
   if (detectedLanguage === 'other' && request?.query) {
     const deterministicLanguage = detectQueryLanguage(request.query);
     if (deterministicLanguage === 'he') {
       return { 
         language: 'he', 
         source: 'deterministic_hebrew', 
         confidence: 0.95 
       };
     }
   }
   ```
4. Updated `resolveAssistantLanguage()` to pass `request` parameter

**Impact**: When Gate2 returns `detectedLanguage: "other"`, the system will:
- Check if query contains Hebrew Unicode characters (\u0590-\u05FF)
- If yes, set `assistantLanguage: "he"` with `confidence: 0.95`
- Force assistant to respond in Hebrew

## Expected Behavior After Fix

### For Query: "מסעדות פתוחות מסביבי"

1. **Gate2 Stage**:
   ```
   foodSignal: "YES"
   route: "CONTINUE"
   confidence: 0.9-1.0
   ```

2. **Intent Stage**:
   ```
   route: "NEARBY"
   reason: "near_me_phrase"
   ```

3. **Language Resolution**:
   ```
   detectedLanguage: "other" (from Gate2)
   assistantLanguage: "he" (from deterministic detection)
   source: "deterministic_hebrew"
   confidence: 0.95
   ```

4. **Without userLocation**:
   ```
   CLARIFY: reason="MISSING_LOCATION" (NOT MISSING_FOOD)
   Assistant message: IN HEBREW
   ```

## Verification

To verify the fix:
1. Restart the server to pick up code changes
2. Send query: `"מסעדות פתוחות מסביבי"`
3. Check logs for:
   - `gate2: route=CONTINUE foodSignal=YES`
   - `intent: route=NEARBY reason=near_me_phrase`
   - `assistant_language_resolved: assistantLanguage=he source=deterministic_hebrew`
   - If no userLocation: `CLARIFY reason=MISSING_LOCATION` with Hebrew message

## Files Modified
- `server/src/services/search/route2/stages/gate2.stage.ts`
- `server/src/services/search/route2/orchestrator.helpers.ts`

## Testing
✓ Hebrew detection logic verified with standalone test
✓ Unicode range \u0590-\u05FF correctly identifies Hebrew
✓ Fallback chain works: LLM detection → Deterministic → uiLanguage → fallback
