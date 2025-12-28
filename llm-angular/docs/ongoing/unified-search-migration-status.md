# Unified Search Migration Status

**Last Updated:** 2025-12-20  
**Status:** 🟡 In Progress (Phase 1 - Documentation)  
**Target Completion:** 2025-12-24

---

## Overview

Migrating Angular frontend from legacy search endpoints to unified `/api/search` endpoint with Human-in-the-Loop action pattern.

**Approach:** Gradual migration with feature flag control  
**Risk Level:** 🟢 Low (parallel routes, instant rollback)

---

## Current State

### Legacy Routes (Active)

- `/food` - Food landing page
- `/food/grid` - Grid view with search
- `/food/swipe` - Swipe card interface
- `/food/map` - Map view
- `/dialogue` - Conversational search

### Legacy Services Used

- `FoodService` - Uses `/api/nlu/parse` + `/api/food/dialogue`
- `DialogueApiService` - Uses `/api/dialogue`
- Mixed state management (RxJS + local state)

### Legacy Endpoints

- `POST /api/places/search` - Main search (deprecated 2026-06-01)
- `POST /api/dialogue` - Conversational (deprecated 2026-06-01)
- `POST /api/nlu/parse` - Intent parsing

---

## Target State

### New Routes

- `/search` - Unified search page (feature flag gated)
- `/search-preview` - Always accessible for testing

### New Services

- `UnifiedSearchService` - HTTP client for `/api/search`
- `ActionService` - Action lifecycle management (L0/L1/L2)
- `SessionService` - Session ID management
- `FeatureFlagService` - Gradual rollout control

### New Endpoint

- `POST /api/search` - Unified search with action proposals ✅ Complete
- `GET /api/search/stats` - Search statistics ✅ Complete

---

## Migration Phases

### ✅ Phase 0: Backend Preparation (Complete)

**Completed:** 2025-12-19

- [x] Unified `/api/search` endpoint created
- [x] 35+ integration tests passing
- [x] Action proposal DTOs defined
- [x] Documentation complete
- [x] Performance validated (<5s)

**Files:**

- `server/src/services/search/` - All capability services
- `server/src/controllers/search/search.controller.ts`
- `server/tests/unified-search-integration.test.ts`

---

### 🟡 Phase 1: Documentation & Planning (In Progress)

**Started:** 2025-12-20  
**Target:** 2025-12-20 EOD

#### Tasks

- [x] ADR-001: Human-in-the-Loop architecture
- [x] Migration status tracker (this document)
- [ ] UI/UX specification document
- [ ] Update main README with migration notes
- [ ] Team sync: Review ADR and plan

**Deliverables:**

- Architecture decision record
- Status tracking document
- UI specification
- Rollout strategy

---

### ⚪ Phase 2: Backend Response Updates

**Target:** 2025-12-20 Evening

#### Tasks

- [ ] Update `SearchResponseSchema` with `proposedActions`
- [ ] Add `generateProposedActions()` to `SearchOrchestrator`
- [ ] Include actions in response builder
- [ ] Add integration test for action proposals
- [ ] Verify response structure with Postman

**Files to Modify:**

- `server/src/services/search/types/search-response.dto.ts`
- `server/src/services/search/types/search.types.ts`
- `server/src/services/search/orchestrator/search.orchestrator.ts`
- `server/tests/unified-search-integration.test.ts`

**Acceptance Criteria:**

- `/api/search` returns `proposedActions` object
- 6 action types defined (VIEW_DETAILS, GET_DIRECTIONS, etc.)
- L0/L1/L2 levels assigned correctly
- Test validates action structure

---

### ⚪ Phase 3: Shared Frontend Infrastructure

**Target:** 2025-12-21 Morning

#### Tasks

- [ ] Create `search.types.ts` (TypeScript interfaces)
- [ ] Create `action.types.ts` (Action-related types)
- [ ] Create `UnifiedSearchService` (HTTP client)
- [ ] Create `ActionService` (action lifecycle)
- [ ] Create `SessionService` (session management)
- [ ] Create `FeatureFlagService` (rollout control)
- [ ] Write unit tests for all services

**New Files:**

- `llm-angular/src/app/shared/models/search.types.ts`
- `llm-angular/src/app/shared/models/action.types.ts`
- `llm-angular/src/app/shared/services/unified-search.service.ts`
- `llm-angular/src/app/shared/services/action.service.ts`
- `llm-angular/src/app/shared/services/session.service.ts`
- `llm-angular/src/app/shared/services/feature-flag.service.ts`

**Acceptance Criteria:**

- All services injectable as `providedIn: 'root'`
- Services use Angular signals for state
- Unit tests for each service pass
- No circular dependencies

---

### ⚪ Phase 4: Standalone Components

**Target:** 2025-12-21 Afternoon + Evening

#### Components to Create

##### 4.1 Search Facade

- [ ] `UnifiedSearchFacade` service
- [ ] Signal-based state management
- [ ] Orchestrates search flow
- [ ] Error handling

##### 4.2 Search Bar

- [ ] `SearchBarComponent` (standalone, OnPush)
- [ ] Input binding, search output
- [ ] Loading state, accessibility
- [ ] Unit tests

##### 4.3 Micro-Assist Card

- [ ] `MicroAssistCardComponent` (standalone, OnPush)
- [ ] Conditional rendering (confidence < 0.7)
- [ ] Action buttons, dismiss
- [ ] Unit tests

##### 4.4 Restaurant Card

- [ ] `RestaurantCardComponent` (standalone, OnPush)
- [ ] Quick action buttons (L0: Directions, Call, Save)
- [ ] Click to select
- [ ] Unit tests

##### 4.5 Refinement Chips

- [ ] `RefinementChipsComponent` (standalone, OnPush)
- [ ] Horizontal scroll
- [ ] Chip click events
- [ ] Unit tests

##### 4.6 Restaurant Details (Optional)

- [ ] `RestaurantDetailsComponent` (standalone, OnPush)
- [ ] Slide-out panel
- [ ] Detailed action buttons
- [ ] Unit tests

**Files:**

- `llm-angular/src/app/features/unified-search/unified-search.facade.ts`
- `llm-angular/src/app/features/unified-search/components/search-bar/`
- `llm-angular/src/app/features/unified-search/components/micro-assist-card/`
- `llm-angular/src/app/features/unified-search/components/restaurant-card/`
- `llm-angular/src/app/features/unified-search/components/refinement-chips/`
- `llm-angular/src/app/features/unified-search/components/restaurant-details/`

**Acceptance Criteria:**

- All components standalone
- All use `ChangeDetectionStrategy.OnPush`
- Signals for state management
- Accessibility: ARIA labels, keyboard nav
- SCSS in separate files (no inline styles)
- HTML in separate files (no inline templates)

---

### ⚪ Phase 5: Main Search Page

**Target:** 2025-12-22 Morning

#### Tasks

- [ ] Create `UnifiedSearchPageComponent`
- [ ] Layout: header, assist, results, empty state
- [ ] Integrate all components
- [ ] Responsive design (mobile breakpoints)
- [ ] Add route with feature flag guard
- [ ] Create `featureFlagGuard`
- [ ] Integration test (component spec)

**Files:**

- `llm-angular/src/app/features/unified-search/unified-search-page/unified-search-page.component.ts`
- `llm-angular/src/app/features/unified-search/unified-search-page/unified-search-page.component.html`
- `llm-angular/src/app/features/unified-search/unified-search-page/unified-search-page.component.scss`
- `llm-angular/src/app/core/guards/feature-flag.guard.ts`
- `llm-angular/src/app/app.routes.ts` (update)

**Acceptance Criteria:**

- `/search-preview` always accessible
- `/search` gated by feature flag (redirects to `/food/grid` if disabled)
- Full user flow works: search → results → action → refinement
- Mobile responsive
- Loading/error states handled

---

### ⚪ Phase 6: Testing

**Target:** 2025-12-22 Afternoon

#### Test Coverage

- [ ] Unit tests: All services (6 files)
- [ ] Unit tests: All components (6 files)
- [ ] Integration test: Full search page flow
- [ ] E2E test: End-to-end user journey (optional)
- [ ] Accessibility audit: WAVE or axe DevTools
- [ ] Manual testing: 6 languages, 3 cities
- [ ] Performance: Lighthouse audit

**Acceptance Criteria:**

- > 80% code coverage for new code
- All Jest tests pass
- No accessibility violations
- Lighthouse score >90 (performance, accessibility)

---

### ⚪ Phase 7: Feature Flag Rollout

**Target:** 2025-12-23

#### Tasks

- [ ] Add feature flag toggle to admin panel
- [ ] Add "Search (New)" link to main navigation
- [ ] Add "NEW" badge to indicate beta
- [ ] Document rollout strategy
- [ ] Enable for developers first
- [ ] Monitor metrics dashboard

**Rollout Schedule:**

| Week | Audience   | Percentage    | Goal                              |
| ---- | ---------- | ------------- | --------------------------------- |
| 1    | Internal   | 0% → Dev only | Find bugs, validate UX            |
| 2    | Beta users | 10%           | Collect feedback, monitor metrics |
| 3    | General    | 50%           | A/B test vs legacy                |
| 4    | All users  | 100%          | Full rollout, deprecate legacy    |

**Metrics to Monitor:**

- Search latency (p50, p95, p99)
- Action click rate (by level: L0, L1)
- Assist card show/dismiss rate
- Error rate
- User satisfaction (post-search survey)

**Rollback Triggers:**

- Error rate >5%
- Search latency >10s p95
- Critical bug affecting searches
- User satisfaction <3.0/5

---

### ⚪ Phase 8: Documentation & Cleanup

**Target:** 2025-12-24

#### Tasks

- [ ] User guide: How to use unified search
- [ ] Developer guide: Architecture, adding features
- [ ] API migration guide: Frontend developers
- [ ] Update main README
- [ ] Add inline code comments
- [ ] Remove dead code (if any)
- [ ] Archive legacy code (mark as deprecated)

**Documentation Files:**

- `llm-angular/docs/user-guide-unified-search.md`
- `llm-angular/docs/developer-guide-unified-search.md`
- `llm-angular/docs/api-migration-guide.md`
- `llm-angular/README.md` (update)

---

## Rollback Plan

### Instant Rollback (Feature Flag)

**If critical issues arise:**

```typescript
// Disable via browser console or admin panel
localStorage.setItem("ff_unifiedSearch", "false");
location.reload();
```

**Result:**

- All users redirect to `/food/grid` (legacy)
- No code deployment needed
- Fix bugs while users on stable route
- Re-enable when validated

### Code Rollback (Emergency)

**If feature flag fails:**

1. Revert `app.routes.ts` change (remove `/search` route)
2. Deploy new build
3. All users on legacy routes

---

## Success Metrics

| Metric               | Current (Legacy)   | Target (New) | Actual (TBD) |
| -------------------- | ------------------ | ------------ | ------------ |
| Search latency (p95) | ~10-13s            | <5s          | -            |
| Results consistency  | Varies by language | 95%+ overlap | -            |
| Action click rate    | N/A (no actions)   | >30%         | -            |
| User satisfaction    | Unknown            | >4.0/5       | -            |
| Mobile usage         | ~40%               | Maintain 40% | -            |
| Error rate           | <1%                | <1%          | -            |

---

## Risk Assessment

| Risk                    | Likelihood | Impact | Mitigation                       |
| ----------------------- | ---------- | ------ | -------------------------------- |
| Backend API down        | Low        | High   | Feature flag rollback            |
| Performance regression  | Medium     | Medium | Monitor metrics, optimize        |
| User confusion          | Medium     | Low    | Clear UI, tooltips, help         |
| Mobile rendering issues | Low        | Medium | Responsive design, testing       |
| Legacy code conflicts   | Low        | Low    | Parallel routes, no shared state |

---

## Dependencies

### External

- Backend `/api/search` endpoint ✅ Ready
- Google Places API (existing)
- LLM services (existing)

### Internal

- Angular 19 ✅ Ready
- Standalone components ✅ Supported
- Signals ✅ Supported
- HttpClient ✅ Ready

### Team

- Frontend: 1 developer (primary)
- Backend: Available for questions
- QA: Manual testing in Phase 6
- Product: Final approval before 100% rollout

---

## Communication Plan

### Week 1: Internal

- Slack announcement: "Unified search in preview"
- Link to `/search-preview` for testing
- Feedback form

### Week 2: Beta

- Email to beta users: "Try our new search"
- In-app banner: "Check out our improved search"
- Feedback widget

### Week 3: Gradual

- Blog post: "Faster, smarter search"
- Social media: Feature highlights
- User guide published

### Week 4: Full Launch

- Announcement: "New search for everyone"
- Help center update
- Deprecation notice for legacy routes

---

## Questions & Decisions

### Q: Should we migrate all food routes at once?

**A:** No. Start with `/search` only. Keep `/food/grid`, `/food/swipe`, `/food/map` as-is for now. They can adopt `UnifiedSearchService` later if desired.

### Q: What about offline support?

**A:** Phase 1: None. Phase 2: Cache responses in IndexedDB (future ADR).

### Q: Should L1 actions sync to backend?

**A:** Phase 1: localStorage only. Phase 2: Sync when backend approval service ready.

### Q: How to handle action clicks in analytics?

**A:** Phase 7: Add event tracking with action type, level, and context.

---

## Next Steps

**Immediate (Today):**

1. ✅ Create ADR-001
2. ✅ Create this status document
3. ⏭️ Create UI/UX specification
4. ⏭️ Team review of ADR

**Tomorrow (Phase 2):**

1. Update backend response with `proposedActions`
2. Test with Postman
3. Start Phase 3: Frontend infrastructure

---

## Changelog

- **2025-12-20 10:00** - Migration initiated, ADR created
- **2025-12-20 10:15** - Status document created
- _(Updates will be added as phases complete)_

---

**Current Phase:** 🟡 Phase 1 - Documentation  
**Overall Progress:** 5% (1/8 phases)  
**On Track:** ✅ Yes












