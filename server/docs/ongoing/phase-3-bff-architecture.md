# Phase 3: Unified BFF Architecture Migration

**Status:** 🚧 IN PROGRESS  
**Started:** December 20, 2025  
**Target Completion:** 5 weeks  
**Prerequisites:** ✅ Phase 1 Complete, ✅ Phase 2 Complete

---

## Overview

Transform the backend to a unified Backend-for-Frontend (BFF) pattern with a single `POST /api/search` endpoint that replaces both `/api/places/search` and `/api/dialogue`. This phase focuses on backend architecture while making minimal frontend changes, preparing the foundation for future swipe/list features.

---

## Architecture Vision

### Current State (After Phase 2)

```
Frontend
  ↓
Two separate endpoints:
  - POST /api/places/search (direct search)
  - POST /api/dialogue (conversational)
  
Both use PlacesLangGraph singleton ✅
Fast performance (3-5s) ✅
But: Duplicate logic, no unified interface ❌
```

### Target State (Phase 3)

```
Frontend
  ↓
One unified endpoint:
  POST /api/search
    ↓
  SearchOrchestrator (BFF Layer)
    ↓
  Capability Services:
    - IntentService (parse intent + confidence)
    - GeoResolverService (city → coords)
    - PlacesProviderService (Google Places API)
    - RankingService (score results)
    - SuggestionService (refinement chips)
    - SessionService (context management)
```

---

## Key Design Principles

### 1. Capability Services Pattern

Each service has a **single responsibility**:
- Tested independently
- Replaced/upgraded easily
- Mocked for testing
- Used by future features (swipe, list views)

### 2. Gradual Migration

- Old endpoints continue to work
- Frontend can migrate component-by-component
- No "big bang" deployment
- Easy rollback if issues arise

### 3. Future-Ready Architecture

Response includes:
- `assist?` field for future micro-assist UI
- `confidence` for smarter UX decisions
- Extensible for swipe/list features
- Provider abstraction for TripAdvisor/other sources

### 4. Performance Priority

- Maintain <5s response time
- Reuse existing optimizations (parallel LLM calls, singletons)
- No unnecessary abstractions that add latency

---

## Implementation Timeline

### Week 1: Foundation ✅ COMPLETED
- [x] Define interfaces and DTOs
- [x] Create capability service structure
- [x] Extract IntentService and GeoResolverService
- [x] Extract PlacesProviderService
- [x] Extract RankingService
- [x] Extract SuggestionService  
- [x] Extract SessionService
- [x] Create central config file (search.config.ts)
- [x] Remove all hardcoded values
- [x] Remove duplicate keyword matching (LLM handles it)

### Week 2: Core Services
- [ ] Extract PlacesProviderService
- [ ] Extract RankingService
- [ ] Extract SuggestionService and SessionService
- [ ] Write unit tests

### Week 3: Orchestration
- [ ] Implement SearchOrchestrator
- [ ] Create unified `/api/search` endpoint
- [ ] Add confidence scoring logic
- [ ] Integration tests

### Week 4: Deprecation & Frontend
- [ ] Add deprecation headers to old endpoints
- [ ] Update frontend SearchService
- [ ] Migrate one component as proof-of-concept
- [ ] Performance testing and optimization

### Week 5: Documentation & Monitoring
- [ ] Write API documentation
- [ ] Create migration guide
- [ ] Add deprecation logging/metrics
- [ ] Final testing across all features

---

## Core Types & Interfaces

### SearchRequest (Unified Input)

```typescript
interface SearchRequest {
  query: string;
  sessionId?: string;
  userLocation?: { lat: number; lng: number };
  filters?: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
  };
}
```

### SearchResponse (Unified Output)

```typescript
interface SearchResponse {
  sessionId: string;
  query: {
    original: string;
    parsed: ParsedIntent;
    language: string;
  };
  results: RestaurantResult[];
  chips: RefinementChip[];
  assist?: AssistPayload;  // Future: micro-assist UI
  meta: {
    tookMs: number;
    mode: 'textsearch' | 'nearbysearch' | 'findplace';
    appliedFilters: string[];
    confidence: number;
  };
}
```

### Capability Service Interfaces

```typescript
// Intent parsing with confidence
interface IntentService {
  parse(text: string, context?: SessionContext): Promise<{
    intent: ParsedIntent;
    confidence: number;  // 0-1
  }>;
}

// Location resolution
interface GeoResolverService {
  resolve(location: string | { lat: number; lng: number }): Promise<{
    coords: { lat: number; lng: number };
    displayName: string;
    source: 'user' | 'geocode' | 'city';
  }>;
}

// Places provider abstraction
interface PlacesProviderService {
  search(params: SearchParams): Promise<RestaurantResult[]>;
}

// Ranking and scoring
interface RankingService {
  rank(results: RestaurantResult[], intent: ParsedIntent): RestaurantResult[];
}

// Suggestion generation
interface SuggestionService {
  generate(intent: ParsedIntent, results: RestaurantResult[]): RefinementChip[];
}

// Session management
interface SessionService {
  getOrCreate(sessionId?: string): Promise<SearchSession>;
  update(sessionId: string, data: Partial<SearchSession>): Promise<void>;
}
```

---

## SearchOrchestrator Flow

```typescript
async search(request: SearchRequest): Promise<SearchResponse> {
  const startTime = Date.now();
  
  // 1. Get or create session
  const session = await this.sessionService.getOrCreate(request.sessionId);
  
  // 2. Parse intent with confidence
  const { intent, confidence } = await this.intentService.parse(
    request.query,
    session.context
  );
  
  // 3. Resolve location
  const location = await this.geoResolver.resolve(
    intent.location || request.userLocation
  );
  
  // 4. Search places
  const results = await this.placesProvider.search({
    query: intent.query,
    location: location.coords,
    filters: { ...intent.filters, ...request.filters },
    language: intent.language,
  });
  
  // 5. Rank results
  const ranked = this.rankingService.rank(results, intent);
  
  // 6. Generate suggestions
  const chips = this.suggestionService.generate(intent, ranked);
  
  // 7. Decide if assist is needed (low confidence)
  const assist = confidence < 0.7 
    ? this.createAssistPayload(intent, confidence) 
    : undefined;
  
  // 8. Update session
  await this.sessionService.update(session.id, { intent, results: ranked });
  
  return {
    sessionId: session.id,
    query: { original: request.query, parsed: intent, language: intent.language },
    results: ranked.slice(0, 10),
    chips,
    assist,
    meta: {
      tookMs: Date.now() - startTime,
      mode: intent.searchMode,
      appliedFilters: this.getAppliedFilters(intent, request),
      confidence,
    },
  };
}
```

---

## Files to Create

### Core Types
- `server/src/services/search/types/search.types.ts`
- `server/src/services/search/types/search-request.dto.ts`
- `server/src/services/search/types/search-response.dto.ts`

### Capability Services
- `server/src/services/search/capabilities/intent.service.ts`
- `server/src/services/search/capabilities/geo-resolver.service.ts`
- `server/src/services/search/capabilities/places-provider.service.ts`
- `server/src/services/search/capabilities/ranking.service.ts`
- `server/src/services/search/capabilities/suggestion.service.ts`
- `server/src/services/search/capabilities/session.service.ts`

### Orchestrator
- `server/src/services/search/orchestrator/search.orchestrator.ts`

### Controller
- `server/src/controllers/search/search.controller.ts`

### Tests
- `server/tests/search/intent.service.test.ts`
- `server/tests/search/orchestrator.test.ts`
- `server/tests/unified-search-integration.test.ts`

### Documentation
- `server/docs/api/unified-search-api.md`
- `server/docs/architecture/capability-services.md`
- `server/docs/migration/v2-to-v3-migration-guide.md`

---

## Files to Modify

### Backend
- `server/src/server.ts` - Mount new search router
- `server/src/controllers/places/places.controller.ts` - Add deprecation
- `server/src/controllers/dialogue/dialogue.controller.ts` - Add deprecation
- `server/tests/places-search-integration.test.ts` - Add unified tests
- `server/package.json` - Add test scripts

### Frontend (Minimal)
- `client/src/app/services/search.service.ts` - Add `searchUnified()` method
- One component of choice - Migrate as proof-of-concept

---

## Success Criteria

- [ ] Single `/api/search` endpoint working
- [ ] All 82 integration tests passing (existing + new)
- [ ] Response time maintained: avg <5s
- [ ] All 6 languages working
- [ ] All filters working (open now, gluten free, halal, etc.)
- [ ] Confidence scoring implemented
- [ ] Session management working
- [ ] Old endpoints still functional (gradual deprecation)
- [ ] At least one frontend component migrated successfully
- [ ] Zero breaking changes for existing frontend code
- [ ] Complete API documentation

---

## Risk Mitigation

1. **Performance Regression**: Run integration tests after each step
2. **Breaking Changes**: Keep old endpoints functional throughout
3. **Complexity Creep**: Start simple, add features incrementally
4. **Frontend Impact**: Minimal changes, gradual migration
5. **Testing Gaps**: Write tests BEFORE refactoring each service

---

## Progress Tracking

### Week 1: Foundation (Current)
- [ ] Step 1: Define interfaces and DTOs
- [ ] Step 2a: Extract IntentService
- [ ] Step 2b: Extract GeoResolverService

### Completed Items
- None yet

### In Progress
- Documenting Phase 3 plan

### Blocked
- None

---

## Notes

- This is a **strategic refactor**, not urgent
- Current system works well (Phase 2 complete)
- Take time to do it right
- Each step should be deployable independently
- Confidence scoring prepares for smarter UX (future micro-assist)
- Architecture supports future swipe/list features without major changes

---

**Last Updated:** December 20, 2025  
**Next Review:** End of Week 1

