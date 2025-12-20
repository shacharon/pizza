# Dialogue LLM Prompt Improvements - Nov 22, 2025

## Changes Made

### 1. Fixed Linter Errors
- Removed `maxTokens` parameter (not supported by LLM provider interface)
- Added type assertion for DialogueResponse to handle Zod parse result

### 2. Enhanced LLM Prompt with "Wisdom of Crowds"

## New Prompt Structure

### Section 1: Personality & Context
- Changed from "helpful, friendly" to "savvy, street-smart"
- Uses casual slang ("spot" not "establishment", "vibe" not "ambiance")
- Shows enthusiasm without being overly formal

### Section 2: Wisdom of the Crowds (NEW!)

**Key Insights from Real User Behavior:**

1. **PARKING** - Top concern in cities
   - Trigger: mentions of driving, car, or specific location
   
2. **OPEN NOW** - Nobody wants closed restaurants
   - Always relevant, especially for immediate needs

3. **PRICE** - Budget matters
   - "Quick bite" = cheap
   - "Special occasion" = splurge
   - Read between the lines

4. **AMBIANCE** - Context clues
   - "Date" = romantic
   - "Kids" = family-friendly
   - "Work" = quiet

5. **DIETARY** - Often forgotten but critical
   - Vegan, gluten-free, kosher, halal
   - Proactively suggest if relevant

6. **DISTANCE** - Perception matters
   - "Near me" = walking (500m)
   - Not driving distance (5km)

**Hidden Patterns:**

- **"Romantic"** → dim lighting, wine, quiet, outdoor
- **"Family-friendly"** → high chairs, kids menu, noise-tolerant, fast
- **"Quick lunch"** → fast service, <$15, parking, takeout
- **"Date night"** → romantic + parking + wine + affordable
- **"Business meeting"** → quiet, WiFi, coffee, professional

### Section 3: Response Structure

Clear guidelines for:
1. **Text** - 2-3 sentences, acknowledge + results + gentle nudge
2. **Suggestions** - 4-6 items, predict what's needed next
3. **Should Search** - Clear true/false criteria
4. **Filters** - Extract explicit mentions only

### Section 4: Examples

Three concrete examples showing:
- First query: "pizza in haifa"
- Follow-up: "romantic places"
- Clarification: "which one has parking?"

Each with expected response format.

## Benefits

1. **Context-Aware Suggestions**
   - LLM understands implicit needs
   - Suggests things users didn't think of
   - Based on real user patterns

2. **Better Personality**
   - Warm but not formal
   - Uses natural language
   - Feels like talking to a friend

3. **Smarter Predictions**
   - "Date night" → automatically suggests parking + wine
   - "Quick lunch" → suggests budget + fast service
   - "Family" → suggests kids menu + noise tolerance

4. **Clearer Instructions**
   - Structured format
   - Examples for reference
   - Explicit do's and don'ts

## Example Output

### User: "pizza for a date in tel aviv"

**LLM Response:**
```json
{
  "text": "Found 12 romantic pizza spots in Tel Aviv! 💕 These are perfect for date night.",
  "suggestions": [
    { "id": "parking", "emoji": "🅿️", "label": "Parking", "action": "filter", "value": "parking" },
    { "id": "wine", "emoji": "🍷", "label": "Wine selection", "action": "filter", "value": "wine" },
    { "id": "outdoor", "emoji": "🌟", "label": "Outdoor", "action": "filter", "value": "outdoor" },
    { "id": "upscale", "emoji": "💎", "label": "Upscale", "action": "filter", "value": "expensive" },
    { "id": "quiet", "emoji": "🤫", "label": "Quiet", "action": "filter", "value": "quiet" },
    { "id": "map", "emoji": "📍", "label": "Show map", "action": "map" }
  ],
  "shouldSearch": true,
  "filters": ["romantic", "pizza"]
}
```

**Why this is good:**
- ✅ Detected implicit "romantic" from "date"
- ✅ Suggested parking (wisdom of crowds: dates need parking)
- ✅ Suggested wine (romantic context)
- ✅ Suggested outdoor (enhances romantic vibe)
- ✅ Mixed practical (parking) with aspirational (upscale)

## Comparison

### Before (Generic):
```
"I found 12 pizza places. What would you like to know?"
Suggestions: [Vegan, Gluten-free, Delivery, Takeout]
```

### After (Wisdom of Crowds):
```
"Found 12 romantic pizza spots in Tel Aviv! 💕 These are perfect for date night."
Suggestions: [🅿️ Parking, 🍷 Wine, 🌟 Outdoor, 💎 Upscale, 🤫 Quiet, 📍 Map]
```

**Much better!** The LLM now:
- Understands context ("date" = romantic)
- Predicts needs (parking, wine)
- Uses natural language
- Feels intelligent and helpful

## Status

✅ **Prompt Enhanced - Ready for Testing**

The LLM now has real-world insights and will generate much smarter suggestions!


