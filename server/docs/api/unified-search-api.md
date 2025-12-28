# Unified Search API Documentation

**Endpoint:** `POST /api/search`  
**Status:** ✅ Production Ready (Phase 3)  
**Version:** 1.0.0

---

## Overview

The unified search endpoint provides a single, consistent interface for restaurant search with intelligent intent parsing, confidence-based assistance, and multilingual support.

**Key Features:**
- 🌍 Multilingual support (Hebrew, English, Arabic, French, Spanish, Russian, and more)
- 🤖 LLM-powered intent parsing with confidence scoring
- 🎯 Smart filtering (open now, dietary restrictions, price levels)
- 📍 Location resolution (cities, places, GPS coordinates)
- 💡 Contextual refinement suggestions
- 🔄 Session-based conversation continuity

---

## Request

### Endpoint
```http
POST /api/search
Content-Type: application/json
```

### Request Body

```typescript
{
  query: string;                    // Required: user's search query
  sessionId?: string;               // Optional: for conversation continuity
  userLocation?: {                  // Optional: user's GPS location
    lat: number;
    lng: number;
  };
  filters?: {                       // Optional: explicit filters
    openNow?: boolean;
    priceLevel?: number;            // 1-4 ($ to $$$$)
    dietary?: string[];             // ['kosher', 'vegan', 'gluten_free', 'halal']
    mustHave?: string[];            // ['parking', 'wifi', 'outdoor_seating']
  };
}
```

### Examples

**Simple Query:**
```json
{
  "query": "pizza in Paris"
}
```

**With Location:**
```json
{
  "query": "sushi near me",
  "userLocation": {
    "lat": 48.8566,
    "lng": 2.3522
  }
}
```

**With Filters:**
```json
{
  "query": "italian restaurant in Tel Aviv",
  "filters": {
    "openNow": true,
    "priceLevel": 2,
    "dietary": ["gluten_free"]
  }
}
```

**Multilingual (Hebrew):**
```json
{
  "query": "מסעדה איטלקית בתל אביב"
}
```

**Session Continuity:**
```json
{
  "query": "show me cheaper options",
  "sessionId": "search-1234567890-abc"
}
```

---

## Response

### Success Response (200 OK)

```typescript
{
  sessionId: string;                // Session ID for follow-ups
  query: {
    original: string;               // Original query text
    parsed: ParsedIntent;           // LLM-parsed structured intent
    language: string;               // Detected language (ISO code)
  };
  results: RestaurantResult[];      // Top 10 results
  chips: RefinementChip[];          // Suggested refinements
  assist?: AssistPayload;           // Optional: low-confidence assistance
  meta: {
    tookMs: number;                 // Response time
    mode: string;                   // Search mode used
    appliedFilters: string[];       // Filters that were applied
    confidence: number;             // Intent confidence (0-1)
    source: string;                 // Data source (e.g., "google_places")
  };
}
```

### RestaurantResult

```typescript
{
  id: string;                       // Unique internal ID
  placeId: string;                  // Provider's place ID
  source: string;                   // "google_places"
  name: string;
  address: string;
  location: { lat: number; lng: number; };
  rating?: number;                  // 0-5
  userRatingsTotal?: number;
  priceLevel?: number;              // 1-4
  openNow?: boolean;
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  photoUrl?: string;
  photos?: string[];
  tags?: string[];
  matchReasons?: string[];          // Why this matches the query
  score?: number;                   // Relevance score (0-100)
}
```

### RefinementChip

```typescript
{
  id: string;
  emoji: string;
  label: string;
  action: "filter" | "sort" | "map";
  filter?: string;                  // Filter expression
}
```

### Example Response

```json
{
  "sessionId": "search-1703088000000-abc123",
  "query": {
    "original": "pizza open now in Paris",
    "parsed": {
      "query": "pizza",
      "searchMode": "textsearch",
      "filters": { "openNow": true },
      "language": "en"
    },
    "language": "en"
  },
  "results": [
    {
      "id": "google_ChIJ...",
      "placeId": "ChIJ...",
      "source": "google_places",
      "name": "Pizzeria Luigi",
      "address": "123 Rue de Rivoli, Paris",
      "location": { "lat": 48.8566, "lng": 2.3522 },
      "rating": 4.6,
      "userRatingsTotal": 342,
      "priceLevel": 2,
      "openNow": true,
      "phoneNumber": "+33 1 2345 6789",
      "website": "https://example.com",
      "googleMapsUrl": "https://maps.google.com/?q=place_id:ChIJ...",
      "photoUrl": "https://maps.googleapis.com/maps/api/place/photo?...",
      "tags": ["pizza", "italian", "highly_rated"],
      "matchReasons": ["open_now", "highly_rated"],
      "score": 92.5
    }
  ],
  "chips": [
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
  ],
  "meta": {
    "tookMs": 3247,
    "mode": "textsearch",
    "appliedFilters": ["opennow"],
    "confidence": 0.9,
    "source": "google_places"
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "code": "VALIDATION_ERROR",
  "details": "query: Required"
}
```

### 500 Internal Server Error
```json
{
  "error": "Search failed",
  "code": "SEARCH_ERROR"
}
```

---

## Features

### 1. Multilingual Support

**Supported Languages:**
- Hebrew (he)
- English (en)
- Arabic (ar)
- French (fr)
- Spanish (es)
- Russian (ru)
- And more...

**Example:**
```json
{
  "query": "مطعم حلال في لندن"  // Arabic: "Halal restaurant in London"
}
```

The system automatically:
- Detects input language
- Returns results in the same language
- Preserves city/place names in original script

---

### 2. Intelligent Filtering

**LLM-Detected Filters:**

The system automatically extracts filters from natural language:

| Query | Detected Filter |
|-------|----------------|
| "pizza open now" | `openNow: true` |
| "cheap sushi" | `priceLevel: 1` |
| "gluten free pizza" | `dietary: ['gluten_free']` |
| "halal restaurant" | `dietary: ['halal']` |
| "vegan cafe" | `dietary: ['vegan']` |

**Explicit Filters:**

You can also provide filters directly:
```json
{
  "query": "italian restaurant",
  "filters": {
    "openNow": true,
    "priceLevel": 2,
    "dietary": ["kosher", "vegan"]
  }
}
```

---

### 3. Location Resolution

**Supported Location Types:**

1. **City Name:**
   ```json
   { "query": "pizza in Tokyo" }
   ```

2. **Place/Landmark:**
   ```json
   { "query": "sushi near Eiffel Tower" }
   ```

3. **User Location (GPS):**
   ```json
   {
     "query": "pizza near me",
     "userLocation": { "lat": 48.8566, "lng": 2.3522 }
   }
   ```

4. **Street/Area:**
   ```json
   { "query": "restaurant on Allenby Street in Tel Aviv" }
   ```

---

### 4. Confidence-Based Assistance

When confidence is low (<0.7), the `assist` field provides clarification:

```json
{
  "assist": {
    "type": "clarify",
    "message": "Where would you like to find pizza?",
    "suggestedActions": [
      { "label": "Pizza in Paris", "query": "pizza in Paris" },
      { "label": "Pizza near me", "query": "pizza near me" }
    ]
  }
}
```

**Confidence Factors:**
- ✅ Has food type → +0.2
- ✅ Has location → +0.2
- ✅ Has filters → +0.1
- ✅ Is refinement → +0.1
- ❌ Too vague → -0.2

---

### 5. Session Continuity

Use `sessionId` for conversation-style refinements:

```http
POST /api/search
{
  "query": "pizza in Paris"
}
→ Returns sessionId: "search-123"

POST /api/search
{
  "query": "show me cheaper options",
  "sessionId": "search-123"
}
→ Refines previous search
```

---

## Performance

**Target:** <5 seconds  
**Typical:** 3-4 seconds

**Breakdown:**
- Intent parsing: ~1.5s
- Location resolution: ~0.5s (cached after first call)
- Places search: ~1.5s
- Ranking & suggestions: ~0.1s
- Total: ~3.6s

---

## Migration from Legacy Endpoints

### From `/api/places/search`

**Before:**
```json
POST /api/places/search
{
  "text": "pizza in paris",
  "userLocation": null
}
```

**After:**
```json
POST /api/search
{
  "query": "pizza in paris"
}
```

### From `/api/dialogue`

**Before:**
```json
POST /api/dialogue
{
  "text": "pizza in paris",
  "userLocation": { "lat": 48.8566, "lng": 2.3522 }
}
```

**After:**
```json
POST /api/search
{
  "query": "pizza in paris",
  "userLocation": { "lat": 48.8566, "lng": 2.3522 }
}
```

---

## Rate Limiting

Currently: No rate limits  
Future: TBD based on usage patterns

---

## Monitoring

**Statistics Endpoint:**
```http
GET /api/search/stats
```

Returns:
```json
{
  "sessionStats": {
    "totalSessions": 142,
    "activeSessions": 23
  },
  "geocodeStats": {
    "size": 87,
    "hits": 523,
    "misses": 95,
    "hitRate": 0.85
  }
}
```

---

## Best Practices

### 1. Use Session IDs
For conversational refinements, always include the session ID from the previous response.

### 2. Provide User Location
For "near me" queries, include `userLocation` for accurate results.

### 3. Check Confidence
If `meta.confidence < 0.7`, consider showing the `assist` UI to guide users.

### 4. Handle Errors Gracefully
Always handle 400/500 errors and provide user-friendly messages.

### 5. Cache Sessions Client-Side
Store `sessionId` in local storage for session continuity.

---

## Support

- **Documentation:** `/server/docs/`
- **Examples:** See integration tests in `/server/tests/`
- **Issues:** Contact backend team

---

**Last Updated:** December 20, 2025  
**API Version:** 1.0.0













