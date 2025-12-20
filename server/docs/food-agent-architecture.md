# 🍕 Food Agent – Technical Architecture

**Date:** November 22, 2025  
**Status:** Design Document  
**Version:** 1.0

---

## 1. Vision & Scope

The Food Agent is a **global, multi-lingual food search assistant** that combines:

- **Chat-style interaction** ("talk to me like ChatGPT")
- **Swipe / Tinder-style cards** for restaurants
- **Classic List View** for browsing and comparing

### Key Principles:

1. **LLM is NOT a source of truth** - It's an orchestration brain
2. **LLM understands users** - Translates natural language → structured queries
3. **Code handles facts** - Real API calls, ranking, merging
4. **Multi-language by default** - User speaks their language, we search locally
5. **Provider-agnostic** - Easy to add new data sources (Google, TripAdvisor, etc.)

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User Input (Natural Language)                          │
│  "מסעדה רומנטית בגדרה, לא יקר, כשר"                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: LLM Parser (IntentParser)                      │
│  Input:  Free text                                      │
│  Output: FoodQueryDTO (structured)                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: Providers (Parallel, NO LLM!)                 │
│  - GooglePlacesProvider.search(dto)                     │
│  - TripAdvisorProvider.search(dto)  [future]            │
│  Output: RestaurantCandidate[]                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: Orchestrator (Merge + Rank, NO LLM!)          │
│  - Merge duplicates by name+location                    │
│  - Rank by: occasion, vibe, rating, distance, price    │
│  Output: RankedRestaurant[]                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: LLM Presenter (ResultExplainer)                │
│  Input:  Query + Top 10 results                         │
│  Output: "מצאתי 3 מסעדות מושלמות:                       │
│           1. אברטו - רומנטי, כשר, מחירים סבירים..."    │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Core Data Models

### 3.1 `FoodQueryDTO` – Normalized Intent

Represents what the user is *really* asking, after LLM parsing:

```typescript
export type Occasion = "date" | "friends" | "family" | "business" | "casual" | "any";

export interface FoodQueryDTO {
  // Where to search
  location: {
    city?: string;
    coords?: { lat: number; lng: number };
    radiusMeters: number; // dynamic: 1000-5000
  };

  // Why they're eating
  occasion?: Occasion;

  // How it should feel
  vibe?: string[];  // ["romantic", "quiet", "casual", "local"]

  // What kind of food
  cuisine?: string[];  // ["pizza", "sushi", "italian", "vegan"]

  // Constraints
  priceLevel?: 1 | 2 | 3 | 4;  // Google style
  dietary?: string[];  // ["kosher", "vegan", "gluten_free"]
  mustHave?: string[];  // ["parking", "wifi", "outdoor_seating"]
  openNow?: boolean;

  // Meta
  userLanguage: string;  // "he", "en", "fr"
  userRawText: string;   // original message
}
```

### 3.2 `RestaurantCandidate` – Provider Output

Raw restaurants returned by providers:

```typescript
export type RestaurantSource = "google_places" | "tripadvisor" | "internal";

export interface RestaurantCandidate {
  id: string;  // internal ID (source + providerPlaceId)
  providerPlaceId: string;
  source: RestaurantSource;

  name: string;
  address: string;
  location: { lat: number; lng: number };

  rating?: number;
  reviewCount?: number;
  priceLevel?: 1 | 2 | 3 | 4;

  isOpenNow?: boolean;

  // Optional
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  photoUrl?: string;

  // Enriched
  tags?: string[];  // ["pizza", "romantic", "fast-food"]
  
  // Metadata
  metadata?: {
    lastUpdated: Date;
    cacheAge?: number;
  };
}
```

### 3.3 `RankedRestaurant` – Scored Result

Backend scoring + merged data:

```typescript
export interface RankedRestaurant {
  restaurant: RestaurantCandidate;
  score: number;  // 0-100
  matchReasons?: string[];  // ["romantic vibe", "kosher", "good price"]
}
```

### 3.4 `SearchSession` – UI Session

Represents a search session for Chat + Swipe + List:

```typescript
export interface SearchSession {
  id: string;
  query: FoodQueryDTO;
  results: RankedRestaurant[];
  createdAt: Date;
  userLanguage: string;
  currentIndex: number;  // for Swipe view
  
  // User feedback (for future ML)
  swipes?: {
    restaurantId: string;
    direction: "left" | "right";
    timestamp: Date;
  }[];
}
```

---

## 4. Backend Architecture

### 4.1 Module Structure

```
server/src/
  dto/
    food-query.dto.ts          # FoodQueryDTO + Zod schema
    restaurant.dto.ts          # RestaurantCandidate, RankedRestaurant
    search-session.dto.ts      # SearchSession
  
  llm/
    intent-parser.ts           # Text → FoodQueryDTO
    result-explainer.ts        # Results → User message
    language-detector.ts       # Detect user language
  
  providers/
    restaurant-provider.ts     # Interface
    google-places.provider.ts  # Google Places implementation
    tripadvisor.provider.ts    # [Future] TripAdvisor
  
  core/
    search-orchestrator.ts     # Main search pipeline
    ranking-service.ts         # Scoring algorithm
    session-store.ts           # In-memory or Redis
  
  api/
    chat.controller.ts         # POST /api/chat/query
    search.controller.ts       # GET /api/session/:id/results
    swipe.controller.ts        # POST /api/session/:id/swipe
  
  config/
    env.ts
    google.ts
    openai.ts
  
  server.ts
```

### 4.2 Key Interfaces

#### `RestaurantProvider`

```typescript
export interface RestaurantProvider {
  name: RestaurantSource;
  search(query: FoodQueryDTO): Promise<RestaurantCandidate[]>;
}
```

All providers (Google, TripAdvisor, etc.) implement this interface.

#### `IntentParser`

```typescript
export interface IntentParser {
  parse(input: {
    userText: string;
    localeHint?: string;
    userLocation?: { lat: number; lng: number };
  }): Promise<FoodQueryDTO>;
}
```

Uses LLM to convert natural language → structured DTO.

#### `ResultExplainer`

```typescript
export interface ResultExplainer {
  explain(input: {
    query: FoodQueryDTO;
    results: RankedRestaurant[];
  }): Promise<{
    summary: string;
    perRestaurantText?: Record<string, string>;
  }>;
}
```

Uses LLM to generate user-friendly explanations.

### 4.3 Search Flow

```typescript
// Simplified SearchOrchestrator
export class SearchOrchestrator {
  constructor(
    private providers: RestaurantProvider[],
    private rankingService: RankingService
  ) {}

  async search(query: FoodQueryDTO): Promise<RankedRestaurant[]> {
    // 1. Call all providers in parallel
    const results = await Promise.all(
      this.providers.map(p => p.search(query).catch(err => {
        console.error(`Provider ${p.name} failed:`, err);
        return [];
      }))
    );

    // 2. Flatten and merge duplicates
    const allCandidates = results.flat();
    const merged = this.mergeDuplicates(allCandidates);

    // 3. Rank by relevance
    const ranked = this.rankingService.rank(merged, query);

    return ranked;
  }

  private mergeDuplicates(candidates: RestaurantCandidate[]): RestaurantCandidate[] {
    // Group by name + location proximity (~10m)
    // Keep best rating, merge sources
    // ...
  }
}
```

### 4.4 Ranking Algorithm

```typescript
export class RankingService {
  rank(
    restaurants: RestaurantCandidate[],
    query: FoodQueryDTO
  ): RankedRestaurant[] {
    const scored = restaurants.map(r => ({
      restaurant: r,
      score: this.calculateScore(r, query),
      matchReasons: this.getMatchReasons(r, query)
    }));

    return scored.sort((a, b) => b.score - a.score);
  }

  private calculateScore(r: RestaurantCandidate, q: FoodQueryDTO): number {
    let score = 0;

    // Base: rating + review count
    if (r.rating) score += r.rating * 10;
    if (r.reviewCount) score += Math.log10(r.reviewCount + 1) * 5;

    // Price match
    if (q.priceLevel && r.priceLevel) {
      const diff = Math.abs(q.priceLevel - r.priceLevel);
      score -= diff * 3;
    }

    // Open now (hard requirement)
    if (q.openNow && r.isOpenNow === false) {
      score -= 20;
    }

    // Distance (if available)
    // Vibe/cuisine match (if tags available)
    // ...

    return score;
  }

  private getMatchReasons(r: RestaurantCandidate, q: FoodQueryDTO): string[] {
    const reasons: string[] = [];
    
    if (r.rating && r.rating >= 4.5) reasons.push("highly_rated");
    if (q.priceLevel && r.priceLevel === q.priceLevel) reasons.push("price_match");
    if (q.openNow && r.isOpenNow) reasons.push("open_now");
    // ...

    return reasons;
  }
}
```

---

## 5. API Endpoints

### 5.1 `POST /api/chat/query`

Main entry point for Chat + Search.

**Request:**
```json
{
  "message": "מסעדה טובה ליד המלון שלי, משהו לא יקר",
  "userLocation": { "lat": 32.07, "lng": 34.78 },
  "sessionId": "optional-existing-session-id"
}
```

**Response:**
```json
{
  "sessionId": "generated-or-existing",
  "query": { /* FoodQueryDTO */ },
  "summary": "מצאתי 3 מסעדות מעולות בקרבת מקום...",
  "results": [
    {
      "id": "abc",
      "name": "Aberto",
      "address": "...",
      "rating": 4.3,
      "priceLevel": 2,
      "isOpenNow": true,
      "photoUrl": "...",
      "score": 87.5
    }
  ],
  "meta": {
    "tookMs": 3500,
    "resultsCount": 15,
    "sources": ["google_places"]
  }
}
```

**Flow:**
1. Parse message → `FoodQueryDTO` (LLM)
2. Search providers → `RestaurantCandidate[]` (Code)
3. Rank results → `RankedRestaurant[]` (Code)
4. Explain results → summary text (LLM)
5. Store session
6. Return response

### 5.2 `GET /api/session/:sessionId/results`

Fetch all results for List View.

**Response:**
```json
{
  "sessionId": "...",
  "query": { /* FoodQueryDTO */ },
  "results": [ /* RankedRestaurant[] */ ],
  "meta": {
    "createdAt": "2025-11-22T10:30:00Z",
    "resultsCount": 15
  }
}
```

### 5.3 `POST /api/session/:sessionId/swipe`

Record user swipe action.

**Request:**
```json
{
  "restaurantId": "abc",
  "direction": "right"  // "left" | "right"
}
```

**Response:**
```json
{
  "nextRestaurant": { /* RestaurantCandidate */ },
  "currentIndex": 5,
  "remainingCount": 10
}
```

---

## 6. Frontend Architecture

### 6.1 Views

#### Chat View
- Components: `ChatMessageList`, `ChatInput`, `SearchSummary`
- Behavior:
  - User types natural language
  - Calls `POST /api/chat/query`
  - Shows summary + "Start Swiping" / "View List" buttons

#### Swipe View
- Components: `SwipeCard`, `SwipeControls`, `MiniMap`
- Behavior:
  - Shows one restaurant at a time
  - Swipe left/right → `POST /api/session/:id/swipe`
  - Advances to next card

#### List View
- Components: `RestaurantList`, `RestaurantListItem`, `FiltersPanel`
- Behavior:
  - Calls `GET /api/session/:id/results`
  - Shows all results in sortable list
  - Click item → Details panel

### 6.2 State Management

```typescript
type AppState = {
  user: {
    language: string;  // "he", "en"
    location?: { lat: number; lng: number };
  };
  
  session: {
    id?: string;
    query?: FoodQueryDTO;
    results: RankedRestaurant[];
    currentIndex: number;
    summary?: string;
  };
  
  ui: {
    activeView: "chat" | "swipe" | "list";
    loading: boolean;
    error?: string;
  };
};
```

---

## 7. LLM vs Code Responsibilities

### LLM Handles:
- ✅ Language detection
- ✅ Understanding vague phrases ("בא לי משהו טעים")
- ✅ Mapping free text → `FoodQueryDTO`
- ✅ Explaining results in user's language
- ✅ Conversational follow-ups ("something cheaper", "more like pizza")

### Code Handles:
- ✅ HTTP endpoints
- ✅ Type validation (Zod schemas)
- ✅ Real API calls (Google Places, TripAdvisor)
- ✅ Sorting and ranking (numeric, factual)
- ✅ Session management
- ✅ **Never inventing restaurants** - only real data

---

## 8. Performance Targets

### Current (Before Refactor):
```
Total time: 15-19 seconds
- LLM Call 1 (Intent): 4s
- LLM Call 2 (UI): 3s
- PlacesLangGraph:
  - Translation: 2s
  - Intent (duplicate!): 3s
  - Result translation: 3s
Total LLM calls: 5-6
```

### Target (After Refactor):
```
Total time: 6-8 seconds
- LLM Parse (IntentParser): 3s
- Providers (parallel): 2s
- Ranking (code): 0.1s
- LLM Explain (ResultExplainer): 3s
Total LLM calls: 2

With cache: 2-3 seconds (0 LLM for providers!)
```

**Improvement: 60% faster!**

---

## 9. Future Enhancements

### Phase 2:
- Add TripAdvisor provider
- Redis session store
- User preferences (saved searches)

### Phase 3:
- ML-based ranking (learn from swipes)
- Collaborative filtering
- Photo gallery view

### Phase 4:
- Reservations integration
- Social features (share recommendations)
- Voice input

---

## 10. References

- Google Places API: https://developers.google.com/maps/documentation/places/web-service
- OpenAI API: https://platform.openai.com/docs
- SOLID Principles: https://en.wikipedia.org/wiki/SOLID
- Clean Architecture: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html

---

**Last Updated:** November 22, 2025  
**Next Review:** After Phase 1 implementation


