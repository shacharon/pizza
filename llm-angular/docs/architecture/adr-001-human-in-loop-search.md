# ADR-001: Human-in-the-Loop Search Architecture

**Status:** Accepted  
**Date:** 2025-12-20  
**Authors:** Development Team  
**Deciders:** Product & Engineering

---

## Context

We are migrating the Angular frontend to use a unified search API (`POST /api/search`) that replaces multiple legacy endpoints. As part of this migration, we need to establish a pattern for handling user actions (e.g., save favorite, get directions, call restaurant) that aligns with our long-term vision of action-based AI systems.

### Current State

- Multiple endpoints: `/api/places/search`, `/api/dialogue`, `/api/nlu/parse`
- Actions executed immediately without proposal/approval flow
- No distinction between read-only and side-effect actions
- Limited traceability of user intent and action execution

### Future Vision

A scalable Human-in-the-Loop architecture where:

- AI proposes actions based on user context
- User explicitly approves actions with side effects
- System tracks action lifecycle (proposed → approved → executed)
- Clear separation between L0 (read), L1 (soft), L2 (hard) actions

---

## Decision

We will implement the Human-in-the-Loop pattern **gradually**, starting with:

### Phase 1: Discovery-First Search (Current)

**Scope:** Food discovery only

- `/api/search` returns results + **proposed actions**
- Actions are UI-level proposals (no backend approval yet)
- Only L0 (read-only) actions executed immediately
- L1+ actions proposed but execution deferred

**Proposed Actions for Discovery:**

**L0 - Read-only (Execute immediately):**

- `GET_DIRECTIONS` - Opens Google Maps
- `CALL_RESTAURANT` - Opens phone dialer
- `VIEW_DETAILS` - Shows restaurant details
- `VIEW_MENU` - Opens restaurant website
- `SHARE` - Opens share dialog

**L1 - Soft actions (Approval UI shown, execution deferred):**

- `SAVE_FAVORITE` - Saves to local favorites (localStorage)

**L2 - Hard actions (Not in Phase 1):**

- `BOOK_TABLE` - Future: Requires backend approval
- `START_ORDER` - Future: Requires backend approval
- `SEND_MESSAGE` - Future: Requires backend approval

### Phase 2: Backend Approval Service (Future)

When ordering/booking is added:

- Backend `/api/actions/{id}/approve` endpoint
- Redis for pending actions with TTL
- Audit log for approval tracking
- Idempotency keys for execution

---

## Architecture

### Frontend Components

```
SearchFacade (signals-based state)
  ├── UnifiedSearchService (HTTP to /api/search)
  ├── ActionService (action lifecycle management)
  │   ├── proposeAction(type, level, restaurant)
  │   ├── approveAction(actionId)
  │   ├── rejectAction(actionId)
  │   └── executeAction(action, restaurant)
  └── SessionService (session ID management)

Standalone Components:
  ├── SearchBar (input + loading state)
  ├── MicroAssistCard (low confidence assistance)
  ├── RestaurantCard (results + quick actions)
  ├── RefinementChips (search refinements)
  └── RestaurantDetails (selected item + detailed actions)
```

### Action Lifecycle (Phase 1)

```
User clicks action button
  ↓
ActionService.proposeAction(type, level, restaurant)
  ↓
if (level === 0) {
  Execute immediately (open maps, call, etc.)
  Emit actionExecuted event
} else {
  Store in pending actions (signal)
  Show approval modal (future)
  Wait for user confirmation
}
```

### Response Contract

```typescript
interface SearchResponse {
  sessionId: string;
  query: ParsedQuery;
  results: Restaurant[];
  chips: RefinementChip[];
  assist?: MicroAssist;
  proposedActions?: {
    perResult: ActionDefinition[]; // Quick actions per card
    selectedItem: ActionDefinition[]; // Detailed actions when selected
  };
  meta: SearchMeta;
}

interface ActionDefinition {
  id: string;
  type: ActionType;
  level: 0 | 1 | 2;
  label: string;
  icon: string;
  requiresSelection?: boolean;
  enabled?: boolean;
}
```

---

## Rationale

### Why Propose Actions Now (Even Though Execution is Deferred)?

1. **UI Consistency:** Frontend designed with approval states from day one
2. **Intent Tracking:** Capture what users want to do, even if not executed
3. **Analytics:** Track action click rates, popular actions, user intent
4. **Clean Upgrade Path:** When L1/L2 execution is added, only backend changes needed
5. **User Education:** Users learn the action pattern before commitment required

### Why L0 vs L1 vs L2 Levels?

**L0 (Read-only):**

- No side effects
- No data modification
- Safe to execute immediately
- Examples: View, Call (just opens dialer), Directions, Share

**L1 (Soft actions):**

- Local side effects only
- Reversible
- No external commitment
- Examples: Save favorite (localStorage), Create draft

**L2 (Hard actions):**

- External side effects
- Financial commitment
- Irreversible or costly to reverse
- Requires explicit approval + audit
- Examples: Book table, Place order, Send message

### Why Gradual Migration?

1. **Risk Mitigation:** Legacy routes remain functional
2. **Feature Flag Control:** Instant rollback if issues arise
3. **A/B Testing:** Compare old vs new UX
4. **User Feedback:** Iterate before full rollout
5. **Team Velocity:** Ship value incrementally

---

## Consequences

### Positive

✅ **Clear action separation** - L0/L1/L2 boundaries established  
✅ **Future-proof** - Backend approval service drops in cleanly  
✅ **Intent data** - Analytics on what users want to do  
✅ **Low risk** - Gradual rollout with instant rollback  
✅ **SOLID frontend** - Services follow single responsibility

### Negative

⚠️ **Temporary duplication** - L1 actions in both frontend (localStorage) and backend (future)  
⚠️ **User confusion** - "Save" button works locally, may expect sync  
⚠️ **Extra complexity** - Action service adds layer even for L0 actions

### Mitigations

- Document localStorage limitation in UI (tooltip: "Saved locally")
- Add "Sync favorites" feature when backend ready
- Keep ActionService simple - single responsibility (proposal lifecycle)

---

## Implementation Strategy

### Week 1: Internal Testing

- Feature flag: `unifiedSearch = false` by default
- Accessible at `/search-preview` for developers
- Backend returns `proposedActions` in response
- Frontend renders action buttons, tracks clicks

### Week 2: Beta Users (10%)

- Enable flag for 10% of users (localStorage-based randomization)
- Monitor: search latency, action click rate, error rate
- Collect feedback via in-app survey

### Week 3: Gradual Rollout (50%)

- Increase to 50% based on metrics
- Compare: new search vs legacy (A/B)
- Iterate on UX based on data

### Week 4: Full Rollout (100%)

- Enable for all users
- Mark legacy routes as deprecated
- Plan backend approval service (Phase 2)

---

## Rollback Plan

**If critical issues:**

1. Disable feature flag: `featureFlagService.disable('unifiedSearch')`
2. Users redirect to `/food/grid` (legacy)
3. Fix in parallel while users on stable route
4. Re-enable when validated

**No deployment needed** - flag toggle is instant.

---

## Success Metrics

| Metric              | Target  | How to Measure              |
| ------------------- | ------- | --------------------------- |
| Search latency      | <5s p95 | Backend meta.tookMs         |
| Action click rate   | >30%    | Analytics: actions/searches |
| L0 vs L1 ratio      | 80/20   | Count by action.level       |
| Assist dismiss rate | <50%    | Track dismiss events        |
| User satisfaction   | >4.0/5  | Post-search survey          |
| Error rate          | <1%     | Error signal tracking       |

---

## Related Decisions

- **ADR-002:** Action approval backend service (future)
- **ADR-003:** Analytics instrumentation for actions (future)
- **Backend Phase 3:** Unified search API implementation (complete)

---

## References

- Backend Architecture: `server/docs/ongoing/PHASE-3-FINAL-STATUS.md`
- API Documentation: `server/docs/api/unified-search-api.md`
- Human-in-the-Loop Vision: (provided by product team)

---

## Changelog

- **2025-12-20:** Initial ADR created
- **2025-12-20:** Ratified by engineering team

---

**Status: ACCEPTED** ✅

This decision guides Phase 1 implementation. Backend approval service (Phase 2) will require a separate ADR when ordering/booking features are added.







