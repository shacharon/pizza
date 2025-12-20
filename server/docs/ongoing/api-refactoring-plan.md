# API Refactoring Plan - Search-First Architecture

**Date Started:** December 20, 2024  
**Status:** 🟡 In Progress  
**Current Phase:** Phase 1 - Foundation & Services

---

## Goal

Refactor `/api/places/search` to be:
- **Faster:** 6-8s (down from 10-13s) - 40-50% improvement
- **Cleaner:** Singleton services, separation of concerns, testable
- **Feature-complete:** Session context, filter metadata, suggestions

---

## Current Problems

### Performance (10-13s)
- ❌ Service instantiation on every call (9 times!)
- ❌ Duplicate geocoding (same city multiple times)
- ❌ Sequential LLM calls (not parallelized)
- ❌ No caching

### Architecture
- ❌ 360+ line monolithic `run()` method
- ❌ Complex fallback logic mixed with main flow
- ❌ Hard to test and extend

### Missing Features
- ❌ No session/context management
- ❌ No filter metadata transparency
- ❌ No suggestion generation

---

## Solution Architecture

```
PlacesService (main orchestrator)
├─ SessionManager (context memory)
├─ GeocodeCache (eliminate duplicates)
├─ SmartDefaultsEngine (apply opennow, radius, etc)
├─ SuggestionGenerator (contextual refinement chips)
└─ Refactored PlacesLangGraph (cleaner, faster)
```

---

## Implementation Phases

### ✅ Phase 0: Planning & Documentation
- [x] Create plan document
- [x] Document current state
- [x] Design new architecture

### ✅ Phase 1: Foundation & Services (Days 1-2)
**Current Status:** ✅ COMPLETED

#### Tasks:
- [x] Create `SessionManager` for context
- [x] Create `GeocodeCache` for eliminating duplicates
- [x] Create `SmartDefaultsEngine`
- [x] Create `SuggestionGenerator`
- [ ] Create `PlacesService` main orchestrator (moved to Phase 2)

**Deliverable:** ✅ Core services created and ready to integrate

---

### 🟡 Phase 2: Refactor PlacesLangGraph (Days 3-4)
**Status:** 🟡 STARTING

#### Tasks:
- [ ] Create `PlacesService` main orchestrator
- [ ] Extract singletons to constructor in PlacesLangGraph
- [ ] Simplify `run()` method
- [ ] Add geocoding cache integration
- [ ] Parallelize translation + intent
- [ ] Remove duplicate instantiations

**Deliverable:** Cleaner PlacesLangGraph, faster performance

---

### ⏳ Phase 3: Add Session Context (Day 5)
**Status:** Not started

#### Tasks:
- [ ] Integrate SessionManager into PlacesService
- [ ] Detect refinement vs fresh search
- [ ] Merge refinements with context
- [ ] Return session metadata

**Deliverable:** Context-aware search

---

### ⏳ Phase 4: Filter Metadata (Day 6)
**Status:** Not started

#### Tasks:
- [ ] Track auto-applied vs user-requested filters
- [ ] Return filter metadata in response
- [ ] Add filter transparency data

**Deliverable:** API returns what filters are active

---

### ⏳ Phase 5: Suggestions (Day 7)
**Status:** Not started

#### Tasks:
- [ ] Integrate SuggestionGenerator
- [ ] Return contextual suggestions in response
- [ ] Test various scenarios

**Deliverable:** API suggests refinements

---

### ⏳ Phase 6: Performance Optimization (Day 8)
**Status:** Not started

#### Tasks:
- [ ] Measure current performance
- [ ] Optimize bottlenecks
- [ ] Add performance logging
- [ ] Target < 8s response time

**Deliverable:** 40-50% faster API

---

### ⏳ Phase 7: Testing & Documentation (Day 9)
**Status:** Not started

#### Tasks:
- [ ] Update Postman tests
- [ ] Add unit tests for new services
- [ ] Document API changes
- [ ] Update README

**Deliverable:** Well-tested, documented API

---

## Files to Create

1. `server/src/services/places/places.service.ts`
2. `server/src/services/places/session/session-manager.ts`
3. `server/src/services/places/cache/geocode-cache.ts`
4. `server/src/services/places/defaults/smart-defaults.ts`
5. `server/src/services/places/suggestions/suggestion-generator.ts`

## Files to Modify

1. `server/src/services/places/orchestrator/places.langgraph.ts`
2. `server/src/services/places/query/query-builder.service.ts`
3. `server/src/controllers/places/places.controller.ts`

---

## Performance Target

| Metric | Before | Target | Status |
|--------|--------|--------|--------|
| Response time | 10-13s | 6-8s | ⏳ Not measured |
| Service instantiations | 9/request | 0/request | ⏳ Not implemented |
| Geocoding | Duplicates | Cached | ⏳ Not implemented |
| Session context | None | Working | ⏳ Not implemented |
| Filter metadata | None | Returned | ⏳ Not implemented |
| Suggestions | None | Generated | ⏳ Not implemented |

---

## Progress Log

### 2024-12-20

#### Morning: Planning
- ✅ Created refactoring plan
- ✅ Documented current problems
- ✅ Designed new architecture

#### Afternoon: Phase 1 Implementation
- ✅ Created `SessionManager` (context memory with TTL)
- ✅ Created `GeocodeCache` (eliminate duplicate API calls)
- ✅ Created `SmartDefaultsEngine` (auto-apply opennow, track filters)
- ✅ Created `SuggestionGenerator` (contextual refinement chips)
- ✅ Created unit tests for all Phase 1 services
- ✅ **All 8 tests passing!**
- ✅ **Phase 1 COMPLETE and TESTED!**
- 🟡 **Ready for Phase 2: Refactor PlacesLangGraph**

---

## Next Steps

**Immediate (Phase 1):**
1. Create SessionManager service
2. Create GeocodeCache service
3. Create SmartDefaultsEngine
4. Create SuggestionGenerator
5. Create PlacesService orchestrator

**After Phase 1:**
- Refactor PlacesLangGraph to use new services
- Integrate caching and context
- Add filter metadata
- Performance testing

---

## Notes

- API contract remains backward compatible
- No breaking changes to response format
- New fields are optional additions
- Frontend can consume new features incrementally

---

**Last Updated:** 2024-12-20  
**Next Review:** After Phase 1 completion

