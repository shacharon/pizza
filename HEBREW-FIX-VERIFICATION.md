# Route2 Hebrew Query Fix - Verification Guide

## Quick Summary
Fixed two issues:
1. Gate2 misclassifying "מסעדות פתוחות מסביבי" as UNCERTAIN
2. Assistant responding in English instead of Hebrew

## How to Verify

### Step 1: Restart the Server
```bash
cd server
npm run dev
```

### Step 2: Send Test Query
Use the Angular app or send a POST request:
```bash
POST http://localhost:4000/api/v1/search
{
  "query": "מסעדות פתוחות מסביבי",
  "sessionId": "test-session-123"
}
```

### Step 3: Check Logs

Open `server/logs/server.log` and verify:

#### Expected Log Entries:

1. **Gate2 Classification** (should be YES, not UNCERTAIN):
```json
{
  "event": "stage_completed",
  "stage": "gate2",
  "route": "CONTINUE",           // ✓ Was: "ASK_CLARIFY"
  "foodSignal": "YES",             // ✓ Was: "UNCERTAIN"
  "confidence": 0.9                // ✓ Was: 0.5
}
```

2. **Intent Routing** (should route to NEARBY):
```json
{
  "event": "stage_completed",
  "stage": "intent",
  "route": "NEARBY",               // ✓ Correct
  "reason": "near_me_phrase"       // ✓ Correct
}
```

3. **Language Resolution** (should be Hebrew):
```json
{
  "event": "assistant_language_resolved",
  "assistantLanguage": "he",       // ✓ Was: "en"
  "source": "deterministic_hebrew", // ✓ Was: "fallback"
  "detectedLanguage": "other",
  "confidence": 0.95
}
```

4. **Location Guard** (if no userLocation provided):
```json
{
  "event": "pipeline_clarify",
  "reason": "missing_user_location_for_nearby"
}
```

5. **Assistant Message** (should be in Hebrew):
```json
{
  "type": "CLARIFY",
  "reason": "MISSING_LOCATION",    // ✓ NOT "MISSING_FOOD"
  "questionLanguage": "he",        // ✓ Was: "en"
  "blocksSearch": true
}
```

### Step 4: Check Response

The response should contain:
```json
{
  "assist": {
    "type": "clarify",
    "message": "<Hebrew text asking for location>"
  },
  "meta": {
    "failureReason": "LOW_CONFIDENCE",
    "source": "route2_guard_clarify"
  }
}
```

## Alternative Test Cases

### Test 1: With User Location
If you provide `userLocation`, the query should proceed to Google search:
```bash
POST http://localhost:4000/api/v1/search
{
  "query": "מסעדות פתוחות מסביבי",
  "sessionId": "test-session-123",
  "location": {
    "latitude": 32.0853,
    "longitude": 34.7818
  }
}
```

Expected:
- Gate2: `foodSignal=YES, route=CONTINUE`
- Intent: `route=NEARBY`
- Google search executes
- Results returned with Hebrew assistant summary

### Test 2: English Equivalent
```bash
POST http://localhost:4000/api/v1/search
{
  "query": "restaurants near me open now",
  "sessionId": "test-session-123"
}
```

Expected:
- Gate2: `foodSignal=YES, route=CONTINUE`
- Intent: `route=NEARBY`
- Language: `assistantLanguage=en`

## Troubleshooting

### If Gate2 still returns UNCERTAIN:
- Check that `promptVersion: "gate2_v5"` appears in logs
- The LLM might need a few attempts to learn the new examples
- Verify the prompt contains the 5 examples in Hebrew and English

### If Language is still English:
- Check that `source: "deterministic_hebrew"` appears in logs
- Verify `detectedLanguage: "other"` is present
- Ensure the query contains Hebrew Unicode characters

### If Changes Don't Take Effect:
- Make sure you restarted the server after code changes
- Check for TypeScript compilation errors
- Verify no cached responses (use new sessionId)

## Code Changes Summary

### File 1: `gate2.stage.ts`
- Line 51: Version bumped to `gate2_v5`
- Lines 60-69: Added critical rule and 5 examples

### File 2: `orchestrator.helpers.ts`
- Line 9: Added import for `detectQueryLanguage`
- Lines 121-155: Added Priority 1.5 deterministic Hebrew detection
- Line 123: Added `request?` parameter to function signature
- Line 175: Pass `request` to `decideAssistantLanguage`

## Success Criteria

✅ Gate2 classifies Hebrew restaurant+proximity queries as `YES`
✅ Assistant language resolves to `he` for Hebrew queries
✅ CLARIFY reason is `MISSING_LOCATION` (not `MISSING_FOOD`)
✅ Assistant message is in Hebrew
✅ Same behavior for English equivalent queries
