# Cursor – Search Pool, Sorting & Pagination Rules (Authoritative)

## Status
This document defines **core search mechanics**.
These rules are **non-negotiable** and apply to all features:
- budget
- rating
- open/close
- distance
- chips
- assistant behavior
- UI pagination

No implementation may violate these rules without explicitly updating this document.

---

## 1. Core Principle (Read First)

**Ranking happens once per search pool.  
Pagination is slicing, not re-ranking.**

If this rule is violated, UX correctness and assistant consistency break.

---

## 2. Search Pool Definition

### What is a Pool
A **search pool** is the full candidate set used to compute truth.

For each user search:
- Fetch **30–40 candidates** from providers (e.g., Google Places)
- Normalize all candidates
- Compute deterministic ranking on the **entire pool**
- Persist the ranked pool in session context

Example:
- Pool size: 40
- Display size: 10
- Pages: 4

---

## 3. Ranking Rules (Deterministic)

### When ranking happens
Ranking is executed:
- once per pool
- before any pagination
- after all filters, scoring rules, and conflict resolution are applied

Ranking **must be stable**:
- same input → same order
- no randomness
- no page-dependent logic

---

## 4. Pagination Semantics (Critical)

### Pagination is slicing
Page navigation returns a slice of the ranked pool:

```typescript
page(n) = pool.rankedResults.slice((n-1) * pageSize, n * pageSize)
```

Nothing else happens.

### Page navigation MUST NOT:
- re-rank
- re-score
- re-filter
- change assistant message
- change chips
- change failureReason or mode

Pagination is **view-only**.

---

## 5. When a New Pool Is Created

A **new pool MUST be created** if any of the following change:

- search query text
- location (city / coords / radius)
- language
- filters (budget, openNow, dietary, etc.)
- sort order
- chip action that modifies intent

A **new pool MUST NOT be created** for:
- page navigation
- scrolling
- "load more" within the same pool

---

## 6. Pool Lifetime & Session Rules

Each pool is associated with:
- sessionId
- normalized query hash
- language
- location
- filters
- sort

If any of these change:
- invalidate the pool
- compute a new pool
- regenerate assistant + chips

---

## 7. Page Count & UX Implications

If:
- pool size = 40
- display size = 10

Then:
- pages 1–4 are guaranteed
- page 5 does NOT exist

If the user wants more:
- a **new pool** is fetched
- treated as a **new search**
- recommended UX label: **"Load more results"**

Do NOT silently fetch page 5+ from a new pool while pretending continuity.

---

## 8. Assistant Consistency Across Pagination

Because pagination does not change truth:
- assistant message MUST remain unchanged across pages
- failureReason MUST remain unchanged
- mode (NORMAL / RECOVERY / CLARIFY) MUST remain unchanged
- chips MUST remain unchanged

Assistant regeneration occurs **only when a new pool is created**.

---

## 9. Why This Model Exists (Rationale)

### Prevents UX bugs
Without this rule:
- results reshuffle between pages
- users lose trust
- assistant explanations become invalid

### Enables assistant correctness
Assistant explains:
- result count
- confidence
- recovery options

If ranking changes per page, assistant becomes wrong.

### Enables clean UI
UI can be dumb:
- render slice
- render assistant once
- render chips once

No hidden logic.

---

## 10. Explicit Anti-Patterns (Forbidden)

❌ Sorting per page  
❌ Filtering per page  
❌ Fetching new providers per page  
❌ Assistant regeneration on page click  
❌ "Smart" UI reordering  
❌ Mixing pagination with re-ranking  

If you see any of these — it is a bug.

---

## 11. One-Line Summary (Keep This)

> **Search computes truth once.  
Pagination only reveals it.**

---

## End of Document

