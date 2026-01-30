# Ranking Suggestions - Assistant Hook

**Status:** Complete ✅  
**Type:** Non-blocking WebSocket message  
**Tests:** 7 unit tests, all passing

## Overview

The Ranking Suggestions system generates actionable search improvement suggestions based on `RankingSignals`. It uses a minimal LLM call to create user-friendly messages when quality issues are detected.

## Triggering Conditions

Suggestions are generated **only when**:

1. **Any trigger is active** (automatic):
   - `lowResults` - Results count ≤ 10
   - `relaxUsed` - Filters were auto-relaxed
   - `manyOpenUnknown` - ≥40% results lack openNow data
   - `dominatedByOneFactor` - One ranking weight ≥ 0.55

2. **User clicks "Load More"** (future):
   - Explicit user action requesting more options
   - Can provide suggestions even when triggers inactive

**Key Principle:** Suggestions are **non-blocking** and published via WebSocket after the HTTP response is sent.

## Architecture

```
Response Builder → Check triggers → Publish deferred → Generate LLM → Publish WS
                                          ↓
                                    (non-blocking)
```

### Flow

1. **Response Builder** (`orchestrator.response.ts`)
   - Receives `rankingSignals` from orchestrator
   - Calls `publishRankingSuggestionDeferred()` if signals present
   - HTTP response sent immediately (no waiting)

2. **Publisher** (`ranking-suggestion-publisher.ts`)
   - Checks if triggers are active
   - Skips if no triggers (logs + returns)
   - Fires async generation (doesn't await)

3. **Service** (`ranking-suggestion.service.ts`)
   - Calls LLM with minimal context (query + signals)
   - Parses strict JSON output
   - Falls back to deterministic message on error

4. **WebSocket** (`assistant` channel)
   - Publishes to same channel as regular assistant
   - Message type: `ranking_suggestion`
   - Client handles display logic

## LLM Input (Minimal)

```typescript
{
  uiLanguage: 'he' | 'en',
  query: string,
  rankingSignals: {
    profile: "NEARBY" | "QUALITY" | "OPEN_FOCUS" | "BALANCED",
    dominantFactor: "DISTANCE" | "RATING" | "REVIEWS" | "OPEN" | "NONE",
    triggers: {
      lowResults: boolean,
      relaxUsed: boolean,
      manyOpenUnknown: boolean,
      dominatedByOneFactor: boolean
    },
    facts: {
      shownNow: number,
      totalPool: number,
      hasUserLocation: boolean
    }
  }
}
```

**NO restaurant data** - only aggregated signals.

## LLM Output Schema (Strict)

```typescript
{
  message: string,              // 1-2 sentences, correct language
  suggestion: string | null,    // ONE actionable change (or null)
  suggestedAction: "REFINE_LOCATION" | "ADD_MIN_RATING" | 
                   "REMOVE_OPEN_NOW" | "REMOVE_PRICE" | "NONE"
}
```

### Hard Rules (LLM-enforced)

1. **Max 2 sentences** in message
2. **ONE actionable suggestion** only (or null if results are good)
3. **NEVER mention** "weights", "scores", or numbers
4. **NEVER claim** "real-time" or "best"
5. **Language MUST match** uiLanguage (he=Hebrew ONLY, en=English ONLY)
6. Be **friendly and helpful**, not technical

## Decision Guidance (LLM)

The LLM is guided (not forced) to follow these heuristics:

### Scenario 1: Low Results or Relaxation
- **If** `triggers.lowResults` OR `triggers.relaxUsed`
- **Then** suggest loosening one constraint:
  - Open filter present → `REMOVE_OPEN_NOW`
  - Rating-focused → Lower rating requirement
  - Price-focused → `REMOVE_PRICE`

### Scenario 2: Many Open Unknown
- **If** `triggers.manyOpenUnknown`
- **Then** suggest either:
  - Try without "open now" filter → `REMOVE_OPEN_NOW`
  - Ask for specific neighborhood → `REFINE_LOCATION`

### Scenario 3: Distance vs Quality Mismatch
- **If** `dominantFactor=DISTANCE` but query implies quality (e.g., "best pizza")
- **Then** suggest → `ADD_MIN_RATING`

### Scenario 4: Rating vs Proximity Mismatch
- **If** `dominantFactor=RATING` but query implies proximity (e.g., "near me")
- **Then** suggest → `REFINE_LOCATION`

## Example Outputs

### Example 1: Low Results with Open Filter (Hebrew)

**Input:**
```json
{
  "uiLanguage": "he",
  "query": "מסעדות איטלקיות פתוחות עכשיו",
  "rankingSignals": {
    "profile": "OPEN_FOCUS",
    "dominantFactor": "OPEN",
    "triggers": { "lowResults": true, "relaxUsed": false, "manyOpenUnknown": false, "dominatedByOneFactor": true },
    "facts": { "shownNow": 7, "totalPool": 30, "hasUserLocation": true }
  }
}
```

**Output:**
```json
{
  "message": "מצאנו רק 7 מסעדות פתוחות כרגע. אפשר לנסות ללא הדרישה 'פתוח עכשיו'?",
  "suggestion": "הסר את הסינון 'פתוח עכשיו'",
  "suggestedAction": "REMOVE_OPEN_NOW"
}
```

### Example 2: Dominant Distance, Quality Query (English)

**Input:**
```json
{
  "uiLanguage": "en",
  "query": "best pizza restaurants",
  "rankingSignals": {
    "profile": "NEARBY",
    "dominantFactor": "DISTANCE",
    "triggers": { "lowResults": false, "relaxUsed": false, "manyOpenUnknown": false, "dominatedByOneFactor": true },
    "facts": { "shownNow": 20, "totalPool": 30, "hasUserLocation": true }
  }
}
```

**Output:**
```json
{
  "message": "Showing nearby options. Want to focus on highly-rated places?",
  "suggestion": "Add minimum rating 4.0",
  "suggestedAction": "ADD_MIN_RATING"
}
```

### Example 3: Many Open Unknown (Hebrew)

**Input:**
```json
{
  "uiLanguage": "he",
  "query": "מסעדות בתל אביב",
  "rankingSignals": {
    "profile": "BALANCED",
    "dominantFactor": "NONE",
    "triggers": { "lowResults": false, "relaxUsed": false, "manyOpenUnknown": true, "dominatedByOneFactor": false },
    "facts": { "shownNow": 25, "totalPool": 30, "hasUserLocation": false }
  }
}
```

**Output:**
```json
{
  "message": "אין לנו מידע על שעות פתיחה לחלק מהמקומות. אפשר לחפש לפי אזור ספציפי?",
  "suggestion": "ציין שכונה או רחוב",
  "suggestedAction": "REFINE_LOCATION"
}
```

### Example 4: No Triggers (No Suggestion)

**Input:**
```json
{
  "uiLanguage": "en",
  "query": "sushi restaurants",
  "rankingSignals": {
    "profile": "BALANCED",
    "dominantFactor": "NONE",
    "triggers": { "lowResults": false, "relaxUsed": false, "manyOpenUnknown": false, "dominatedByOneFactor": false },
    "facts": { "shownNow": 30, "totalPool": 30, "hasUserLocation": true }
  }
}
```

**Result:** Suggestion **not generated** (no triggers active).

## Fallback Logic

When LLM fails, deterministic fallback messages are used:

| Priority | Condition | Hebrew Message | English Message | Action |
|----------|-----------|----------------|-----------------|--------|
| 1 | `lowResults` | "מצאנו מעט תוצאות. נסה להרחיב את החיפוש." | "Found few results. Try expanding your search." | `REMOVE_OPEN_NOW` |
| 2 | `relaxUsed` | "הרחבנו את החיפוש כדי למצוא יותר תוצאות." | "We expanded the search to find more results." | `NONE` |
| 3 | `manyOpenUnknown` | "אין מידע על שעות פתיחה לחלק מהמקומות." | "Hours information is incomplete for some places." | `REMOVE_OPEN_NOW` |
| 4 | Default | "מצאנו X תוצאות." | "Found X results." | `NONE` |

## WebSocket Message Format

Published to `assistant` channel:

```json
{
  "type": "ranking_suggestion",
  "requestId": "req_123",
  "payload": {
    "message": "Showing nearby options. Want highly-rated places?",
    "suggestion": "Add minimum rating 4.0",
    "suggestedAction": "ADD_MIN_RATING"
  }
}
```

## Client Integration

### Display Logic (Frontend)

```typescript
// Listen for ranking suggestions
ws.on('message', (data) => {
  if (data.type === 'ranking_suggestion') {
    const { message, suggestion, suggestedAction } = data.payload;
    
    // Show suggestion banner/toast
    showSuggestionBanner({
      message,
      suggestion,
      action: suggestedAction
    });
  }
});
```

### Suggested Actions (Frontend)

| Action | Frontend Behavior |
|--------|-------------------|
| `REFINE_LOCATION` | Open location refinement dialog |
| `ADD_MIN_RATING` | Add/suggest "Rating 4.0+" filter |
| `REMOVE_OPEN_NOW` | Remove "Open now" filter, re-search |
| `REMOVE_PRICE` | Remove price filter, re-search |
| `NONE` | Show message only (no action button) |

## Performance

- **HTTP Response:** Not blocked (suggestion fires after response sent)
- **LLM Call:** ~500-800ms (uses `ranking_profile` purpose, 2500ms timeout)
- **Skip Rate:** High when results are good (no triggers)
- **Failure Mode:** Graceful (deterministic fallback, never crashes)

## Testing

### Unit Tests (7 total)

```bash
npm test -- src/services/search/route2/assistant/ranking-suggestion.service.test.ts
```

**Coverage:**
- Trigger detection (lowResults, relaxUsed, manyOpenUnknown, dominatedByOneFactor)
- Multiple triggers simultaneously
- No triggers (should skip)
- Perfect results (should skip)

### Integration Testing

**Manual Test Cases:**

1. **Low Results:**
   - Query: "vegan gluten-free kosher restaurants open now"
   - Expected: Suggestion to remove filters

2. **Distance/Quality Mismatch:**
   - Query: "best restaurants" (near me, no location specified)
   - Expected: Suggestion to add rating filter

3. **Open Unknown:**
   - Query: "restaurants in Tel Aviv" (many results, no hours data)
   - Expected: Suggestion to refine location or remove open filter

## Files

- **Prompt:** `prompts/ranking-suggestion.prompt.ts` (system + user prompt builders)
- **Service:** `ranking-suggestion.service.ts` (LLM call + fallback)
- **Publisher:** `ranking-suggestion-publisher.ts` (WebSocket publishing)
- **Tests:** `ranking-suggestion.service.test.ts` (7 unit tests)
- **Integration:** `orchestrator.response.ts` (wiring)

## Future Enhancements

**Not yet implemented (potential improvements):**

1. **"Load More" Trigger:**
   - Generate suggestions when user explicitly requests more options
   - Can suggest different strategies (expand radius, relax filters, etc.)

2. **Suggestion History:**
   - Track which suggestions were shown/ignored
   - Don't repeat suggestions within same session

3. **A/B Testing:**
   - Test different suggestion strategies
   - Measure acceptance rate per action type

4. **Personalization:**
   - Learn which suggestions users prefer
   - Adapt based on user behavior

## Summary

The Ranking Suggestions system provides **contextual, actionable guidance** to improve search results. It's:

- **Non-blocking** - Never delays HTTP response
- **Trigger-based** - Only fires when quality issues detected
- **LLM-driven** - Natural, context-aware messages
- **Fallback-safe** - Deterministic fallback on LLM failure
- **Well-tested** - 7 unit tests covering all scenarios

The system enhances UX without adding complexity or latency to the main search flow.
