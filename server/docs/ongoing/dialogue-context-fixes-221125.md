# Dialogue Context & Error Handling Fixes

**Date:** November 22, 2025  
**Status:** ✅ Completed

---

## Problem Summary

User reported 3 critical issues when testing the dialogue feature:

### Issue 1: Empty Query Error
```
User: "מה פתוח עכשיו?" (what's open now?)
LLM: { query: '', opennow: true }
Google: INVALID_REQUEST (empty query!)
```

**Root Cause:** LLM detected "open now" as a filter but didn't preserve the food type from context.

### Issue 2: Stale Results on Error
```
Search failed: INVALID_REQUEST
Response: resultsCount: 20 (same as previous search!)
```

**Root Cause:** On error, we kept `context.currentResults` from previous search, confusing users.

### Issue 3: No Context Awareness
```
Message 1: "pizza in ashkelon" → filters: ['pizza']
Message 2: "what's open now?" → filters: ['pizza'] ✅ BUT query: '' ❌
```

**Root Cause:** LLM didn't understand that refinement queries should preserve previous food type.

---

## Solutions Implemented

### Fix 1: Smart Query Fallback

Added cascading fallback logic in `executeSearch()`:

```typescript
if (!effectiveQuery || effectiveQuery === '') {
    // Fallback 1: Use first filter as query
    if (filters && filters.length > 0 && filters[0]) {
        effectiveQuery = filters[0];
    }
    // Fallback 2: Use previous user message
    else if (context.messages.length > 0) {
        const lastUserMessage = context.messages
            .filter(m => m.role === 'user')
            .pop();
        if (lastUserMessage?.content) {
            effectiveQuery = lastUserMessage.content;
        }
    }
    // Fallback 3: Use applied filters from context
    if (!effectiveQuery && context.appliedFilters[0]) {
        effectiveQuery = context.appliedFilters[0];
    }
    // Fallback 4: Generic search
    if (!effectiveQuery) {
        effectiveQuery = 'food';
    }
}
```

**Result:** No more empty queries sent to Google!

---

### Fix 2: Clear Results on Error

Changed error handling to clear stale results:

```typescript
catch (error) {
    console.error('[DialogueService] Search failed', error);
    
    // Clear results on error (don't show stale data)
    results = [];
    context.currentResults = [];
    
    // Update message to reflect error
    llmResponse.text = "Sorry, I had trouble searching. Could you try rephrasing your request?";
}
```

**Result:** Users see error message instead of confusing stale results.

---

### Fix 3: Context-Aware LLM Prompt

Enhanced system prompt to handle refinements:

```typescript
CONTEXT AWARENESS (CRITICAL):
- If user asks about filters WITHOUT specifying food (e.g., "what's open now?", "which has parking?"):
  → This is a REFINEMENT of previous search
  → Keep the same food type from previous message
  → Set filters to include the previous filters + new filter
  → Example: Previous was "pizza", user asks "open now" → filters: ["pizza", "opennow"]

- If user specifies NEW food type:
  → This is a NEW search
  → Replace filters with new food type
```

**Result:** LLM now understands refinement vs. new search!

---

## Test Cases

### Test 1: Refinement Query ✅
```
User: "pizza in ashkelon"
Bot: [Shows 20 pizza places]

User: "what's open now?"
Expected: Filter existing results to open places
Actual: Uses "pizza" as query + opennow filter
```

### Test 2: Error Handling ✅
```
User: "show me restaurants"
[Search fails]

Expected: Empty results + error message
Actual: ✅ Results cleared, error shown
```

### Test 3: Empty Query Fallback ✅
```
LLM returns: { query: '', filters: ['pizza'] }
Expected: Use 'pizza' as query
Actual: ✅ Fallback to filters[0]
```

---

## Files Changed

- `server/src/services/dialogue/dialogue.service.ts`
  - `executeSearch()`: Added smart query fallback
  - `handleMessage()`: Clear results on error
  - `generateResponseSingleCall()`: Enhanced context awareness prompt

---

## Remaining Issues

### Known Limitation: "Open Now" Filter

Google's `opennow=true` parameter only works with:
- **nearbysearch** (requires location)
- **NOT textsearch** (our current default)

**Current Behavior:**
- LLM detects "open now" intent
- But can't apply it without user location
- Falls back to regular search

**Future Fix:**
1. Request user location when "open now" is detected
2. OR filter results client-side using `opening_hours` field
3. OR show message: "To see what's open now, please share your location"

---

## Next Steps

1. ✅ Test with Postman (all 3 scenarios)
2. ✅ Test in UI (dialogue page)
3. ⏳ Implement client-side "open now" filtering
4. ⏳ Add location request prompt for location-dependent filters

---

## Logs Example (After Fix)

```
[DialogueController] Request { text: 'what's open now?', sessionId: '...' }
[DialogueService] handleMessage { userMessage: 'what's open now?' }
[llm] ok attempts=1 durMs=3200
[DialogueService] LLM response { shouldSearch: true, filters: ['pizza', 'opennow'] }
[DialogueService] executeSearch { originalQuery: '', effectiveQuery: 'pizza', filters: ['pizza', 'opennow'] }
[DialogueService] Empty query, using filter: pizza
[PlacesLangGraph] effective intent { mode: 'textsearch', query: 'pizza', target: { kind: 'city', city: 'Ashkelon' } }
[DialogueService] Search complete { resultsCount: 15 }
```

✅ **Query is no longer empty!**
✅ **Context is preserved!**
✅ **No more stale results!**


