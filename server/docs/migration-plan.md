# 🔄 Migration Plan: Current → Food Agent Architecture

**Date:** November 22, 2025  
**Status:** Ready to Execute  
**Estimated Time:** 2-3 weeks (gradual, low-risk)

---

## Overview

This document maps our **current codebase** to the **target architecture** (see `food-agent-architecture.md`) and provides a step-by-step migration plan.

**Strategy:** Gradual migration with feature flags. Old code keeps working while we build new architecture alongside it.

---

## Current State Analysis

### What We Have (✅ Keep & Reuse):

```
server/src/
  services/
    places/
      client/
        google-places.client.ts     ✅ KEEP - Works perfectly!
      translation/
        translation.service.ts      ✅ KEEP - Already does language detection
  
  llm/
    factory.ts                      ✅ KEEP - LLM provider creation
    openai.provider.ts              ✅ KEEP - OpenAI integration
    types.ts                        ✅ KEEP - LLM interfaces
  
  controllers/
    dialogue/
      dialogue.controller.ts        🔄 REFACTOR - Extract logic to services
  
  routes/
    dialogue.routes.ts              🔄 REFACTOR - Add new endpoints
```

### What Needs Refactoring (🔄):

```
server/src/
  services/
    dialogue/
      dialogue.service.ts           🔄 SPLIT INTO:
                                       - IntentParser (LLM)
                                       - ResultExplainer (LLM)
                                       - SearchOrchestrator (Code)
    
    places/
      orchestrator/
        places.langgraph.ts         🔄 SIMPLIFY TO:
                                       - GooglePlacesProvider
```

### What's New (➕):

```
server/src/
  dto/
    food-query.dto.ts               ➕ NEW - Structured query
    restaurant.dto.ts               ➕ NEW - Candidate + Ranked
    search-session.dto.ts           ➕ NEW - Session state
  
  providers/
    restaurant-provider.ts          ➕ NEW - Interface
    google-places.provider.ts       ➕ NEW - Wrap existing client
  
  core/
    search-orchestrator.ts          ➕ NEW - Main pipeline
    ranking-service.ts              ➕ NEW - Scoring logic
    session-store.ts                ➕ NEW - In-memory store
  
  llm/
    intent-parser.ts                ➕ NEW - Extract from DialogueService
    result-explainer.ts             ➕ NEW - Extract from DialogueService
```

---

## Migration Phases

### Phase 1: Foundation (Week 1)

**Goal:** Create new DTOs and Provider layer without breaking existing code.

#### Day 1-2: DTOs

**Tasks:**
1. Create `dto/food-query.dto.ts`
   - Define `FoodQueryDTO` interface
   - Create Zod schema for validation
   - Add helper functions (e.g., `toGoogleParams()`)

2. Create `dto/restaurant.dto.ts`
   - Define `RestaurantCandidate` interface
   - Define `RankedRestaurant` interface
   - Create Zod schemas

3. Create `dto/search-session.dto.ts`
   - Define `SearchSession` interface
   - Create Zod schema

**Files to create:**
- `server/src/dto/food-query.dto.ts`
- `server/src/dto/restaurant.dto.ts`
- `server/src/dto/search-session.dto.ts`

**Test:** Compile successfully, no runtime changes yet.

---

#### Day 3-4: Provider Layer

**Tasks:**
1. Create `providers/restaurant-provider.ts`
   - Define `RestaurantProvider` interface
   - Export types

2. Create `providers/google-places.provider.ts`
   - Implement `RestaurantProvider` interface
   - Wrap existing `GooglePlacesClient`
   - Convert `FoodQueryDTO` → Google API params
   - Convert Google response → `RestaurantCandidate[]`

**Files to create:**
- `server/src/providers/restaurant-provider.ts`
- `server/src/providers/google-places.provider.ts`

**Files to modify:**
- None (yet)

**Test:**
```typescript
// Manual test in a script
const provider = new GooglePlacesProvider(googleClient, translator);
const query: FoodQueryDTO = {
  location: { city: "Gedera", radiusMeters: 5000 },
  cuisine: ["pizza"],
  userLanguage: "en",
  userRawText: "pizza in gedera"
};
const results = await provider.search(query);
console.log(results); // Should return RestaurantCandidate[]
```

---

#### Day 5: Feature Flag Setup

**Tasks:**
1. Add feature flag to environment
   ```typescript
   // config/env.ts
   export const USE_NEW_ARCHITECTURE = process.env.USE_NEW_ARCH === 'true';
   ```

2. Create new endpoint `/api/v2/chat`
   - Copy `dialogue.controller.ts` → `chat.controller.ts`
   - Add to routes
   - Keep old `/api/dialogue` working

**Files to create:**
- `server/src/api/chat.controller.ts` (copy of dialogue.controller)

**Files to modify:**
- `server/src/routes/dialogue.routes.ts` (add v2 route)

**Test:**
- Old endpoint `/api/dialogue` still works
- New endpoint `/api/v2/chat` returns same results (for now)

---

### Phase 2: Core Logic (Week 2)

**Goal:** Extract LLM logic and create orchestrator.

#### Day 1-2: IntentParser

**Tasks:**
1. Create `llm/intent-parser.ts`
   - Extract parsing logic from `DialogueService.generateResponseTwoCall()`
   - Input: `{ userText, localeHint?, userLocation? }`
   - Output: `FoodQueryDTO`
   - Use existing LLM provider

2. Create unit tests
   - Test various queries (Hebrew, English)
   - Test edge cases (missing location, vague queries)

**Files to create:**
- `server/src/llm/intent-parser.ts`
- `server/src/llm/intent-parser.spec.ts`

**Files to modify:**
- None (yet)

**Test:**
```typescript
const parser = new IntentParser(llmProvider);
const dto = await parser.parse({
  userText: "מסעדה רומנטית בגדרה, לא יקר, כשר",
  localeHint: "he-IL"
});
// Should return valid FoodQueryDTO
```

---

#### Day 3-4: SearchOrchestrator + RankingService

**Tasks:**
1. Create `core/ranking-service.ts`
   - Implement scoring algorithm
   - Input: `RestaurantCandidate[]` + `FoodQueryDTO`
   - Output: `RankedRestaurant[]`

2. Create `core/search-orchestrator.ts`
   - Accept array of `RestaurantProvider[]`
   - Call providers in parallel
   - Merge duplicates
   - Use `RankingService` to rank
   - Return `RankedRestaurant[]`

3. Create unit tests

**Files to create:**
- `server/src/core/ranking-service.ts`
- `server/src/core/ranking-service.spec.ts`
- `server/src/core/search-orchestrator.ts`
- `server/src/core/search-orchestrator.spec.ts`

**Test:**
```typescript
const orchestrator = new SearchOrchestrator(
  [googlePlacesProvider],
  rankingService
);
const results = await orchestrator.search(query);
// Should return ranked results
```

---

#### Day 5: ResultExplainer

**Tasks:**
1. Create `llm/result-explainer.ts`
   - Extract explanation logic from `DialogueService`
   - Input: `{ query: FoodQueryDTO, results: RankedRestaurant[] }`
   - Output: `{ summary: string, perRestaurantText?: Record<string, string> }`

2. Create unit tests

**Files to create:**
- `server/src/llm/result-explainer.ts`
- `server/src/llm/result-explainer.spec.ts`

**Test:**
```typescript
const explainer = new ResultExplainer(llmProvider);
const explanation = await explainer.explain({ query, results });
// Should return user-friendly text in query.userLanguage
```

---

### Phase 3: Integration (Week 3)

**Goal:** Wire everything together and switch to new architecture.

#### Day 1-2: Session Management

**Tasks:**
1. Create `core/session-store.ts`
   - In-memory Map-based store (MVP)
   - Methods: `create()`, `get()`, `update()`, `delete()`
   - Auto-cleanup (TTL: 1 hour)

2. Update `chat.controller.ts` to use sessions

**Files to create:**
- `server/src/core/session-store.ts`

**Files to modify:**
- `server/src/api/chat.controller.ts`

---

#### Day 3: Wire New Flow

**Tasks:**
1. Update `/api/v2/chat` endpoint:
   ```typescript
   // Pseudo-code
   async function chatHandlerV2(req, res) {
     // 1. Parse (IntentParser)
     const query = await intentParser.parse({
       userText: req.body.message,
       userLocation: req.body.userLocation
     });
     
     // 2. Search (SearchOrchestrator)
     const results = await orchestrator.search(query);
     
     // 3. Explain (ResultExplainer)
     const { summary } = await explainer.explain({ query, results });
     
     // 4. Store session
     const session = sessionStore.create({ query, results });
     
     // 5. Return
     return res.json({
       sessionId: session.id,
       query,
       summary,
       results: results.slice(0, 10),
       meta: { tookMs, resultsCount: results.length }
     });
   }
   ```

2. Create `search.controller.ts` for List View
   - `GET /api/session/:id/results`

3. Create `swipe.controller.ts` for Swipe View
   - `POST /api/session/:id/swipe`

**Files to create:**
- `server/src/api/search.controller.ts`
- `server/src/api/swipe.controller.ts`

**Files to modify:**
- `server/src/api/chat.controller.ts`
- `server/src/routes/dialogue.routes.ts`

---

#### Day 4: Testing & Comparison

**Tasks:**
1. Test new flow end-to-end
2. Compare results with old flow:
   - Same queries
   - Compare result count
   - Compare result quality
   - Compare performance

3. Fix any discrepancies

**Test queries:**
```
1. "pizza in gedera"
2. "מסעדה רומנטית בגדרה"
3. "burger near me, open now"
4. "sushi in tel aviv, not expensive"
```

---

#### Day 5: Switch & Cleanup

**Tasks:**
1. Point `/api/dialogue` to new flow
   ```typescript
   // routes/dialogue.routes.ts
   router.post('/dialogue', chatHandlerV2); // Use new handler
   ```

2. Remove old code:
   - `dialogue.service.ts` (keep only what's reused)
   - `places.langgraph.ts` (replaced by GooglePlacesProvider)

3. Update frontend to use new response format (if needed)

4. Update documentation

**Files to delete:**
- `server/src/services/dialogue/dialogue.service.ts` (or archive)
- `server/src/services/places/orchestrator/places.langgraph.ts` (or archive)

**Files to modify:**
- `server/src/routes/dialogue.routes.ts`
- Frontend API service (if response format changed)

---

## Rollback Plan

If anything goes wrong at any phase:

### Phase 1 Rollback:
- Delete new DTO files
- No runtime impact (nothing is using them yet)

### Phase 2 Rollback:
- Delete new service files
- No runtime impact (old endpoint still works)

### Phase 3 Rollback:
- Revert route changes
- Point `/api/dialogue` back to old handler
- Keep new code for future retry

---

## Testing Strategy

### Unit Tests:
- ✅ `IntentParser` - Parse various queries
- ✅ `RankingService` - Score calculations
- ✅ `SearchOrchestrator` - Merge + rank logic
- ✅ `ResultExplainer` - Explanation generation

### Integration Tests:
- ✅ End-to-end flow: Text → DTO → Search → Rank → Explain
- ✅ Compare old vs new results
- ✅ Performance benchmarks

### Manual Tests:
- ✅ Postman collection with test queries
- ✅ Frontend testing (Chat, Swipe, List views)

---

## Performance Tracking

### Metrics to Monitor:

| Metric | Before | Target | Actual |
|--------|--------|--------|--------|
| Total time (avg) | 15-19s | 6-8s | TBD |
| LLM calls | 5-6 | 2 | TBD |
| Parse time | 4s | 3s | TBD |
| Search time | 8s | 2s | TBD |
| Explain time | 3s | 3s | TBD |

---

## Success Criteria

### Phase 1:
- ✅ DTOs compile and validate correctly
- ✅ GooglePlacesProvider returns same results as old code
- ✅ Both endpoints work (`/api/dialogue` and `/api/v2/chat`)

### Phase 2:
- ✅ IntentParser extracts correct FoodQueryDTO
- ✅ SearchOrchestrator returns ranked results
- ✅ ResultExplainer generates user-friendly text

### Phase 3:
- ✅ New flow is 50%+ faster than old flow
- ✅ Result quality is same or better
- ✅ All tests pass
- ✅ Frontend works with new API

---

## Risk Assessment

### Low Risk:
- ✅ Creating DTOs (no runtime impact)
- ✅ Creating Provider interface (no runtime impact)
- ✅ Adding new endpoint (old one still works)

### Medium Risk:
- ⚠️ Extracting LLM logic (might miss edge cases)
- ⚠️ Ranking algorithm (might change result order)

### High Risk:
- ⚠️ Switching main endpoint (affects all users)
- **Mitigation:** Feature flag, gradual rollout, easy rollback

---

## Next Steps (Tomorrow)

**When you start tomorrow:**

1. **Read these docs:**
   - `food-agent-architecture.md` (architecture overview)
   - `migration-plan.md` (this file)

2. **Start Phase 1, Day 1:**
   - Create `dto/food-query.dto.ts`
   - Create `dto/restaurant.dto.ts`
   - Create `dto/search-session.dto.ts`

3. **Tell Cursor:**
   ```
   "I want to implement Phase 1, Day 1 of the migration plan.
   Create the DTO files as specified in docs/migration-plan.md.
   Follow the architecture in docs/food-agent-architecture.md."
   ```

---

## Questions & Decisions

### Decided:
- ✅ Use gradual migration (not big bang)
- ✅ Keep old code working during migration
- ✅ Start with in-memory session store (not Redis)
- ✅ MVP: Google Places only (TripAdvisor later)

### To Decide:
- ⏳ When to add Redis? (Phase 2 or later?)
- ⏳ When to add TripAdvisor? (After Phase 3?)
- ⏳ When to add ML-based ranking? (Future)

---

**Last Updated:** November 22, 2025  
**Status:** Ready to start Phase 1  
**Next Review:** After Phase 1 completion


