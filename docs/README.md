# System Documentation Index

> **Last Updated:** December 27, 2024  
> **Current Phase:** Phase 1 - Step 1 Complete

---

## Quick Start

If you're new to this codebase, start here:

1. 📜 **[Phase 0: System Definition](./PHASE_0_SYSTEM_DEFINITION.md)** - The "constitution" of the system
2. 📋 **[Implementation Status](./IMPLEMENTATION_STATUS.md)** - Current state and progress
3. 🏗️ **[Backend Architecture](./BACKEND_ARCHITECTURE.md)** - High-level system design

---

## Document Categories

### 🎯 Foundation (MUST READ)

These documents define what the system is and is not.

| Document | Purpose | Status |
|----------|---------|--------|
| [**Phase 0: System Definition**](./PHASE_0_SYSTEM_DEFINITION.md) | Authoritative spec - architectural guardrails | ✅ Complete |
| [**Definition of Done**](../server/docs/definition-of-done.md) | Acceptance criteria for all search requests | ✅ Complete |

**When to read:** Before making any code changes.

---

### 🏗️ Architecture

High-level system design and component relationships.

| Document | Purpose | Status |
|----------|---------|--------|
| [**Backend Architecture**](./BACKEND_ARCHITECTURE.md) | Complete system architecture with LLM passes | ✅ Complete |
| [**Server Structure & LLM Calls**](./SERVER_STRUCTURE_AND_LLM_CALLS.md) | Folder tree, LLM locations, interfaces | ✅ Complete |

**When to read:** Understanding system design or adding new components.

---

### 📊 Implementation

Detailed implementation notes and validation reports.

| Document | Purpose | Status |
|----------|---------|--------|
| [**Implementation Status**](./IMPLEMENTATION_STATUS.md) | Current progress, compliance matrix, next steps | ✅ Complete |
| [**Phase 1 Step 1 Validation**](./PHASE_1_STEP_1_VALIDATION.md) | Step 1 validation against Phase 0 | ✅ Complete |
| [**Phase 1 i18n Implementation**](./PHASE1_I18N_IMPLEMENTATION.md) | i18n implementation summary | ✅ Complete |

**When to read:** Tracking progress or validating changes.

---

## Key Concepts

### The Two-Pass LLM Architecture

```
User Query
    ↓
┌─────────────────────┐
│   LLM PASS A        │  Intent Parsing
│  (PlacesIntent)     │  (places/intent/places-intent.service.ts)
└──────────┬──────────┘
           │ ParsedIntent
           ▼
┌──────────────────────────┐
│  DETERMINISTIC PIPELINE  │
│  • Geocoding             │  ✅ Code only
│  • Search (Google API)   │  ✅ Code only
│  • Ranking               │  ✅ Code only
│  • City Filtering        │  ✅ Code only
│  • Grouping              │  ✅ Code only
│  • Chip Generation       │  ✅ Code only (i18n)
│  • Failure Detection     │  ✅ Code only
└──────────┬───────────────┘
           │ System State
           ▼
┌─────────────────────┐
│   LLM PASS B        │  Assistant Narration
│  (AssistPayload)    │  (search/assistant/assistant-narration.service.ts)
└──────────┬──────────┘
           │
           ▼
    SearchResponse
    (to frontend)
```

**Critical:** Only 2 LLM calls are allowed in the main search path.

---

### Contracts

#### Input
```typescript
SearchRequest {
  query: string;
  sessionId?: string;
  filters?: {...};
  debug?: boolean;
}
```

#### Semantic
```typescript
ParsedIntent {
  query: string;
  location?: {...};
  filters: {...};
  language: string;
  requiresLiveData?: boolean;
  // ... more fields
}
```

#### Output
```typescript
SearchResponse {
  sessionId: string;
  query: {...};
  results: RestaurantResult[];
  chips: RefinementChip[];
  assist: AssistPayload;        // REQUIRED
  meta: {
    failureReason: FailureReason;  // REQUIRED
    // ... more fields
  };
  diagnostics?: Diagnostics;    // Dev/debug only
}
```

---

### Phase 0 Principles (Immutable)

1. **Two-Pass LLM Only** - Exactly 2 LLM calls: Intent + Narration
2. **Deterministic Truth** - Ranking, filtering, failure detection are code-only
3. **Assistant is Helper** - Guides, doesn't decide
4. **Single Source of Truth** - `SearchResponse` is the only output
5. **Language Invariants** - Output language = input language
6. **Live Data Policy** - Never hallucinate "open now" status

---

## Current Status

### ✅ Phase 0: System Definition
**Status:** COMPLETE  
**Compliance:** N/A (defines compliance)

### ✅ Phase 1 - Step 1: Contracts + DoD + Diagnostics
**Status:** COMPLETE  
**Compliance:** 100% (6/6 principles)  
**Violations:** 0

### 🔜 Phase 2: Deterministic Pipeline Hardening
**Status:** NEXT  
**Blocked By:** Nothing

---

## Compliance Checklist

Before merging any change, verify:

- [ ] Uses only 2 LLM calls (Pass A + Pass B)?
- [ ] No LLM in ranking, filtering, or failure detection?
- [ ] Returns complete `SearchResponse` with `assist`?
- [ ] Language = `ParsedIntent.language` throughout?
- [ ] No "open now" claims without verification?
- [ ] Chips generated from i18n?
- [ ] `failureReason` computed deterministically?
- [ ] Diagnostics only in dev/debug mode?
- [ ] No new response types introduced?
- [ ] Changes documented?

---

## File Locations

### Key Backend Files

**LLM Components:**
- `server/src/services/places/intent/places-intent.service.ts` (Pass A)
- `server/src/services/search/assistant/assistant-narration.service.ts` (Pass B)

**Deterministic Components:**
- `server/src/services/search/assistant/failure-detector.service.ts`
- `server/src/services/places/suggestions/suggestion-generator.ts`
- `server/src/services/search/capabilities/ranking.service.ts`
- `server/src/services/search/filters/city-filter.service.ts`

**Orchestration:**
- `server/src/services/search/orchestrator/search.orchestrator.ts`

**Contracts:**
- `server/src/services/search/types/search-request.dto.ts`
- `server/src/services/search/types/search-response.dto.ts`
- `server/src/services/search/types/search.types.ts`
- `server/src/services/search/types/diagnostics.types.ts`

**i18n:**
- `server/src/services/i18n/i18n.service.ts`
- `server/src/services/i18n/translations/{en,he,ar,ru}.json`

---

## Quick Reference

### Adding a New Feature?
1. Read [Phase 0 System Definition](./PHASE_0_SYSTEM_DEFINITION.md)
2. Check [Definition of Done](../server/docs/definition-of-done.md)
3. Verify compliance with checklist
4. Update [Implementation Status](./IMPLEMENTATION_STATUS.md)

### Debugging an Issue?
1. Check [Backend Architecture](./BACKEND_ARCHITECTURE.md) for component relationships
2. Review [Server Structure & LLM Calls](./SERVER_STRUCTURE_AND_LLM_CALLS.md) for file locations
3. Enable diagnostics: add `?debug=true` to request

### Reviewing Code?
1. Verify Phase 0 compliance (checklist above)
2. Check that LLM calls are only in allowed locations
3. Ensure `SearchResponse` contract is followed
4. Validate language invariants

---

## Support & Questions

### Architecture Questions
- See [Backend Architecture](./BACKEND_ARCHITECTURE.md)
- See [Phase 0 System Definition](./PHASE_0_SYSTEM_DEFINITION.md)

### Implementation Questions
- See [Implementation Status](./IMPLEMENTATION_STATUS.md)
- See [Phase 1 Step 1 Validation](./PHASE_1_STEP_1_VALIDATION.md)

### Contract Questions
- See [Definition of Done](../server/docs/definition-of-done.md)
- See [Server Structure & LLM Calls](./SERVER_STRUCTURE_AND_LLM_CALLS.md)

---

## Document Maintenance

### When to Update

**Phase 0 System Definition:**
- Never (immutable foundation)
- Exception: Clarifications only, no principle changes

**Definition of Done:**
- When acceptance criteria change
- When new constraints are added

**Implementation Status:**
- After each phase/step completion
- When compliance status changes

**Backend Architecture:**
- When major components are added/removed
- When LLM usage changes

**This README:**
- When new documents are added
- When document purposes change

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| Dec 27, 2024 | 1.0 | Initial documentation suite |
| Dec 27, 2024 | 1.1 | Phase 0 + Step 1 complete |

---

**Document Owner:** System Architecture Team  
**Last Updated:** December 27, 2024

