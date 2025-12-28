# System Tools & Options - Complete Reference

**Status:** Authoritative  
**Owner:** Product / UX / Engineering  
**Last Updated:** Dec 28, 2025

---

## Overview

This document defines **ALL** available tools, options, chips, actions, and UI controls in the search system. This is the **single source of truth** for what users can do with search results.

**Core Principle:** One intent = one surface. No duplicate controls.

---

## 1. Refinement Chips (Primary Control Surface)

Refinement chips are the **ONLY** control surface for sorting and filtering results. They appear in a single horizontal row below the search results header.

### 1.1 Filter Chips (Context-Aware)

These chips appear based on search results and intent. They filter the current result set.

| Chip ID | Emoji | Label (EN) | Action | Filter | When Shown |
|---------|-------|------------|--------|--------|------------|
| `delivery` | 🚗 | Delivery | `filter` | `delivery` | When results include delivery options |
| `budget` | 💰 | Budget | `filter` | `price<=2` | When cheap options exist (price ≤ 2) |
| `toprated` | ⭐ | Top rated | `filter` | `rating>=4.5` | When highly-rated options exist (rating ≥ 4.5) |
| `opennow` | 🟢 | Open now | `filter` | `opennow` | Always (unless already filtered) |
| `takeout` | 🥡 | Takeout | `filter` | `takeout` | When results include takeout options |
| `romantic` | 💕 | Romantic | `filter` | `romantic` | Context-specific |
| `family` | 👨‍👩‍👧‍👦 | Family friendly | `filter` | `family` | Context-specific |

### 1.2 Sort Chips (Ranking Controls)

| Chip ID | Emoji | Label (EN) | Action | Filter | Purpose |
|---------|-------|------------|--------|--------|---------|
| `closest` | 📍 | Closest | `sort` | `distance` | Sort by distance (nearest first) |
| `sort_rating` | ⭐ | Sort by rating | `sort` | `rating` | Sort by rating (highest first) |
| `sort_price` | 💰 | Sort by price | `sort` | `price` | Sort by price level |

### 1.3 View Chips (Display Mode)

| Chip ID | Emoji | Label (EN) | Action | Purpose |
|---------|-------|------------|--------|---------|
| `map` | 🗺️ | Map | `map` | Show results on interactive map |

### 1.4 Chip Behavior Rules

- **Visibility:** Chips visible on ALL breakpoints (mobile + desktop)
- **Layout:** Horizontal scroll on mobile; wraps on desktop
- **Limit:** Max 5 chips in NORMAL mode
- **State:** Active chip has `.active` class (blue background)
- **Click:** Triggers `facade.onChipClick(chipId)` → actual filtering/sorting
- **No Duplication:** ONLY one chips row exists in the entire UI

---

## 2. Mode-Specific Chips

The system operates in 3 modes. Each mode generates different chips.

### 2.1 NORMAL Mode Chips

**Trigger:** Results found, confidence ≥ 60%, no ambiguity

**Chips:** Context-aware filters + sorting + map (as documented in section 1)

**Example:**
```
Query: "pizza in tel aviv"
Chips: [⭐ Top rated] [💰 Budget] [🟢 Open now] [🗺️ Map] [📍 Closest]
```

### 2.2 RECOVERY Mode Chips

**Trigger:** No results OR low confidence OR API failures

**Purpose:** Help user broaden search and find alternatives

| Chip ID | Emoji | Label (EN) | Action | Filter | Purpose |
|---------|-------|------------|--------|--------|---------|
| `expand_radius` | 🔍 | Expand search | `filter` | `radius:10000` | Increase search radius to 10km |
| `remove_filters` | 🔄 | Remove filters | `filter` | `clear_filters` | Clear all applied filters |
| `try_nearby` | 📍 | Try nearby | `filter` | `nearby_fallback` | Search in nearby areas |
| `sort_rating` | ⭐ | Top rated | `sort` | `rating>=4.5` | Sort by rating (recovery default) |
| `map` | 🗺️ | Map | `map` | - | Open map view to explore |

**Chip Limit:** Max 5 recovery chips

**Example:**
```
Query: "sushi in the middle of nowhere"
Result: No results
Chips: [🔍 Expand search] [🔄 Remove filters] [📍 Try nearby] [⭐ Top rated] [🗺️ Map]
```

### 2.3 CLARIFY Mode Chips

**Trigger:** Ambiguous query (missing city, ambiguous tokens)

**Purpose:** Help user clarify intent (1-3 chips only)

**Chips:**
- **City suggestions:** When city missing → Suggest popular cities
- **Map/Closest:** Fallback exploration chips

**Chip Limit:** Max 3 chips (keep clarification minimal)

**Example:**
```
Query: "pizza"
Chips: [📍 Pizza in Tel Aviv] [📍 Pizza in Jerusalem] [📍 Pizza in Haifa]
```

---

## 3. Restaurant Card Quick Actions

Each restaurant card includes 3 quick action buttons at the bottom right.

| Action Type | Icon | Label | Behavior | Availability |
|-------------|------|-------|----------|--------------|
| `GET_DIRECTIONS` | 📍 | Get directions | Opens directions in maps app | Always enabled |
| `CALL_RESTAURANT` | 📞 | Call restaurant | Initiates phone call | Disabled if no phone number |
| `SAVE_FAVORITE` | ❤️ | Save to favorites | Saves to user favorites | Always enabled |

**Click Behavior:**
- Stops event propagation (doesn't trigger card click)
- Calls `onAction($event, actionType)`
- Level 1 actions (may require confirmation)

**Future Actions (Defined but not yet in UI):**
- `VIEW_DETAILS` - View full restaurant page
- `SHARE` - Share restaurant with others
- `VIEW_MENU` - View restaurant menu

---

## 4. Action System (Human-in-the-Loop)

The complete action lifecycle for proposed actions.

### 4.1 Action Types

| Action Type | Description | Level | Status |
|-------------|-------------|-------|--------|
| `VIEW_DETAILS` | View full restaurant details | 0 | Defined |
| `GET_DIRECTIONS` | Get directions to restaurant | 1 | ✅ Active |
| `CALL_RESTAURANT` | Call the restaurant | 1 | ✅ Active |
| `SAVE_FAVORITE` | Save to favorites list | 1 | ✅ Active |
| `SHARE` | Share restaurant with others | 1 | Defined |
| `VIEW_MENU` | View restaurant menu | 0 | Defined |

### 4.2 Action Levels

- **Level 0:** Informational only (no side effects, no confirmation needed)
- **Level 1:** Requires user confirmation (opens dialog)
- **Level 2:** High-impact actions (opens confirmation + explanation)

### 4.3 Action States

| Status | Description |
|--------|-------------|
| `PENDING` | Action proposed, awaiting approval |
| `APPROVED` | User approved action |
| `EXECUTING` | Action in progress |
| `EXECUTED` | Action completed successfully |
| `FAILED` | Action failed |
| `EXPIRED` | Action expired (timeout) |
| `REJECTED` | User rejected action |

---

## 5. Search Filters (Backend)

Available filters that chips can apply to search results.

### 5.1 Filter Syntax

| Filter | Syntax | Example | Description |
|--------|--------|---------|-------------|
| **Price Level** | `price<=N` | `price<=2` | Max price level (1-4 scale) |
| **Rating** | `rating>=N` | `rating>=4.5` | Min rating (0-5 scale) |
| **Open Now** | `opennow` | `opennow` | Currently open only |
| **Delivery** | `delivery` | `delivery` | Has delivery service |
| **Takeout** | `takeout` | `takeout` | Has takeout service |
| **Dietary** | `dietary:TYPE` | `dietary:vegan` | Dietary restriction |
| **Radius** | `radius:N` | `radius:10000` | Search radius in meters |
| **Clear Filters** | `clear_filters` | `clear_filters` | Remove all active filters |

### 5.2 Supported Dietary Types

- `vegan` - Vegan options
- `vegetarian` - Vegetarian options
- `kosher` - Kosher certified
- `halal` - Halal certified
- `gluten_free` - Gluten-free options

---

## 6. Search Granularity & Grouping

The system automatically detects search granularity and adjusts result grouping accordingly.

### 6.1 Granularity Types

| Granularity | Detection Logic | Example Query | Result Grouping |
|-------------|-----------------|---------------|-----------------|
| `CITY` | City name, no street/place | "pizza in Tel Aviv" | All results in ONE "EXACT" group |
| `STREET` | Street name detected | "pizza on Allenby" | "EXACT" (500m) + "NEARBY" (2km) |
| `LANDMARK` | POI/landmark detected | "pizza near Azrieli Center" | "EXACT" (1km) + "NEARBY" (3km) |
| `AREA` | "near me", radius query | "pizza near me" | "EXACT" (1.5km) + "NEARBY" (5km) |

### 6.2 Grouping Rules (Authoritative)

**CRITICAL:** Distance grouping depends on granularity, not raw distance alone.

```typescript
if (granularity === 'CITY') {
  // NO distance grouping - all results in one group
  return [{ kind: 'EXACT', label: `Results in ${cityName}`, results: all }];
}

if (granularity === 'STREET') {
  // Street-level radii
  exactRadius = 500m
  nearbyRadius = 2000m
}

if (granularity === 'LANDMARK') {
  exactRadius = 1000m
  nearbyRadius = 3000m
}

if (granularity === 'AREA') {
  exactRadius = 1500m
  nearbyRadius = 5000m
}
```

**Result:** No more "1 exact + 8 nearby" confusion for city searches!

---

## 7. Clarification System

When queries contain ambiguous tokens, the system can ask for clarification.

### 7.1 Ambiguous Tokens

| Token | Question | Constraint Option | Name Option |
|-------|----------|-------------------|-------------|
| `parking` | "Parking as requirement or place name?" | "Restaurants with parking" | "Places called 'parking'" |
| `kosher` | "Kosher restaurants or place called 'kosher'?" | "Kosher restaurants" | "Places called 'kosher'" |
| `open now` | "Filter by open or search for 'open now'?" | "Currently open" | "Search for 'open now'" |
| `gluten free` | "Gluten-free options or searching for name?" | "Gluten-free restaurants" | "Places called 'gluten free'" |
| `vegan` | "Vegan food or place called 'vegan'?" | "Vegan restaurants" | "Places called 'vegan'" |
| `delivery` | "Delivery options or searching for name?" | "Restaurants with delivery" | "Places called 'delivery'" |

### 7.2 Clarification UI

**Display:**
- Shown above results in `app-clarification-block`
- Presents 2 options as large buttons
- User selects one, search re-runs with clarified intent

**Condition:**
- `requiresClarification === true`
- `clarification` object exists in response

---

## 8. Assistant System

The assistant provides contextual guidance but **NEVER duplicates primary controls**.

### 8.1 Assistant Visibility Rules (Authoritative)

Assistant is **ONLY** shown when:

1. ✅ **No results found** (Recovery mode)
2. ✅ **Low confidence** (< 60%)
3. ✅ **Recovery or Clarify mode** (ambiguous query)

**Otherwise, it's hidden!**

```typescript
showAssistant = computed(() => {
  if (!response.results || response.results.length === 0) return true;
  if (response.meta?.confidence < 0.6) return true;
  if (response.assist?.mode === 'RECOVERY' || response.assist?.mode === 'CLARIFY') return true;
  return false;
});
```

### 8.2 Assistant Surfaces

| Surface | Breakpoint | Behavior |
|---------|------------|----------|
| **Desktop Panel** | ≥1024px | Sticky right panel, no chips |
| **Mobile Bottom Sheet** | <1024px | Slide-up modal, dismissible |

**CRITICAL:** Assistant surfaces receive `chips: []` (empty array) to prevent duplication.

### 8.3 Assistant Modes

| Mode | Purpose | Chips | Message Style |
|------|---------|-------|---------------|
| `NORMAL` | Reassurance, context | None | Brief, positive |
| `RECOVERY` | Help broaden search | Recovery chips | Helpful, actionable |
| `CLARIFY` | Resolve ambiguity | Clarify chips | Question-based |

---

## 9. Reason Labels

The **top result** can include a short reason label explaining why it's ranked #1.

### 9.1 Reason Label Format

**Location:** Inside top result card, above photo

**Format:** `<factor> · <factor> · <factor>`

**Examples:**
- "Best match · Open now · 4.3⭐"
- "Closest open option"
- "Top rated nearby"

### 9.2 Reason Factors

| Factor | Condition | Example |
|--------|-----------|---------|
| Best match | Always on top result | "Best match" |
| Open now | `openNow === true` | "Open now" |
| High rating | `rating >= 4.5` | "4.5⭐" |
| Closest | Ranked #1 by distance | "Closest" |

**Rules:**
- Max 3 factors per label
- One short line only
- No AI explanations
- No paragraphs

---

## 10. Search Modes (Response Modes)

The system operates in 3 distinct modes that change chip generation and UI behavior.

| Mode | Trigger | Chips | Assistant | Result Display |
|------|---------|-------|-----------|----------------|
| **NORMAL** | Results found, confidence ≥ 60% | Context-aware filters | Hidden | Single ranked list |
| **RECOVERY** | No results, low confidence, API error | Recovery chips | Visible | Empty state or partial results |
| **CLARIFY** | Ambiguous query | Clarify chips (1-3) | Visible | Clarification block |

---

## 11. Multi-Language Support

All chips, messages, and labels support multiple languages.

### 11.1 Supported Languages

| Language | Code | Status |
|----------|------|--------|
| English | `en` | ✅ Full support |
| Hebrew | `he` | ✅ Full support |
| Arabic | `ar` | ✅ Full support |
| Russian | `ru` | ✅ Full support |

### 11.2 i18n Keys for Chips

All chip labels use i18n keys from `server/src/services/i18n/translations/{lang}.json`

**Key Format:** `chip.{chipId}`

**Examples:**
- `chip.delivery` → "Delivery" (EN) / "משלוחים" (HE)
- `chip.topRated` → "Top rated" (EN) / "מדורג גבוה" (HE)
- `chip.openNow` → "Open now" (EN) / "פתוח עכשיו" (HE)

---

## 12. Mobile vs Desktop UX

### 12.1 Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Mobile | < 1024px | Single column, bottom sheet |
| Desktop | ≥ 1024px | Two columns (results + panel) |

### 12.2 Layout Differences

| Feature | Mobile | Desktop |
|---------|--------|---------|
| **Chips Row** | Horizontal scroll, always visible | Wraps to multiple rows |
| **Assistant** | Bottom sheet (slide-up modal) | Sticky right panel |
| **Results List** | Vertical scroll (full width) | Left column, scrollable |
| **Quick Actions** | Touch targets (44px min) | Hover states |

### 12.3 Mobile-First Principle

All UI components are designed mobile-first, then enhanced for desktop. The mental model stays the same across breakpoints.

---

## 13. Performance & Caching

### 13.1 Cached Operations

| Operation | Cache Key | TTL | Purpose |
|-----------|-----------|-----|---------|
| Geocoding | `geo:{location}` | 24h | Avoid repeated geocoding calls |
| Places Search | `places:{query}:{location}` | 1h | Cache search results |
| Intent Parsing | `intent:{query}:{session}` | 30min | Cache LLM intent parsing |
| Ranking | `rank:{results_hash}` | 15min | Cache ranking calculations |

### 13.2 Cache Configuration

Caching is controlled via environment variables:

- `CACHE_GEOCODING=true` (default: true)
- `CACHE_PLACES=true` (default: true)
- `CACHE_INTENT=true` (default: true)
- `CACHE_RANKING=false` (default: false)

---

## 14. Diagnostics & Debugging

### 14.1 Response Metadata

Every search response includes diagnostic metadata in `response.meta`:

| Field | Type | Purpose |
|-------|------|---------|
| `tookMs` | number | Total request time |
| `confidence` | number | Confidence score (0-1) |
| `language` | string | Detected language |
| `diagnostics` | object | Debug info (dev only) |

### 14.2 Diagnostic Fields (Dev Mode)

When `NODE_ENV=development`, `diagnostics` includes:

- `intentParsingMs` - Time to parse intent
- `geocodingMs` - Time to geocode location
- `placesSearchMs` - Time to search places
- `rankingMs` - Time to rank results
- `granularity` - Detected search granularity
- `cacheHits` - Which operations hit cache
- `llmCalls` - Number of LLM calls made

---

## 15. Error Handling & Failure Reasons

### 15.1 Failure Reasons

| Reason | Trigger | Recovery Strategy |
|--------|---------|-------------------|
| `NONE` | Success | N/A |
| `NO_RESULTS` | Zero results from API | Show recovery chips |
| `GEOCODING_FAILED` | Can't resolve location | Suggest popular cities |
| `PLACES_API_ERROR` | Places API failure | Retry with fallback |
| `TIMEOUT` | Request timeout | Show timeout message |
| `QUOTA_EXCEEDED` | API quota exceeded | Show quota message |
| `AMBIGUOUS_QUERY` | Multiple interpretations | Show clarification |

### 15.2 User-Facing Messages

Failure messages are translated and user-friendly (never technical):

- **NO_RESULTS:** "No results found. Try expanding your search."
- **GEOCODING_FAILED:** "Couldn't locate that place. Try a different city."
- **TIMEOUT:** "Search took too long. Please try again."
- **QUOTA_EXCEEDED:** "Too many requests. Please wait a moment."

---

## 16. Testing & Validation

### 16.1 QA Harness

The system includes a QA harness for regression testing:

**Location:** `server/src/services/search/qa/`

**Command:** `npm run qa`

**Dataset:** 41 canonical queries covering all modes, languages, and edge cases

### 16.2 Regression Tests

**Frontend:** `search-page-no-duplication.spec.ts`

Tests enforce:
- Only ONE chips row exists
- Only ONE results list exists
- NO duplicate assistant strips
- Assistant only shows when needed

---

## 17. Design Tokens & Styling

### 17.1 Chip Styling

| State | Background | Border | Text | Transform |
|-------|------------|--------|------|-----------|
| Default | `white` | `#d1d5db` | `#374151` | - |
| Hover | `#f3f4f6` | `#9ca3af` | `#374151` | `translateY(-1px)` |
| Active | `#3b82f6` | `#3b82f6` | `white` | - |

### 17.2 Accessibility

All interactive elements meet WCAG 2.1 AA standards:

- **Touch targets:** Min 44×44px on mobile
- **Color contrast:** 4.5:1 minimum
- **Keyboard navigation:** Full support
- **Screen readers:** ARIA labels on all actions
- **Focus indicators:** Visible focus rings

---

## 18. Future Enhancements (Roadmap)

| Feature | Status | Priority |
|---------|--------|----------|
| Active chip state binding | Pending | High |
| Keyboard chip navigation | Pending | Medium |
| Chip analytics tracking | Pending | Medium |
| Personalized chip suggestions | Planned | Low |
| Save filter presets | Planned | Low |
| A/B test chip effectiveness | Planned | Low |

---

## 19. Architecture Decision Records (ADRs)

### ADR-001: Single Control Surface

**Decision:** Only ONE chips row for sorting/filtering

**Rationale:** Multiple chip rows caused cognitive overload and unclear hierarchy

**Status:** ✅ Implemented (Dec 28, 2025)

### ADR-002: Conditional Assistant

**Decision:** Assistant only shows when needed (no results, low confidence, recovery)

**Rationale:** Always-visible assistant competed with primary results and reduced trust

**Status:** ✅ Implemented (Dec 28, 2025)

### ADR-003: Granularity-Based Grouping

**Decision:** Distance grouping depends on search granularity (CITY, STREET, LANDMARK, AREA)

**Rationale:** Fixed "1 exact + 8 nearby" confusion for city searches

**Status:** ✅ Implemented (Dec 28, 2025)

---

## 20. Key Principles (Always Follow)

1. **One intent = one surface** - Never duplicate controls
2. **Mobile-first** - Design for mobile, enhance for desktop
3. **Conditional UI** - Show controls only when relevant
4. **Trust through clarity** - No competing rankings or lists
5. **Context-aware** - Chips adapt to results and intent
6. **Mode-driven** - NORMAL/RECOVERY/CLARIFY modes change behavior
7. **Granularity-aware** - City searches ≠ street searches
8. **i18n by default** - All text uses translation keys
9. **Accessibility first** - WCAG 2.1 AA minimum
10. **Performance matters** - Cache aggressively, measure always

---

## Appendix A: Complete Chip Reference

See Section 1 for the authoritative list of all chips.

## Appendix B: i18n Key Reference

All translation keys are in `server/src/services/i18n/translations/{lang}.json`

## Appendix C: Type Definitions

**Frontend:** `llm-angular/src/app/domain/types/search.types.ts`  
**Backend:** `server/src/services/search/types/search.types.ts`

---

**This document is the single source of truth for all tools and options in the search system.**

**Last Updated:** Dec 28, 2025  
**Version:** 1.0.0

