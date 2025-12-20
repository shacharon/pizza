# Phase 2 Testing Guide

## Expected Enhanced Response

### Before Phase 2:
```json
{
  "query": { "mode": "textsearch", "language": "he" },
  "restaurants": [...],
  "meta": {
    "source": "google",
    "mode": "textsearch",
    "tookMs": 10500
  }
}
```

### After Phase 2 (NEW):
```json
{
  "query": { "mode": "textsearch", "language": "he" },
  "restaurants": [...],
  "meta": {
    "source": "google",
    "mode": "textsearch",
    "tookMs": 8500,  // ← Should be faster!
    
    // NEW: Filter transparency
    "appliedFilters": ["opennow", "radius:5000"],
    "autoAppliedFilters": ["opennow", "radius:5000"],
    "userRequestedFilters": [],
    
    // NEW: Parsed intent
    "parsedIntent": {
      "foodType": "pizza",
      "location": "ashkelon",
      "dietary": [],
      "temporal": ["opennow"]
    },
    
    // NEW: Contextual suggestions
    "suggestedRefinements": [
      {
        "id": "delivery",
        "emoji": "🚗",
        "label": "Delivery",
        "action": "filter",
        "filter": "delivery"
      },
      {
        "id": "budget",
        "emoji": "💰",
        "label": "Budget",
        "action": "filter",
        "filter": "price<=2"
      },
      {
        "id": "toprated",
        "emoji": "⭐",
        "label": "Top rated",
        "action": "filter",
        "filter": "rating>=4.5"
      },
      {
        "id": "map",
        "emoji": "🗺️",
        "label": "Map",
        "action": "map"
      }
    ]
  }
}
```

## What to Look For

### ✅ Success Indicators:

1. **Response time improved**
   - Before: 10-13 seconds
   - Target: 6-8 seconds
   - Check `meta.tookMs`

2. **Filter metadata present**
   - `meta.appliedFilters` exists
   - `meta.autoAppliedFilters` includes "opennow"
   - Shows transparency!

3. **Suggestions generated**
   - `meta.suggestedRefinements` is an array
   - Contains contextual chips (delivery, budget, map, etc.)

4. **No errors in console**
   - Server logs show:
     - `[PlacesService] Search request`
     - `[PlacesService] Context`
     - `[SmartDefaults] Applied`
     - `[PlacesService] Search complete`

### ⚠️ What Might Break:

If you see errors, check:
1. Google API key is configured (`GOOGLE_API_KEY` in env)
2. Server restarted after code changes
3. All imports resolved correctly

## Test Scenarios

### Test 1: First Search (No Context)
```json
POST /api/places/search
x-session-id: session-1

{
  "text": "pizza in ashkelon"
}
```

**Expected:**
- ✅ `meta.autoAppliedFilters` includes "opennow"
- ✅ `meta.suggestedRefinements` present
- ✅ 3-5 pizza places returned

---

### Test 2: Refinement (With Context)
**First request:**
```json
POST /api/places/search
x-session-id: session-1

{
  "text": "pizza in ashkelon"
}
```

**Second request (same session):**
```json
POST /api/places/search
x-session-id: session-1

{
  "text": "gluten free"
}
```

**Expected:**
- ✅ System remembers "pizza in ashkelon"
- ✅ Detects "gluten free" as refinement
- ✅ `meta.userRequestedFilters` includes dietary filter
- ✅ Console shows `isRefinement: true`

---

### Test 3: Cache Hit (Duplicate Location)
```json
POST /api/places/search

{
  "text": "sushi in ashkelon"
}
```

**Then immediately:**
```json
POST /api/places/search

{
  "text": "burger in ashkelon"
}
```

**Expected:**
- ✅ Second request faster (cache hit!)
- ✅ Console shows: `[GeocodeCache] HIT: ashkelon`
- ✅ No duplicate geocoding API call

---

## Console Logs to Watch

### Good logs (Phase 2 working):
```
[PlacesService] Search request { sessionId: 'session-1', text: 'pizza in ashkelon' }
[PlacesService] Context { hasContext: false, isRefinement: false }
[PlacesLangGraph] Using shared GeocodeCache
[SmartDefaults] Applied { autoApplied: ['opennow', 'radius:5000'], userRequested: [] }
[SessionManager] Updated session: session-1
[PlacesService] Search complete { 
  sessionId: 'session-1',
  tookMs: 7800,
  resultsCount: 3,
  suggestionsCount: 4,
  autoFilters: 2,
  userFilters: 0
}
```

### Performance improvements to look for:
```
Before: [PlacesLangGraph] tookMs: 12000
After:  [PlacesService] tookMs: 7800   ← 35% faster!
```

---

## Quick Test Command (cURL)

```bash
curl -X POST http://localhost:3000/api/places/search \
  -H "Content-Type: application/json" \
  -H "x-session-id: test-123" \
  -d '{
    "text": "pizza in ashkelon"
  }'
```

**Check the response has new fields:**
```bash
# Should see:
# - meta.appliedFilters
# - meta.suggestedRefinements
# - meta.parsedIntent
```

