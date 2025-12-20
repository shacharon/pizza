# BFF Migration Plan - Phase 2

**Status:** 📋 PLANNED (Not Started)  
**Scheduled:** Next Sprint  
**Prerequisites:** ✅ Phase 1 Complete

---

## Vision

Transform current architecture to match requirements document:
- **ONE** unified `/search` endpoint (BFF pattern)
- Capability-based microservices (not UX-mode split)
- Micro-assist UI (inline cards, not chat bubbles)
- Confidence-based assist triggering

---

## Current State (After Phase 1)

```
Frontend
  ↓
TWO separate endpoints:
  - /api/places/search (direct search)
  - /api/dialogue (conversational with chat bubbles)

Both use singleton pattern ✅
Both are fast ✅
But: Contradicts requirements document ❌
```

---

## Target State (Phase 2)

```
Frontend
  ↓
ONE BFF endpoint:
  POST /search
    ↓
  Orchestrator (decides: attach assist or not)
    ↓
  Capability Services:
    - Intent Service (parse + confidence)
    - Places Provider Service
    - Suggestions Service
    - Session Service
    - Ranking Service
```

---

## Migration Strategy

See detailed plan: [`../../.cursor/plans/two-phase_api_strategy_d78afb03.plan.md`](../../.cursor/plans/two-phase_api_strategy_d78afb03.plan.md)

### Step 1: Create BFF Facade
- New endpoint: `POST /search`
- Initially proxies to PlacesLangGraph
- Frontend can start migrating

### Step 2: Extract Capability Services
- Intent Service (confidence scoring)
- Places Provider Service
- Suggestions Service
- Session Service
- Ranking Service

### Step 3: Add Confidence + Assist Logic
- Orchestrator decides: low confidence → attach `assist`
- Response: `{ results, chips, assist?: AssistPayload }`

### Step 4: Frontend Changes
- Remove chat bubble UI
- Add micro-assist inline card
- Call unified `/search`

### Step 5: Deprecate Old Endpoints
- Mark `/api/dialogue` and `/api/places/search` as deprecated
- Monitor usage
- Eventually remove

---

## Timeline

- **Week 1:** Design BFF architecture, create capability service interfaces
- **Week 2:** Implement BFF facade + orchestrator
- **Week 3:** Extract capability services
- **Week 4:** Frontend micro-assist UI + migration
- **Week 5:** Testing, deprecation, cleanup

---

## Requirements Alignment

This migration will align code with requirements document:

### ✅ Will Have:
- Single `/search` endpoint
- BFF decides assist (not frontend)
- Micro-assist UI (inline, dismissible)
- Capability-based services
- Max 1-2 assist turns
- Results always visible

### ❌ Will Remove:
- Separate dialogue endpoint
- Chat bubble UI
- UX-mode service split

---

## Success Criteria

1. ✅ Single `/search` endpoint works
2. ✅ Returns `assist` only when needed (low confidence)
3. ✅ Frontend shows inline AssistCard (not chat bubbles)
4. ✅ Max 1-2 assist turns per session
5. ✅ Results always visible
6. ✅ Performance maintained (8-10s)
7. ✅ Code matches requirements document

---

## Notes

- Phase 1 provides solid foundation (singletons, session, suggestions)
- Phase 2 is strategic refactor (not urgent)
- Current system works well after Phase 1
- Take time to do Phase 2 right

---

**Next Action:** Review and approve this plan before starting Phase 2

