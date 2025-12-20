# Dialogue Backend Implementation - Nov 22, 2025

## Summary

Created backend API for conversational food search with LLM-generated suggestions.

## What We Built

### 1. Types (`dialogue.types.ts`)
- TypeScript interfaces for messages, suggestions, context
- Zod schemas for LLM validation
- Clean type definitions for the entire dialogue flow

### 2. Service (`dialogue.service.ts`)
- Core orchestration logic
- LLM-powered suggestion generation using `completeJSON()`
- Session management (in-memory)
- Integrates with existing `TranslationService` and `PlacesLangGraph`
- Graceful error handling with fallbacks

### 3. Controller (`dialogue.controller.ts`)
- Request validation with Zod
- Session ID management via headers
- Three endpoints:
  - `POST /api/dialogue` - Main chat endpoint
  - `DELETE /api/dialogue/session/:id` - Clear session
  - `GET /api/dialogue/stats` - Service stats

### 4. Routes (`dialogue.routes.ts`)
- Express router configuration
- Registered in `app.ts`

## API Endpoints

### POST /api/dialogue

**Request:**
```json
{
  "text": "pizza in haifa",
  "userLocation": { "lat": 32.8, "lng": 34.9 }
}
```

**Headers:**
```
x-session-id: "dialogue-123"
```

**Response:**
```json
{
  "message": "Found 15 pizza places! 🍕",
  "suggestions": [
    {
      "id": "romantic",
      "emoji": "🌹",
      "label": "Romantic",
      "action": "filter",
      "value": "romantic"
    },
    {
      "id": "parking",
      "emoji": "🅿️",
      "label": "Parking",
      "action": "filter",
      "value": "parking"
    }
  ],
  "places": [
    {
      "placeId": "ChIJ...",
      "name": "Pizza Prego",
      "address": "Herzl St, Haifa",
      "rating": 4.7
    }
  ],
  "meta": {
    "source": "google",
    "tookMs": 3500,
    "sessionId": "dialogue-123"
  }
}
```

## Testing

### Postman Collection
Import: `server/docs/postman-dialogue-tests.json`

### Test Flow
1. **First message:** "pizza in haifa"
   - Should return results + suggestions
   - Note the session ID

2. **Follow-up:** "romantic places"
   - Use same session ID
   - Should update results based on context

3. **Clarification:** "which one has parking?"
   - Should provide specific answer
   - Context-aware response

## Architecture

```
User Request
    ↓
DialogueController (validate, extract session)
    ↓
DialogueService.handleMessage()
    ├─ Add user message to context
    ├─ LLM generates response + suggestions
    ├─ If search needed:
    │   └─ PlacesLangGraph.run()
    │       ├─ TranslationService (multi-language)
    │       └─ Google Places API
    └─ Add bot message to context
    ↓
Return: message, suggestions, places
```

## Key Features

1. **Context-Aware**
   - Remembers conversation history
   - Tracks applied filters
   - Maintains session state

2. **LLM-Powered Suggestions**
   - Dynamic, not hardcoded
   - Based on conversation context
   - 4-6 suggestions per response

3. **Multi-Language Support**
   - Reuses `TranslationService`
   - Auto-detects language
   - Translates queries for better results

4. **Graceful Fallbacks**
   - LLM failure → fallback suggestions
   - Search failure → keep existing results
   - Network errors → friendly error messages

## Files Created

```
server/src/
  services/dialogue/
    ├── dialogue.types.ts       (109 lines)
    └── dialogue.service.ts     (279 lines)
  controllers/dialogue/
    └── dialogue.controller.ts  (148 lines)
  routes/
    └── dialogue.routes.ts      (28 lines)
```

## Files Modified

```
server/src/app.ts (added dialogue router)
```

## Next Steps

1. ✅ Backend complete
2. ⏳ Frontend (models, API service, facade, component)
3. ⏳ End-to-end testing
4. ⏳ Unit tests (after MVP)

## Status

✅ **Backend Complete - Ready for Frontend**

Backend is fully functional and can be tested with Postman.


