# Generic Query Narration Feature

**Date:** 2026-01-29  
**Status:** ✅ COMPLETE

## Summary

Implemented proper handling for generic food queries like "what to eat" that provide helpful narration when using user's current location, and CLARIFY when location is missing.

## Problem

Queries like "what to eat" (Hebrew: "מה לאכול") have:
- `foodSignal=YES` (from GATE2 - it's about food)
- No location text / cityText (from INTENT - no specific place mentioned)

Previously, these would either:
- Search using current location without explanation (confusing)
- Fail silently or return unclear results

## Solution

### Policy

**If query has foodSignal=YES but NO cityText:**

1. **With userLocation:**
   - ✅ Allow NEARBY search to proceed
   - ✅ Return results
   - ✅ Send GENERIC_QUERY_NARRATION message:
     - 1 sentence: Explain assumption (used current location)
     - 1 question: Ask for ONE refinement (cuisine, kosher, openNow, or radius)
     - `blocksSearch=false` (search already ran)
     - `suggestedAction="REFINE"`

2. **Without userLocation:**
   - ❌ Cannot proceed with NEARBY
   - ✅ Return CLARIFY response:
     - Ask for city/area
     - `blocksSearch=true`
     - `suggestedAction="ASK_LOCATION"`

## Implementation

### 1. New Assistant Message Type

**File:** `server/src/services/search/route2/assistant/assistant-llm.service.ts`

Added `GENERIC_QUERY_NARRATION` type:

```typescript
export interface AssistantGenericQueryNarrationContext {
  type: 'GENERIC_QUERY_NARRATION';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  usedCurrentLocation: boolean;
}
```

**Updated enums:**
- `type`: Added `'GENERIC_QUERY_NARRATION'`
- `suggestedAction`: Added `'REFINE'`

### 2. LLM Prompt for Narration

**Instructions to LLM:**
1. Message (1 sentence): Explain we used their current location
2. Question (1 sentence): Ask for ONE refinement:
   - Cuisine type (e.g., "איזה סוג אוכל?")
   - Dietary preference (e.g., "צריך כשר?")
   - Time constraint (e.g., "צריך פתוח עכשיו?")
   - Distance (e.g., "כמה רחוק בסדר?")
3. `blocksSearch=false` (search already ran)
4. `suggestedAction="REFINE"`

**Examples:**
- (Hebrew) "חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?"
- (English) "I searched near your current location. What type of cuisine interests you?"

### 3. Fallback Messages

**Hebrew:**
```typescript
message: 'חיפשתי לפי המיקום הנוכחי שלך.',
question: 'איזה סוג אוכל מעניין אותך?',
suggestedAction: 'REFINE',
blocksSearch: false
```

**English:**
```typescript
message: 'I searched near your current location.',
question: 'What type of cuisine interests you?',
suggestedAction: 'REFINE',
blocksSearch: false
```

### 4. Detection Logic

**File:** `server/src/services/search/route2/orchestrator.guards.ts`

Added `checkGenericFoodQuery()` function:

```typescript
function isGenericFoodQuery(
  gateResult: Gate2StageOutput,
  intentDecision: IntentResult
): boolean {
  return (
    gateResult.gate.foodSignal === 'YES' &&
    !intentDecision.cityText &&
    intentDecision.route === 'NEARBY'
  );
}
```

**Detection criteria:**
- `foodSignal === 'YES'` (it's about food)
- `!cityText` (no specific location in query)
- `route === 'NEARBY'` (would use current location)

### 5. Orchestrator Integration

**File:** `server/src/services/search/route2/route2.orchestrator.ts`

Added check after INTENT stage:

```typescript
// Check for generic food query (e.g., "what to eat") - sets flag for later
checkGenericFoodQuery(gateResult, intentDecision, ctx);
```

Sets `ctx.isGenericQuery = true` flag for response builder.

### 6. Response Builder Integration

**File:** `server/src/services/search/route2/orchestrator.response.ts`

After normal SUMMARY is sent, check for generic query flag:

```typescript
// Generic query narration (if flagged)
if ((ctx as any).isGenericQuery && ctx.userLocation) {
  const narrationContext: AssistantGenericQueryNarrationContext = {
    type: 'GENERIC_QUERY_NARRATION',
    query: request.query,
    language: resolveAssistantLanguage(ctx, request, detectedLanguage),
    resultCount: finalResults.length,
    usedCurrentLocation: true
  };

  await generateAndPublishAssistant(
    ctx,
    requestId,
    sessionId,
    narrationContext,
    narrationFallback,
    wsManager
  );
}
```

## Flow Diagrams

### Scenario 1: "מה לאכול" WITH userLocation

```
User Query: "מה לאכול"
    ↓
GATE2: foodSignal=YES ✅
    ↓
INTENT: route=NEARBY, cityText=undefined ✅
    ↓
checkGenericFoodQuery: Set ctx.isGenericQuery=true ✅
    ↓
ROUTE_LLM: nearbySearch mapping
    ↓
GOOGLE_MAPS: Search near userLocation ✅
    ↓
POST_FILTER: Filter results
    ↓
RESPONSE_BUILD:
  1. Send SUMMARY: "יש כמה אפשרויות באזור..." ✅
  2. Send GENERIC_QUERY_NARRATION: 
     "חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?" ✅
    ↓
Return results + both messages
```

### Scenario 2: "what to eat" WITHOUT userLocation

```
User Query: "what to eat"
    ↓
GATE2: foodSignal=YES ✅
    ↓
INTENT: route=NEARBY, cityText=undefined ✅
    ↓
checkGenericFoodQuery: Set ctx.isGenericQuery=true ✅
    ↓
ROUTE_LLM: nearbySearch mapping
    ↓
handleNearbyLocationGuard: NO userLocation ❌
    ↓
Return CLARIFY:
  type: CLARIFY
  reason: MISSING_LOCATION
  message: "To search near you, I need your location."
  question: "Can you enable location or enter a city/area?"
  blocksSearch: true ✅
  suggestedAction: ASK_LOCATION ✅
```

## Example Messages

### Generic Query WITH Location

**Query:** "מה לאכול"

**Message 1 (SUMMARY):**
```
יש כמה אפשרויות באזור. אפשר למיין לפי מרחק או דירוג.
```

**Message 2 (GENERIC_QUERY_NARRATION):**
```
חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?
```

### Generic Query WITHOUT Location

**Query:** "what to eat"

**Message (CLARIFY):**
```
To search near you, I need your location. Can you enable location or enter a city/area?
```

## Invariant Enforcement

**GENERIC_QUERY_NARRATION invariants (HARD):**
- `blocksSearch` MUST be `false` (search already ran)
- `suggestedAction` MUST be `'REFINE'`

These are enforced in `enforceInvariants()` function.

## Testing

**File:** `server/tests/generic-query-narration.test.ts`

### Test Coverage

1. **Detection Logic:**
   - ✅ Detects generic query: foodSignal=YES, route=NEARBY, no cityText
   - ✅ Does NOT detect if cityText present
   - ✅ Does NOT detect if foodSignal not YES
   - ✅ Does NOT detect if route not NEARBY
   - ✅ Detects even without userLocation (flag for later handling)

2. **Expected Flow:**
   - ✅ Sets flag but always returns null (continues pipeline)

3. **Scenarios:**
   - ✅ "מה לאכול" with userLocation → proceeds with narration
   - ✅ "what to eat" without userLocation → CLARIFY response
   - ✅ "פיצה" (specific food) → also gets narration (acceptable)

### Run Tests

```bash
cd server
npm test -- generic-query-narration.test.ts
```

## Edge Cases

### "pizza" without location

**Detection:** YES (generic enough - no cityText)
**Behavior:** Shows narration explaining current location was used
**Rationale:** Even for specific foods, explaining location assumption is helpful

### "מסעדות בתל אביב"

**Detection:** NO (cityText="תל אביב")
**Behavior:** Normal TEXTSEARCH, no narration
**Rationale:** User specified location, no need to explain

### "near me" without userLocation

**Detection:** YES (if foodSignal=YES)
**Behavior:** CLARIFY asking for location
**Rationale:** Cannot proceed without location

## Benefits

✅ **Clear communication** - Users understand why they see these results  
✅ **Helpful guidance** - Suggests how to refine search  
✅ **Proper UX** - Explains assumptions transparently  
✅ **Graceful degradation** - CLARIFY when location missing  
✅ **Multilingual** - Works in Hebrew and English  
✅ **Non-blocking** - Search completes, narration is additional context  

## Files Changed

1. `server/src/services/search/route2/assistant/assistant-llm.service.ts`
   - Added `AssistantGenericQueryNarrationContext` interface
   - Added `'GENERIC_QUERY_NARRATION'` to type enum
   - Added `'REFINE'` to suggestedAction enum
   - Added prompt building logic
   - Added fallback messages (Hebrew & English)
   - Added invariant enforcement

2. `server/src/services/search/route2/orchestrator.guards.ts`
   - Added `checkGenericFoodQuery()` function
   - Added `isGenericFoodQuery()` helper

3. `server/src/services/search/route2/route2.orchestrator.ts`
   - Added import for `checkGenericFoodQuery`
   - Added call after INTENT stage

4. `server/src/services/search/route2/orchestrator.response.ts`
   - Added logic to send narration for generic queries
   - Checks `ctx.isGenericQuery` flag and `ctx.userLocation`

5. `server/tests/generic-query-narration.test.ts` (NEW)
   - Comprehensive test coverage

## Verification

✅ All TODOs completed  
✅ No linter errors  
✅ Tests added  
✅ Documentation complete  
✅ Assistant language matches uiLanguage  
✅ Invariants enforced  

Ready for production! 🎉
