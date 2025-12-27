# Backend Architecture: AI-Powered Restaurant Search

> **Document Version:** 1.0  
> **Last Updated:** December 27, 2024  
> **Status:** Active Development

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Core Design Principles](#core-design-principles)
3. [System Components](#system-components)
4. [Data Flow & Orchestration](#data-flow--orchestration)
5. [AI Assistant Architecture](#ai-assistant-architecture)
6. [Smart Chips System](#smart-chips-system)
7. [Type System & Data Contracts](#type-system--data-contracts)
8. [Error Handling & Safety](#error-handling--safety)
9. [Session Management](#session-management)
10. [Performance & Optimization](#performance--optimization)
11. [Future Considerations](#future-considerations)

---

## High-Level Architecture

### System Overview

The backend follows a **Backend-for-Frontend (BFF)** pattern with a capability-based architecture. The system is designed around a central orchestrator that coordinates specialized services to deliver an AI-powered restaurant search experience.

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Angular)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/JSON
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Layer (Express)                        │
│                /api/v1/unified-search                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│               SearchOrchestrator (BFF Core)                  │
│  Coordinates all services in a deterministic pipeline        │
└─┬─────────┬─────────┬─────────┬─────────┬──────────┬────────┘
  │         │         │         │         │          │
  ▼         ▼         ▼         ▼         ▼          ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌────────┐ ┌──────────┐
│Intent │ │ Geo   │ │Places │ │Ranking│ │Suggest │ │Assistant │
│Service│ │Resolve│ │Provide│ │Service│ │Service │ │Narration │
└───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬────┘ └────┬─────┘
    │         │         │         │         │            │
    ▼         ▼         ▼         ▼         ▼            ▼
  ┌─────────────────────────────────────────────────────────┐
  │             External Services & Data                    │
  │  • LLM (GPT-4/Claude) • Google Places API              │
  │  • Geocoding API      • Session Storage                │
  └─────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Backend-for-Frontend (BFF)**: Single orchestrator tailored for the Angular frontend
2. **Capability-Based Services**: Each service has a single, well-defined responsibility
3. **Two-Phase LLM Architecture**: Separate LLM calls for intent parsing (Pass A) and assistant narration (Pass B)
4. **Deterministic-First**: Code computes system state; LLM only generates user-facing messages
5. **Type-Safe Contracts**: Strict TypeScript interfaces for all data flows
6. **Session-Aware**: Maintains user context across searches for better UX

---

## Core Design Principles

### 1. Determinism Over Generation

**Problem:** LLMs can hallucinate facts, especially about live data like "open now" status.

**Solution:** Split responsibilities:

- **Code decides reality**: Compute failure reasons, validate data, determine available actions
- **LLM narrates reality**: Generate friendly messages based on deterministic state

```typescript
// ❌ BAD: Let LLM decide what's available
const response = await llm.complete("What actions should we show?");

// ✅ GOOD: Code provides allowlist, LLM selects from it
const chips = suggestionService.generate(intent, results);
const assistPayload = await assistantNarration.generate({
  chips, // <- Deterministic allowlist
  failureReason, // <- Deterministic state
});
```

### 2. Answer-First UX

Users care about **results first**, **explanations second**. The system prioritizes:

1. Show results immediately (even if imperfect)
2. Provide contextual guidance via AI assistant
3. Offer refinement chips for exploration

### 3. Trust but Verify

LLMs are powerful but unreliable for structured data extraction. Strategy:

- **LLM extracts** entities (city, category, intent)
- **Code validates** via authoritative sources (Geocoding API)
- **Session caches** validated results to avoid redundant API calls

### 4. Graceful Degradation

Every external dependency can fail. The system must remain functional:

- LLM unavailable → Use template-based fallbacks
- Google API error → Return partial results with clear messaging
- Geocoding failed → Offer alternative cities

### 5. Non-Breaking Evolution

The `ParsedIntent` type evolves without breaking existing code:

- Add new fields as **optional**
- Maintain backward compatibility
- Use semantic versioning for breaking changes

---

## System Components

### 1. SearchOrchestrator (Core BFF)

**Location:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Responsibility:** Coordinate all services in a deterministic pipeline.

**Pipeline:**

1. **Session Management**: Get or create user session
2. **Intent Parsing** (LLM Pass A): Extract structured intent from natural language
3. **Geocoding Validation**: Verify location data
4. **Location Resolution**: Get coordinates for search
5. **Places Search**: Query Google Places API
6. **City Filtering**: Ensure results match target city
7. **Ranking**: Score and sort results
8. **Grouping**: Organize results (exact matches vs. nearby)
9. **Suggestion Generation**: Create refinement chips
10. **Failure Detection**: Compute deterministic failure reason
11. **Assistant Narration** (LLM Pass B): Generate contextual guidance
12. **Response Assembly**: Package everything for frontend

**Key Design Decisions:**

- **Single Responsibility**: Orchestration only—no business logic
- **Dependency Injection**: All services passed via constructor
- **Error Isolation**: Each step has try-catch with fallback
- **Observability**: Structured logging at each step

```typescript
async search(request: SearchRequest): Promise<SearchResponse> {
  // 1. Session
  const session = await this.sessionService.getOrCreate(sessionId);

  // 2. Intent (LLM Pass A)
  const { intent, confidence } = await this.intentService.parse(query);

  // 3-5. Location + Search
  const location = await this.geoResolver.resolve(intent.location);
  let results = await this.placesProvider.search(params);

  // 6-8. Filter + Rank + Group
  results = this.cityFilter.filter(results, targetCity);
  results = this.rankingService.rank(results, intent);
  const groups = this.rse.groupResults(results, intent);

  // 9-10. Chips + Failure Detection
  const chips = this.suggestionService.generate(intent, results);
  const failureReason = this.failureDetector.compute(intent, results);

  // 11. AI Assistant (LLM Pass B)
  const assist = await this.assistantNarration.generate({
    originalQuery, intent, results, chips, failureReason
  });

  // 12. Response
  return createSearchResponse({ results, groups, chips, assist, meta });
}
```

---

### 2. IntentService (LLM Pass A)

**Location:** `server/src/services/search/capabilities/intent.service.ts`

**Responsibility:** Parse natural language queries into structured `ParsedIntent`.

**Architecture:**

```
User Query: "פיצה טבעונית בתל אביב"
      ↓
┌─────────────────────┐
│ PlacesIntentService │ ← LLM-powered extraction
└──────────┬──────────┘
           │ PlacesIntent (raw)
           ▼
┌─────────────────────┐
│  IntentService      │ ← Normalization + validation
└──────────┬──────────┘
           │ ParsedIntent (validated)
           ▼
┌─────────────────────┐
│ GeocodingService    │ ← Verify city
└──────────┬──────────┘
           │
           ▼
    Confidence Score: 0.92
```

**Key Features:**

- **Confidence Scoring**: Weighted calculation based on:

  - Category clarity (0.35 weight)
  - Location precision (0.25 weight)
  - Filter specificity (0.15 weight)
  - Language confidence (0.15 weight)
  - Context merging (0.10 weight)

- **Session-Level City Caching**: Avoid repeated geocoding API calls

  - First query: "pizza in Tel Aviv" → geocode + cache
  - Follow-up: "sushi in Tel Aviv" → use cached coordinates

- **Semantic Intent Detection**: Populate new fields for AI assistant
  - `intent`: 'search_food' | 'refine' | 'check_opening_status'
  - `requiresLiveData`: true if user asked about hours
  - `canonical.category`: "pizza"
  - `canonical.locationText`: "Tel Aviv"

**Confidence Formula:**

```typescript
confidence =
  categoryScore * 0.35 +
  locationScore * 0.25 +
  filterScore * 0.15 +
  languageScore * 0.15 +
  contextScore * 0.1;
```

---

### 3. GeoResolverService

**Location:** `server/src/services/search/capabilities/geo-resolver.service.ts`

**Responsibility:** Convert location intent into coordinates for Places API.

**Resolution Priority:**

1. **Coordinates provided** → Use directly
2. **Place name** → Geocode via Google Geocoding API
3. **City only** → Geocode city center
4. **No location** → Fail gracefully (require clarification)

**Safety Features:**

- Timeout handling (5s default)
- Caching (via session)
- Fallback to city center if specific location fails

---

### 4. PlacesProviderService

**Location:** `server/src/services/search/capabilities/places-provider.service.ts`

**Responsibility:** Execute search against Google Places API.

**Search Mode Selection:**

```typescript
function selectSearchMode(intent: ParsedIntent): SearchMode {
  if (intent.location?.coords && intent.location.radius === 0) {
    return "findplace"; // Specific venue search
  }
  if (intent.location?.coords) {
    return "nearbysearch"; // Location-based search
  }
  return "textsearch"; // Broad query search
}
```

**API Integration:**

- Handles rate limiting
- Retries with exponential backoff
- Converts Google Places response to `RestaurantResult[]`

---

### 5. RankingService

**Location:** `server/src/services/search/capabilities/ranking.service.ts`

**Responsibility:** Score and sort results based on relevance.

**Scoring Algorithm:**

```typescript
score =
  ratingScore * 0.3 + // Google rating
  popularityScore * 0.25 + // Number of reviews
  matchScore * 0.2 + // Query match quality
  priceFitScore * 0.15 + // Price level match
  proximityScore * 0.1; // Distance from center
```

---

### 6. SuggestionService (Smart Chips)

**Location:** `server/src/services/search/capabilities/suggestion.service.ts`

**Responsibility:** Generate contextual refinement chips based on results.

**Chip Generation Logic:**

```typescript
interface RefinementChip {
  id: string; // Unique identifier
  emoji: string; // Visual indicator
  label: string; // User-facing text
  action: "filter" | "sort" | "map";
  filter?: string; // e.g., "price<=2"
}
```

**Generation Strategy:**

1. **Analyze results**: Extract available filters (price, rating, tags)
2. **Context-aware**: Consider intent (e.g., don't suggest "open now" if already applied)
3. **Localized**: Labels in user's language (Hebrew/English)
4. **Priority-ordered**: Most useful chips first

**Example Chips:**

- `💰 עד ₪₪` → Filter: `price<=2`
- `⭐ דירוג גבוה` → Sort: `rating-desc`
- `🗺️ ראה במפה` → Action: `show-map`
- `🍕 פיצה איטלקית` → Refine: `cuisine=italian`

---

## AI Assistant Architecture

### Two-Phase LLM Design

The system uses **two separate LLM calls** with distinct purposes:

```
┌─────────────────────────────────────────────────────────────┐
│                        User Query                            │
│              "מסעדה טבעונית פתוח עכשיו"                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │   LLM PASS A      │
                  │  Intent Parsing   │
                  └─────────┬─────────┘
                            │ Structured Intent
                            ▼
              ┌─────────────────────────┐
              │  Deterministic Pipeline │
              │  • Geocoding            │
              │  • Search               │
              │  • Ranking              │
              │  • Chip Generation      │
              │  • Failure Detection    │
              └─────────────┬───────────┘
                            │ System State
                            ▼
                  ┌─────────▼─────────┐
                  │   LLM PASS B      │
                  │ Assistant Message │
                  └─────────┬─────────┘
                            │
                            ▼
                  ┌─────────────────┐
                  │  User Response  │
                  │  with Guidance  │
                  └─────────────────┘
```

### LLM Pass A: Intent Parsing

**Service:** `PlacesIntentService`  
**Purpose:** Extract structured data from natural language  
**Input:** User query + session context  
**Output:** `PlacesIntent` (structured)

**Prompt Strategy:**

- Zero-shot with JSON schema
- Examples for ambiguous cases
- Language detection
- Context awareness (follow-up queries)

**Safety:**

- Schema validation (Zod)
- Confidence scoring
- Geocoding verification

---

### LLM Pass B: Assistant Narration

**Service:** `AssistantNarrationService`  
**Location:** `server/src/services/search/assistant/assistant-narration.service.ts`

**Purpose:** Generate contextual guidance messages and select next-best actions.

**Architecture:**

```typescript
interface AssistantGenerationInput {
  originalQuery: string; // User's exact words
  intent: ParsedIntent; // Parsed intent
  results: RestaurantResult[]; // Search results
  chips: RefinementChip[]; // Available actions (allowlist)
  failureReason: FailureReason; // System state
  liveData: LiveDataVerification; // Trust flags
  language: string; // Response language
}

interface AssistPayload {
  type: "guide" | "recovery";
  mode: "NORMAL" | "RECOVERY";
  message: string; // 1-2 sentence guidance
  primaryActionId?: string; // Highlighted chip
  secondaryActionIds?: string[]; // Up to 4 additional chips
  reasoning?: string; // Debug info
  failureReason?: FailureReason;
}
```

**Critical Safety Rules:**

1. **Never Hallucinate Live Data**

   ```typescript
   if (!liveData.openingHoursVerified) {
     // ❌ FORBIDDEN: "This place is open now"
     // ✅ ALLOWED:   "Want me to check if it's open?"
   }
   ```

2. **Only Select from Allowlist**

   ```typescript
   // LLM receives: chips = [{id: 'chip-1', ...}, {id: 'chip-2', ...}]
   // LLM returns:  primaryActionId: 'chip-1', secondaryIds: ['chip-2']
   // Server validates: IDs exist in allowlist
   ```

3. **Always Reference Original Intent**

   ```typescript
   // Good: "מצאתי 12 פיצריות בתל אביב"
   // Bad:  "מצאתי מסעדות" (lost context)
   ```

4. **Acknowledge Failures Honestly**
   ```typescript
   if (failureReason === "GEOCODING_FAILED") {
     message = "לא הצלחתי לאתר את המיקום הזה. נסה עיר אחרת?";
   }
   ```

**Prompt Structure:**

```typescript
const systemPrompt = `
You are a helpful restaurant search assistant.

CRITICAL SAFETY RULES (MUST FOLLOW):
1. NEVER claim "open now", "closed", or provide hours unless openingHoursVerified is true
2. NEVER invent actions - only select IDs from the provided allowlist
3. Always reference the original user request (category + location if known)
4. If a tool/API failed, acknowledge honestly without technical jargon
5. Vary phrasing - avoid repetitive responses
6. Write in the user's language: ${language}
7. Keep message to 1-2 sentences maximum
8. Be friendly, helpful, and conversational

CURRENT SITUATION:
- User asked: "${originalQuery}"
- Parsed as: ${category} in ${location}
- Found: ${resultCount} results
- Failure reason: ${failureReason}
- Live data verified: ${liveData.openingHoursVerified}

AVAILABLE ACTIONS (chip IDs you MUST select from):
${chipsList}

YOUR TASK:
1. Write a brief, friendly message about the results and next steps
2. Select ONE primary action (most important next step)
3. Select 2-4 secondary actions (alternative options)
4. Provide reasoning for your choices

OUTPUT JSON ONLY:
{
  "message": "Brief, friendly message in ${language}",
  "primaryActionId": "chip-id or omit if none suitable",
  "secondaryActionIds": ["chip-id-1", "chip-id-2"],
  "reasoning": "Why you chose these actions"
}
`;
```

**Fallback Strategy:**

If LLM call fails (timeout, error, unavailable):

```typescript
private createFallbackPayload(input: AssistantGenerationInput): AssistPayload {
  // Template-based messages
  let message = '';

  if (input.failureReason === 'NO_RESULTS') {
    message = language === 'he'
      ? 'לא מצאתי תוצאות. נסה להרחיב את החיפוש.'
      : "No results found. Try expanding your search.";
  } else if (input.results.length > 0) {
    message = language === 'he'
      ? `מצאתי ${input.results.length} מקומות. אפשר לסנן או למיין.`
      : `Found ${input.results.length} places. You can filter or sort.`;
  }

  // Simple heuristic: pick first 3 chips
  const primaryActionId = input.chips[0]?.id;
  const secondaryActionIds = input.chips.slice(1, 4).map(c => c.id);

  return { message, primaryActionId, secondaryActionIds, ... };
}
```

---

### Failure Detection (Deterministic)

**Service:** `FailureDetectorService`  
**Location:** `server/src/services/search/assistant/failure-detector.service.ts`

**Responsibility:** Compute deterministic failure reasons (not LLM-generated).

**Failure Taxonomy:**

```typescript
type FailureReason =
  | "NONE" // Everything worked
  | "NO_RESULTS" // 0 results returned
  | "LOW_CONFIDENCE" // Confidence < 0.4
  | "GEOCODING_FAILED" // Couldn't resolve location
  | "GOOGLE_API_ERROR" // Places API error
  | "TIMEOUT" // Request timed out
  | "QUOTA_EXCEEDED" // API quota limit
  | "LIVE_DATA_UNAVAILABLE" // User asked for hours but unavailable
  | "WEAK_MATCHES"; // Results exist but low relevance
```

**Detection Logic:**

```typescript
computeFailureReason(
  intent: ParsedIntent,
  results: RestaurantResult[],
  confidence: number,
  meta: SearchResponseMeta,
  error?: any
): FailureReason {
  // Priority order (most severe first)
  if (error?.code === 'TIMEOUT') return 'TIMEOUT';
  if (error?.code === 'OVER_QUERY_LIMIT') return 'QUOTA_EXCEEDED';
  if (error) return 'GOOGLE_API_ERROR';

  if (results.length === 0) {
    if (intent.location?.cityValidation === 'FAILED') {
      return 'GEOCODING_FAILED';
    }
    return 'NO_RESULTS';
  }

  if (confidence < 0.4) return 'LOW_CONFIDENCE';

  if (intent.requiresLiveData && !meta.liveData.openingHoursVerified) {
    return 'LIVE_DATA_UNAVAILABLE';
  }

  // Check result relevance
  const avgScore = results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;
  if (avgScore < 30) return 'WEAK_MATCHES';

  return 'NONE';
}
```

---

## Smart Chips System

### Architecture

**Flow:**

```
ParsedIntent + Results
         ↓
  ┌──────────────┐
  │ Suggestion   │
  │  Generator   │
  └──────┬───────┘
         │ Candidate chips (all possibilities)
         ▼
  ┌──────────────┐
  │ Priority &   │
  │  Filtering   │
  └──────┬───────┘
         │ Refined list (8-12 chips)
         ▼
  ┌──────────────┐
  │ Localization │
  └──────┬───────┘
         │ Localized chips
         ▼
  ┌──────────────┐
  │ AI Assistant │ ← Selects 1 primary + 2-4 secondary
  │   (Pass B)   │
  └──────┬───────┘
         │
         ▼
    Frontend renders:
    • Primary (highlighted)
    • Secondary (normal)
    • Rest (collapsed/hidden)
```

### Chip Generation Rules

**1. Context-Aware Filtering**

```typescript
// Don't suggest what's already applied
if (intent.filters.openNow) {
  chips = chips.filter((c) => c.id !== "open-now");
}

// Don't suggest if data unavailable
if (!results.some((r) => r.priceLevel)) {
  chips = chips.filter((c) => c.action !== "filter-price");
}
```

**2. Priority Ordering**

```typescript
const chipPriority = {
  nearby: 10, // Most useful: expand search
  "filter-price": 9, // Common filter
  "filter-rating": 8,
  "open-now": 7,
  "show-map": 6,
  "cuisine-refine": 5,
  // ... lower priority chips
};
```

**3. Localization**

```typescript
const chipLabels = {
  nearby: {
    en: "Nearby",
    he: "באיזור",
  },
  "filter-price": {
    en: "Cheap Eats",
    he: "עד ₪₪",
  },
  // ...
};
```

### Chip Actions

**Filter Chips:**

```typescript
{
  id: 'price-1-2',
  emoji: '💰',
  label: 'עד ₪₪',
  action: 'filter',
  filter: 'price<=2'  // Backend parses and applies
}
```

**Sort Chips:**

```typescript
{
  id: 'sort-rating',
  emoji: '⭐',
  label: 'דירוג גבוה',
  action: 'sort',
  sort: 'rating-desc'
}
```

**Navigation Chips:**

```typescript
{
  id: 'show-map',
  emoji: '🗺️',
  label: 'ראה במפה',
  action: 'map'
  // Frontend handles navigation
}
```

---

## Type System & Data Contracts

### Core Types

**ParsedIntent** (Enhanced for AI Assistant)

```typescript
export interface ParsedIntent {
  // Core fields (existing)
  query: string;
  location?: {
    city?: string;
    cityValidation?: "VERIFIED" | "FAILED" | "AMBIGUOUS";
    place?: string;
    coords?: Coordinates;
    radius?: number;
  };
  searchMode: SearchMode;
  filters: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  };

  // NEW: Semantic header (non-breaking additions)
  intent?: "search_food" | "refine" | "check_opening_status";
  confidenceLevel?: "high" | "medium" | "low";
  requiresLiveData?: boolean;
  originalQuery?: string; // Immutable

  canonical?: {
    category?: string; // "pizza"
    locationText?: string; // "Tel Aviv"
  };
}
```

**AssistPayload** (AI Assistant Output)

```typescript
export interface AssistPayload {
  type: "guide" | "recovery";
  mode: "NORMAL" | "RECOVERY";
  message: string;
  primaryActionId?: string;
  secondaryActionIds?: string[]; // Optional array
  reasoning?: string;
  failureReason?: FailureReason;
}
```

**SearchResponseMeta** (Response Metadata)

```typescript
export interface SearchResponseMeta {
  tookMs: number;
  confidence: number;
  language: string;
  sessionId: string;

  // NEW: Failure reason and live data trust
  failureReason?: FailureReason;
  liveData: {
    openingHoursVerified: boolean;
  };
}
```

**VerifiableBoolean** (Data Quality Type)

```typescript
// Tri-state type for explicit uncertainty
type VerifiableBoolean = true | false | "UNKNOWN";

// Usage
interface RestaurantResult {
  openNow?: VerifiableBoolean;
  // true:  Verified open
  // false: Verified closed
  // 'UNKNOWN': No data or unverified
}
```

---

## Error Handling & Safety

### Multi-Layer Safety

**1. Schema Validation (Entry Point)**

```typescript
import { z } from "zod";

const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  sessionId: z.string().optional(),
  language: z.enum(["en", "he", "ar"]).optional(),
});

// Request validation
try {
  const validatedRequest = SearchRequestSchema.parse(request);
} catch (error) {
  return { error: "Invalid request", details: error.errors };
}
```

**2. Service-Level Try-Catch**

```typescript
async search(request: SearchRequest): Promise<SearchResponse> {
  try {
    // Normal flow
    const results = await this.placesProvider.search(params);
    // ...
  } catch (error) {
    console.error('[SearchOrchestrator] Search failed:', error);

    // Determine failure reason
    const failureReason = this.categorizeError(error);

    // Generate recovery message
    const assist = await this.assistantNarration.generate({
      failureReason,
      results: [],
      chips: this.getRecoveryChips(failureReason),
      // ...
    });

    // Return partial response with guidance
    return createSearchResponse({
      results: [],
      assist,
      meta: { failureReason, ... }
    });
  }
}
```

**3. LLM Fallbacks**

```typescript
async generate(input: AssistantGenerationInput): Promise<AssistPayload> {
  if (!this.llm) {
    return this.createFallbackPayload(input);
  }

  try {
    const result = await this.llm.completeJSON(prompt, schema, {
      timeout: 5000
    });
    return this.validateAndReturn(result, input);
  } catch (error) {
    console.error('[AssistantNarration] LLM failed, using fallback:', error);
    return this.createFallbackPayload(input);
  }
}
```

**4. API Error Mapping**

```typescript
function categorizeError(error: any): FailureReason {
  if (error.code === "TIMEOUT") return "TIMEOUT";
  if (error.code === "OVER_QUERY_LIMIT") return "QUOTA_EXCEEDED";
  if (error.code === "INVALID_REQUEST") return "LOW_CONFIDENCE";
  if (error.message?.includes("geocod")) return "GEOCODING_FAILED";
  return "GOOGLE_API_ERROR";
}
```

---

## Session Management

### Architecture

**Service:** `SessionService`  
**Location:** `server/src/services/search/capabilities/session.service.ts`

**Responsibilities:**

- Store user context across searches
- Cache validated cities (avoid redundant geocoding)
- Track conversation history for follow-up queries

**Session Structure:**

```typescript
interface UserSession {
  id: string; // Unique session ID
  createdAt: Date;
  lastAccessedAt: Date;

  context: {
    lastQuery?: string;
    lastIntent?: ParsedIntent;
    lastResults?: RestaurantResult[];

    // City validation cache
    validatedCities: Map<
      string,
      {
        coordinates: Coordinates;
        status: "VERIFIED" | "FAILED";
        timestamp: Date;
      }
    >;
  };
}
```

**Session Lifecycle:**

```typescript
// 1. Get or create
const session = await sessionService.getOrCreate(sessionId);

// 2. Use during search
const cachedCity = await session.getValidatedCity("Tel Aviv");

// 3. Update after search
await session.update({
  lastQuery: request.query,
  lastIntent: intent,
  lastResults: results,
});

// 4. Clear on intent reset
await session.clearContext(sessionId);
```

**Benefits:**

- **Performance**: Avoid redundant API calls (geocoding)
- **UX**: Better context for follow-up queries ("show me vegan options")
- **Cost**: Reduce LLM and API usage

---

## Performance & Optimization

### 1. Caching Strategy

**Session-Level Cache** (Short-term, user-specific)

- Validated cities: 1 hour TTL
- Last search results: 5 minutes TTL
- Intent parsing: Never cached (queries are unique)

**Global Cache** (Long-term, shared)

- City coordinates: 24 hour TTL (future)
- Popular searches: 1 hour TTL (future)

### 2. API Rate Limiting

**Google Places API:**

- Quota: ~100,000 requests/day
- Rate limit: 100 requests/sec
- Strategy: Queue requests during high load

**Geocoding API:**

- Quota: ~40,000 requests/day
- Optimization: Session cache reduces calls by ~70%

### 3. LLM Optimization

**Pass A (Intent Parsing):**

- Timeout: 8s
- Model: GPT-4o-mini (fast, cheap)
- Retries: 1 with exponential backoff

**Pass B (Assistant Narration):**

- Timeout: 5s
- Model: GPT-4o-mini
- Retries: 0 (fallback immediately)

### 4. Parallel Execution

Where possible, execute independent operations in parallel:

```typescript
// ✅ Parallel
const [results, chips] = await Promise.all([
  this.placesProvider.search(params),
  this.suggestionService.generate(intent, []), // Can use cached
]);

// ❌ Sequential (unnecessary)
const results = await this.placesProvider.search(params);
const chips = await this.suggestionService.generate(intent, results);
```

---

## Future Considerations

### Short-Term (Next Sprint)

1. **Unit Tests**: Add tests for `FailureDetectorService` and `AssistantNarrationService`
2. **Metrics**: Add latency tracking for each pipeline step
3. **A/B Testing**: Test different assistant message styles
4. **Logging**: Structured JSON logging with correlation IDs

### Medium-Term (1-2 Months)

1. **Multi-Provider Support**: Add TripAdvisor, Yelp as alternative sources
2. **Personalization**: Track user preferences (price range, cuisine)
3. **Voice Search**: Integrate speech-to-text for voice queries
4. **Advanced Filters**: Support complex queries ("outdoor seating + parking + open late")

### Long-Term (3-6 Months)

1. **Recommendation Engine**: ML-based personalization
2. **Real-Time Availability**: Integrate with restaurant booking systems
3. **Multi-Language**: Full support for Arabic, Russian, French
4. **Mobile Apps**: Native iOS/Android clients

---

## Appendix: Key Files Reference

### Core Services

| Service                   | Path                                                                  | Responsibility                  |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| SearchOrchestrator        | `server/src/services/search/orchestrator/search.orchestrator.ts`      | BFF core, pipeline coordination |
| IntentService             | `server/src/services/search/capabilities/intent.service.ts`           | LLM Pass A: intent parsing      |
| AssistantNarrationService | `server/src/services/search/assistant/assistant-narration.service.ts` | LLM Pass B: message generation  |
| FailureDetectorService    | `server/src/services/search/assistant/failure-detector.service.ts`    | Deterministic failure detection |
| SuggestionService         | `server/src/services/search/capabilities/suggestion.service.ts`       | Smart chip generation           |
| GeoResolverService        | `server/src/services/search/capabilities/geo-resolver.service.ts`     | Location resolution             |
| PlacesProviderService     | `server/src/services/search/capabilities/places-provider.service.ts`  | Google Places API client        |
| RankingService            | `server/src/services/search/capabilities/ranking.service.ts`          | Result scoring and sorting      |
| SessionService            | `server/src/services/search/capabilities/session.service.ts`          | Session management              |

### Type Definitions

| File                     | Purpose               |
| ------------------------ | --------------------- |
| `search.types.ts`        | Core domain types     |
| `search-request.dto.ts`  | API request contract  |
| `search-response.dto.ts` | API response contract |

### Configuration

| File               | Purpose                     |
| ------------------ | --------------------------- |
| `search.config.ts` | Search engine configuration |

---

## Document Maintenance

This document should be updated when:

- New services are added to the architecture
- Major design decisions are made
- API contracts change (breaking changes)
- Performance characteristics significantly change

**Last Review:** December 27, 2024  
**Next Review:** January 15, 2025
