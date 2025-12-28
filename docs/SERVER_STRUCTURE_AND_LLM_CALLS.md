# Server Structure & LLM Call Locations

> **Generated:** December 27, 2024  
> **Purpose:** Document current server architecture and LLM usage

---

## Table of Contents

1. [Folder Tree](#folder-tree)
2. [LLM Call Locations](#llm-call-locations)
3. [Current Interfaces](#current-interfaces)

---

## Folder Tree

### `server/src/services/` Structure

```
server/src/services/
│
├── adapters/                           # Adapter pattern implementations
│   ├── quoteService.inmemory.ts
│   └── vendorSearch.inmemory.ts
│
├── cache.ts                            # Cache utilities
│
├── chat/                               # Chat service (legacy?)
│   ├── chat.service.ts
│   └── handleMessage.md
│
├── conversation/                       # LangGraph conversation engine
│   ├── engine.interface.ts
│   ├── food-graph.manager.ts
│   ├── graph.manager.ts
│   ├── langgraph.engine.ts
│   ├── orchestrator.service.ts
│   ├── planner.agent.ts
│   ├── state.ts
│   └── tools.ts
│
├── dialogue/                           # Dialogue management
│   ├── dialogue.service.ts             # 🤖 LLM Call: Dialogue generation
│   └── dialogue.types.ts
│
├── google/                             # Google Places API wrapper
│   └── places.service.ts
│
├── handlers/                           # Intent handlers (legacy?)
│   └── intentHandlers.ts
│
├── i18n/                               # ✨ NEW: Internationalization (Phase 1)
│   ├── i18n.service.ts                 # Translation service
│   ├── i18n.types.ts                   # Lang types (he, en, ar, ru)
│   ├── index.ts
│   └── translations/
│       ├── ar.json                     # Arabic translations
│       ├── en.json                     # English translations
│       ├── he.json                     # Hebrew translations
│       └── ru.json                     # Russian translations
│
├── intent.ts                           # 🤖 LLM Call: Intent parsing (legacy)
│
├── llm/                                # LLM services
│   └── restaurant.service.ts           # 🤖 LLM Call: Restaurant recommendations
│
├── nlu-session.service.ts              # NLU session management
├── nlu.policy.ts                       # NLU policy
├── nlu.service.ts                      # 🤖 LLM Call: NLU parsing
│
├── og.ts                               # OpenGraph utilities
├── openai.client.ts                    # OpenAI client wrapper
│
├── phraser.service.ts                  # Query phrasing
│
├── pipeline/                           # Chat pipeline
│   ├── chatPipeline.ts                 # 🤖 LLM Call: Chat pipeline
│   ├── pipline.md
│   └── promptGuard.ts
│
├── places/                             # 🏪 Places Search System (Main)
│   ├── cache/
│   │   └── geocode-cache.ts            # Geocoding cache
│   ├── client/
│   │   └── google-places.client.ts     # Google Places API client
│   ├── config/
│   │   └── places.config.ts            # Configuration
│   ├── context/
│   │   └── context-store.ts            # Context storage
│   ├── defaults/
│   │   └── smart-defaults.ts           # Smart defaults
│   ├── intent/
│   │   ├── places-intent.schema.ts     # Zod schema for intent
│   │   └── places-intent.service.ts    # 🤖 LLM Call: Intent parsing (LLM Pass A)
│   ├── models/
│   │   └── types.ts                    # Type definitions
│   ├── normalize/
│   │   └── response-normalizer.service.ts
│   ├── orchestrator/
│   │   └── places.langgraph.ts         # LangGraph orchestrator
│   ├── query/
│   │   └── query-builder.service.ts    # Query builder
│   ├── session/
│   │   └── session-manager.ts          # Session management
│   ├── strategy/                       # Search strategies
│   │   ├── findplace.strategy.ts
│   │   ├── nearbysearch.strategy.ts
│   │   ├── search-strategy.ts
│   │   └── textsearch.strategy.ts
│   ├── suggestions/
│   │   └── suggestion-generator.ts     # ✅ Deterministic chip generation (now uses i18n)
│   ├── translation/
│   │   ├── translation.service.ts      # 🤖 LLM Call: Translation service
│   │   └── translation.types.ts
│   └── README.md
│
├── places.ts                           # Places service (legacy?)
│
├── ports/                              # Port interfaces
│   ├── quoteService.ts
│   └── vendorSearch.ts
│
├── prompt.service.ts                   # Prompt engineering utilities
├── restaurant.service.ts               # Restaurant service
├── restaurant.v2.service.ts            # Restaurant service v2
├── restaurants.provider.ts             # Restaurant provider
│
└── search/                             # 🎯 Unified Search BFF (Main System)
    ├── assistant/                      # ✨ AI Assistant (Phase 1)
    │   ├── assistant-narration.service.ts  # 🤖 LLM Call: LLM Pass B (assistant messages)
    │   ├── failure-detector.service.ts     # ✅ Deterministic failure detection
    │   └── index.ts
    │
    ├── capabilities/                   # Capability services
    │   ├── geo-resolver.service.ts     # ✅ Location resolution
    │   ├── intent.service.ts           # Wrapper for PlacesIntentService
    │   ├── places-provider.service.ts  # Google Places API integration
    │   ├── ranking.service.ts          # ✅ Result scoring/sorting
    │   ├── session.service.ts          # Session management
    │   └── suggestion.service.ts       # ✅ Chip generation (wraps suggestion-generator)
    │
    ├── chatback/
    │   └── chatback.service.ts         # 🤖 LLM Call: Chatback responses
    │
    ├── clarification/
    │   └── clarification.service.ts    # ✅ Clarification generation
    │
    ├── config/
    │   └── search.config.ts            # Search configuration
    │
    ├── detectors/
    │   ├── street-detector.service.ts  # Street detection
    │   └── token-detector.service.ts   # Token detection
    │
    ├── filters/
    │   └── city-filter.service.ts      # ✅ City filtering logic
    │
    ├── geocoding/
    │   └── geocoding.service.ts        # Geocoding API wrapper
    │
    ├── i18n/                           # (Empty - moved to root)
    │
    ├── orchestrator/
    │   └── search.orchestrator.ts      # 🎯 Main BFF orchestrator
    │
    ├── rse/
    │   └── result-state-engine.ts      # ✅ Result grouping logic
    │
    ├── types/                          # Type definitions
    │   ├── response-plan.types.ts      # Response plan types
    │   ├── search-request.dto.ts       # Request DTO
    │   ├── search-response.dto.ts      # Response DTO
    │   └── search.types.ts             # Core types (ParsedIntent, etc.)
    │
    └── utils/
        └── query-composer.ts           # Query composition utilities
```

---

## LLM Call Locations

### 🤖 Files Making LLM Calls

The following files make direct LLM API calls (via `llm.complete()` or `llm.completeJSON()`):

| # | File Path | Purpose | LLM Pass | Active? |
|---|-----------|---------|----------|---------|
| 1 | `search/assistant/assistant-narration.service.ts` | Generate assistant messages (Pass B) | **LLM Pass B** | ✅ **Active** (main system) |
| 2 | `places/intent/places-intent.service.ts` | Parse user intent from natural language | **LLM Pass A** | ✅ **Active** (main system) |
| 3 | `search/chatback/chatback.service.ts` | Generate chatback responses | N/A | ⚠️ Used? |
| 4 | `dialogue/dialogue.service.ts` | Dialogue management | N/A | ⚠️ Legacy? |
| 5 | `places/translation/translation.service.ts` | Translate queries | N/A | ⚠️ Used? |
| 6 | `intent.ts` | Intent parsing (old) | N/A | ❌ Legacy |
| 7 | `nlu.service.ts` | NLU parsing | N/A | ❌ Legacy? |
| 8 | `llm/restaurant.service.ts` | Restaurant recommendations | N/A | ⚠️ Used? |
| 9 | `pipeline/chatPipeline.ts` | Chat pipeline | N/A | ❌ Legacy? |

### Primary LLM Calls (Current System)

**In active use for unified search:**

#### 1️⃣ **LLM Pass A: Intent Parsing**
```typescript
// File: places/intent/places-intent.service.ts
async resolve(text: string): Promise<PlacesIntent> {
  const result = await this.llm.completeJSON(
    messages,
    PlacesIntentSchema,
    { temperature: 0.2, timeout: 8000 }
  );
  return result;
}
```

**Purpose:** Extract structured `PlacesIntent` from natural language query  
**Input:** `"פיצה טבעונית בתל אביב"`  
**Output:** `{ category: "pizza", dietary: ["vegan"], city: "Tel Aviv" }`

#### 2️⃣ **LLM Pass B: Assistant Narration**
```typescript
// File: search/assistant/assistant-narration.service.ts
async generate(input: AssistantGenerationInput): Promise<AssistPayload> {
  const result = await this.llm.completeJSON(
    prompt,
    AssistantResponseSchema,
    { temperature: 0.3, timeout: 5000 }
  );
  return {
    message: result.message,
    primaryActionId: result.primaryActionId,
    secondaryActionIds: result.secondaryActionIds
  };
}
```

**Purpose:** Generate contextual assistant message and select action chips  
**Input:** Original query, parsed intent, results, chips, failure reason  
**Output:** `{ message: "מצאתי 13 פיצריות בתל אביב", primaryActionId: "chip-1" }`

**Fallback:** If LLM fails, uses **deterministic template-based messages** (now with i18n)

---

## Current Interfaces

### 1. ParsedIntent

**File:** `server/src/services/search/types/search.types.ts` (lines 46-91)

```typescript
export interface ParsedIntent {
  // What the user wants
  query: string;  // Normalized query (e.g., "pizza")
  
  // Where to search
  location?: {
    city?: string;
    cityValidation?: 'VERIFIED' | 'FAILED' | 'AMBIGUOUS';  // Geocoding validation
    place?: string;
    placeType?: 'street' | 'neighborhood' | 'landmark';
    coords?: Coordinates;
    radius?: number;
  };
  
  // Search mode
  searchMode: SearchMode;  // 'textsearch' | 'nearbysearch' | 'findplace'
  
  // Filters
  filters: {
    openNow?: boolean;
    priceLevel?: number;  // 1-4
    dietary?: string[];   // ['kosher', 'vegan', 'gluten_free']
    mustHave?: string[];  // ['parking', 'wifi', 'outdoor_seating']
  };
  
  // Context
  occasion?: Occasion;  // 'date' | 'friends' | 'family' | 'business' | 'casual'
  vibe?: string[];      // ['romantic', 'quiet', 'casual', 'local']
  cuisine?: string[];   // ['pizza', 'sushi', 'italian']
  
  // Language
  language: string;         // ISO code: 'en', 'he', 'ar', 'ru', etc.
  regionLanguage?: string;  // Region's primary language
  
  // ✨ NEW: Semantic header for AI assistant (Phase 1)
  intent?: 'search_food' | 'refine' | 'check_opening_status';
  confidenceLevel?: 'high' | 'medium' | 'low';
  requiresLiveData?: boolean;  // True if user asked about open/close/hours
  originalQuery?: string;      // Immutable, for assistant context
  
  // ✨ NEW: Optional canonical extraction (for assistant narration)
  canonical?: {
    category?: string;      // "pizza"
    locationText?: string;  // "Tel Aviv"
  };
}
```

**Key Evolution:**
- **Original:** Basic query + filters + location
- **Phase 1 (AI Assistant):** Added semantic header (`intent`, `confidence`, `requiresLiveData`, `canonical`)
- **Phase 1 (i18n):** `language` now supports any string (normalized to `'he' | 'en' | 'ar' | 'ru'`)

---

### 2. IntentParseResult

**File:** `server/src/services/search/types/search.types.ts` (lines 93-96)

```typescript
export interface IntentParseResult {
  intent: ParsedIntent;
  confidence: number;  // 0-1, indicates how well we understood the query
}
```

**Usage:** Returned by `IntentService.parse()`

---

### 3. ResponsePlan Types

**File:** `server/src/services/search/types/response-plan.types.ts`

```typescript
// Response plan structure (from legacy system, may not be actively used)
export interface ResponsePlan {
  responseType: ResponseType;
  confidence: number;
  data?: any;
  metadata?: Record<string, any>;
}

export type ResponseType = 
  | 'search_results'
  | 'clarification'
  | 'confirmation'
  | 'error'
  | 'fallback';
```

**Status:** ⚠️ This appears to be from a legacy system. The current unified search uses `SearchResponse` instead (defined in `search-response.dto.ts`).

---

### 4. AssistPayload (AI Assistant Output)

**File:** `server/src/services/search/types/search.types.ts` (lines 209-227)

```typescript
export interface AssistPayload {
  type: 'clarify' | 'suggest' | 'guide' | 'recovery';
  mode?: 'NORMAL' | 'RECOVERY';  // Recovery mode for 0 results or errors
  message: string;  // LLM-generated or i18n fallback, multilingual
  
  // ✨ Reference chip IDs (Phase 1)
  primaryActionId?: string;        // Highlighted chip ID
  secondaryActionIds?: string[];   // Up to 4 additional chip IDs (optional)
  
  // Debug metadata
  reasoning?: string;              // Why these actions were chosen (debug)
  failureReason?: FailureReason;   // Deterministic failure reason
  
  // DEPRECATED: Use chip IDs instead
  suggestedActions?: {
    label: string;
    query: string;
  }[];
}
```

**Key Design:**
- **LLM generates:** `message` (friendly, multilingual)
- **Code decides:** `failureReason`, chip allowlist
- **LLM selects:** `primaryActionId` and `secondaryActionIds` from allowlist
- **Fallback:** If LLM fails, uses i18n templates: `i18n.t('fallback.noResults', lang)`

---

### 5. RestaurantResult

**File:** `server/src/services/search/types/search.types.ts` (lines 102-151)

```typescript
export interface RestaurantResult {
  // Identity
  id: string;
  placeId: string;
  source: 'google_places' | 'tripadvisor' | 'internal';
  
  // Basic info
  name: string;
  address: string;
  location: Coordinates;
  
  // Ratings & reviews
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;  // 1-4
  
  // Status (using VerifiableBoolean for data quality)
  openNow?: VerifiableBoolean;  // true | false | 'UNKNOWN'
  
  // Contact
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  
  // Media
  photoUrl?: string;
  photos?: string[];
  
  // Enrichment
  tags?: string[];
  matchReasons?: string[];
  
  // Scoring (added by RankingService)
  score?: number;  // 0-100
  
  // City matching (added by CityFilterService)
  cityMatch?: boolean;
  cityMatchReason?: 'LOCALITY' | 'FORMATTED_ADDRESS' | 'UNKNOWN';
  isNearbyFallback?: boolean;
  
  // Grouping metadata (added by SearchOrchestrator)
  groupKind?: 'EXACT' | 'NEARBY';
  distanceMeters?: number;
  
  // Metadata
  metadata?: {
    lastUpdated?: Date;
    cacheAge?: number;
  };
}
```

**Key Feature:** `openNow?: VerifiableBoolean`
- `true` = Verified open
- `false` = Verified closed
- `'UNKNOWN'` = No data or unverified

This prevents the LLM from hallucinating "open now" status!

---

### 6. RefinementChip (Smart Chips)

**File:** `server/src/services/search/types/search.types.ts` (lines 177-183)

```typescript
export interface RefinementChip {
  id: string;
  emoji: string;
  label: string;           // ✨ Now i18n: i18n.t('chip.budget', lang)
  action: 'filter' | 'sort' | 'map';
  filter?: string;         // e.g., "price<=2"
}
```

**Example:**
```typescript
{
  id: 'budget',
  emoji: '💰',
  label: 'זול',  // i18n.t('chip.budget', 'he')
  action: 'filter',
  filter: 'price<=2'
}
```

---

### 7. FailureReason (Deterministic)

**File:** `server/src/services/search/types/search.types.ts` (lines 190-199)

```typescript
export type FailureReason = 
  | 'NONE'                      // Everything worked
  | 'NO_RESULTS'                // 0 results returned
  | 'LOW_CONFIDENCE'            // Confidence < 0.4
  | 'GEOCODING_FAILED'          // Couldn't resolve location
  | 'GOOGLE_API_ERROR'          // Places API error
  | 'TIMEOUT'                   // Request timed out
  | 'QUOTA_EXCEEDED'            // API quota limit
  | 'LIVE_DATA_UNAVAILABLE'     // User asked for hours but unavailable
  | 'WEAK_MATCHES';             // Results exist but low relevance
```

**Computed by:** `FailureDetectorService` (100% deterministic, no LLM)

---

## Architecture Summary

### Two-Phase LLM Design

```
User Query: "פיצה טבעונית בתל אביב"
      ↓
┌─────────────────────┐
│   LLM PASS A        │  ← PlacesIntentService
│  Intent Parsing     │     (llm.completeJSON)
└──────────┬──────────┘
           │ ParsedIntent
           ▼
┌─────────────────────────┐
│ Deterministic Pipeline  │
│ • Geocoding             │  ← ✅ Code only
│ • Search (Google API)   │  ← ✅ Code only
│ • Ranking              │  ← ✅ Code only
│ • City Filtering       │  ← ✅ Code only
│ • Grouping             │  ← ✅ Code only
│ • Chip Generation      │  ← ✅ Code only (now with i18n)
│ • Failure Detection    │  ← ✅ Code only
└──────────┬──────────────┘
           │ System State
           ▼
┌─────────────────────┐
│   LLM PASS B        │  ← AssistantNarrationService
│ Assistant Message   │     (llm.completeJSON)
└──────────┬──────────┘     Fallback: i18n templates
           │
           ▼
    SearchResponse
    (to frontend)
```

### Key Principles

1. **Determinism Over Generation**: Code computes truth, LLM narrates it
2. **Two LLM Calls Only**: Pass A (intent) and Pass B (assistant)
3. **Graceful Degradation**: If LLM fails, use i18n templates
4. **Type Safety**: Strict TypeScript interfaces throughout
5. **i18n Support**: All deterministic messages now support he/en/ar/ru

---

## Notes

- **Legacy Code**: Several services appear to be legacy (intent.ts, nlu.service.ts, pipeline/chatPipeline.ts)
- **Active System**: The main system is `search/` (unified search BFF) + `places/` (Places intent service)
- **LLM Calls**: Only 2 active LLM calls in production (Pass A + Pass B)
- **i18n**: Phase 1 completed - all deterministic messages now use i18n
- **Next Phase**: Consider cleaning up legacy services and consolidating

---

**Last Updated:** December 27, 2024





