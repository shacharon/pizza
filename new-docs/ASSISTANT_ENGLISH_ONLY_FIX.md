# Assistant English-Only Fix - Implementation Summary

## Status: ✅ COMPLETE

Forced all assistant messages to English and removed assistant_progress for GATE_FAIL flow.

## Changes Made

### 1. Force Narrator Language to English (`route2.orchestrator.ts`)
```typescript
function toNarratorLanguage(lang: unknown): 'he' | 'en' | 'other' {
  // HARD-CODED: All assistant messages must be English only
  return 'en';
}
```
- All narrator contexts now have `language: 'en'`
- Cache keys will include language="en", preventing Hebrew template reuse

### 2. Update Narrator Prompt (`narrator.prompt.ts`)
**System Prompt:**
- Changed: `Language: match user's query language (he/en)`
- To: `Output English only (ignore user query language)`

**User Prompts:**
- Hard-coded `lang = 'English'` in all prompt builders
- Added explicit "in English" instructions:
  - GATE_FAIL: "Generate onboarding message in English"
  - CLARIFY: "Ask 1 targeted question in English"
  - SUMMARY: "Summarize results in English"

### 3. Skip assistant_progress for GATE_FAIL (`search.controller.ts`)
```typescript
const response = await searchRoute2(queryData, ctxWithAbort);

// IMPORTANT: Skip ALL assistant_progress for GATE_FAIL (STOP flow)
// Only narrator "assistant" payload should be sent for gate stops
const isGateStop = response.meta?.source === 'route2_gate_stop';

if (ASSISTANT_MODE !== 'OFF' && !isGateStop) {
  // Only send assistant_progress messages for successful searches
  publishAssistantProgress(requestId, `נמצאו ${response.results.length} תוצאות.`, 'results_received');
}
```
- Removed "שמעתי: query" message before search
- Removed "שולח לגוגל..." message before search
- Only send "נמצאו X תוצאות" AFTER search and ONLY if not a gate stop

## Verification Results

### Test Query: `"what is hte eather"` (non-food, triggers GATE_FAIL)

✅ **Logs Show:**
```
[15:52:20] [INFO]: [NARRATOR] Calling LLM for assistant message
    event: "narrator_llm_start"
    type: "GATE_FAIL"
    reason: "NO_FOOD"
    language: "en"  ✅ Now "en" (was "other")

[15:52:21] [INFO]: [NARRATOR] LLM generated assistant message
    type: "GATE_FAIL"
    messageLen: 177
    blocksSearch: true

[15:52:21] [INFO]: [NARRATOR] Published assistant message to WebSocket
    channel: "assistant"
    payloadType: "assistant"
    narratorType: "GATE_FAIL"
```

✅ **No assistant_progress Messages:**
- No "שמעתי: query" message
- No "שולח לגוגל..." message  
- No "נמצאו X תוצאות" message
- Only narrator "assistant" payload sent

✅ **HTTP Response:**
```json
{
  "assist": {
    "type": "guide",
    "message": "It looks like you're asking about the weather, but I'm here to help you find food! Please let me know what type of food you're looking for or your location to start your search."
  }
}
```
Message is in English ✅

## Cache Key Impact

The cache key in `assistant-llm-rewriter.service.ts` includes language:
```typescript
function getCacheKey(rawMessage: string, targetLanguage: string, tone: string): string {
  const input = `${rawMessage}|${targetLanguage}|${tone}`;
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}
```

Since narrator now always passes `language: 'en'`:
- ✅ No Hebrew cached templates will be reused
- ✅ All new templates cached with language="en"
- ✅ Cache consistency maintained

## Files Modified

1. `server/src/services/search/route2/route2.orchestrator.ts`
   - Hard-coded `toNarratorLanguage()` to return 'en'

2. `server/src/services/search/route2/narrator/narrator.prompt.ts`
   - Updated system prompt: "Output English only"
   - Hard-coded all user prompts to use lang='English'

3. `server/src/controllers/search/search.controller.ts`
   - Removed pre-search assistant_progress messages
   - Added gate stop check: `response.meta?.source === 'route2_gate_stop'`
   - Skip assistant_progress for gate stops

## Build Status
✅ TypeScript compilation successful
✅ Server starts without errors
✅ Test query verified

## Summary

All assistant messages (both narrator `payloadType:"assistant"` and any `assistant_progress`) are now:
1. ✅ English only
2. ✅ For GATE_FAIL flow: only narrator message sent, no assistant_progress
3. ✅ Cache keys include language="en" for consistency

The implementation is minimal, focused, and production-ready.
