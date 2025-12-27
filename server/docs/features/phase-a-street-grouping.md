# Phase A: Backend Street Grouping Implementation

**Status:** 🟡 In Progress  
**Started:** 2025-12-21  
**Target:** Answer-First UX + Progressive Radius Expansion

---

## Problem Statement

### User Issue
When users search for **street-specific** queries like:
- **Hebrew**: `"איטלקית ברחוב אלנבי"` (Italian on Allenby street)
- **English**: `"pizza on broadway"`

The current system returns results that are **too wide**:
- Default 3km radius includes restaurants far from the target street
- No visual separation between "on the street" vs "nearby"
- Users must manually scan addresses to find exact matches

### Root Cause
1. **Single-radius search**: Uses one radius (3km) for all query types
2. **No street detection**: Doesn't recognize when a query targets a specific street
3. **Flat result list**: All results mixed together, no grouping by proximity

---

## Solution Architecture

### High-Level Approach

**"Narrow-to-Wide" Strategy**:
1. **Detect** street queries (LLM + pattern matching)
2. **Dual search**: Run two parallel searches with different radii
3. **Group results**: Separate "exact" (on-street) from "nearby"
4. **Progressive expansion**: If too few exact matches, widen the nearby radius

---

## Implementation Plan

### ✅ Task 1: Type Definitions (COMPLETE)

**Status:** Already implemented in `search.types.ts`

```typescript
// Result grouping for Answer-First UX
export type GroupKind = 'EXACT' | 'NEARBY';

export interface ResultGroup {
  kind: GroupKind;
  label: string;  // e.g., "ברחוב אלנבי" or "באיזור"
  results: RestaurantResult[];
  distanceLabel?: string;  // e.g., "5 דקות הליכה"
  radiusMeters?: number;  // Actual radius used for this group
}

export interface StreetDetectionResult {
  isStreet: boolean;
  streetName?: string;
  detectionMethod: 'LLM' | 'PATTERN' | 'NONE';
}
```

**Added to `RestaurantResult`**:
- `groupKind?: 'EXACT' | 'NEARBY'` - Which group this result belongs to
- `distanceMeters?: number` - Distance from search point

---

### ✅ Task 2: Response Schema Update (COMPLETE)

**Status:** Already updated in `search-response.dto.ts`

```typescript
export interface SearchResponse {
  // ... existing fields ...
  
  // Grouped results (Answer-First UX)
  groups?: ResultGroup[];
  
  meta: SearchResponseMeta;
}

export interface SearchResponseMeta {
  // ... existing fields ...
  
  // Street grouping statistics (optional)
  streetGrouping?: {
    enabled: boolean;
    streetName?: string;
    detectionMethod?: 'LLM' | 'PATTERN' | 'NONE';
    exactCount: number;
    nearbyCount: number;
    exactRadius: number;
    nearbyRadius: number;
  };
}
```

---

### 🟡 Task 3: StreetDetectorService (IN PROGRESS)

**File:** `server/src/services/search/detectors/street-detector.service.ts`

**Purpose:** Detect if a query targets a specific street

**Detection Methods:**

1. **LLM Detection** (Primary):
   - Relies on `ParsedIntent.location.place` + `placeType` from NLU
   - If `placeType === 'street'`, it's a street query
   - Most accurate for Hebrew, Arabic, English

2. **Pattern Matching** (Fallback):
   - Looks for street keywords in `location.place`:
     - Hebrew: `רחוב`, `שד'`, `דרך`
     - English: `street`, `st.`, `avenue`, `ave`, `road`, `rd.`, `boulevard`
   - Catches cases where LLM doesn't set `placeType`

**Interface:**

```typescript
export interface StreetDetectorService {
  detect(intent: ParsedIntent): StreetDetectionResult;
}

export interface StreetDetectionResult {
  isStreet: boolean;
  streetName?: string;
  detectionMethod: 'LLM' | 'PATTERN' | 'NONE';
}
```

**Logic Flow:**

```
┌─────────────────────────────────────┐
│ Input: ParsedIntent                 │
└───────────────┬─────────────────────┘
                │
                ▼
    ┌───────────────────────────┐
    │ Has location.place?       │
    └───────┬───────────────────┘
            │ Yes
            ▼
    ┌───────────────────────────┐
    │ Check placeType='street'? │◄─── LLM Detection
    └───────┬───────────────────┘
            │ Yes → { isStreet: true, detectionMethod: 'LLM' }
            │ No ↓
            ▼
    ┌───────────────────────────┐
    │ Pattern match keywords?   │◄─── Pattern Matching
    └───────┬───────────────────┘
            │ Yes → { isStreet: true, detectionMethod: 'PATTERN' }
            │ No ↓
            ▼
    { isStreet: false, detectionMethod: 'NONE' }
```

**Configuration:**

```typescript
// In search.config.ts
streetSearch: {
  exactRadius: 200,        // Tight radius for "on street" results
  nearbyRadius: 400,       // Wider radius for "nearby" results
  minExactResults: 3,      // Min results in exact group before showing nearby
  minNearbyResults: 5,     // Min total results before progressive expansion
}
```

---

### 🟡 Task 4: Dual Search in SearchOrchestrator (IN PROGRESS)

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Changes Required:**

#### 4.1 Add Street Detection Call

```typescript
// After Step 3: Resolve location
const streetDetection = this.streetDetector.detect(intent);
console.log(`[SearchOrchestrator] Street detection: ${JSON.stringify(streetDetection)}`);
```

#### 4.2 Implement Dual Search Logic

```typescript
let results: RestaurantResult[];
let groups: ResultGroup[] | undefined;

if (streetDetection.isStreet) {
  console.log(`[SearchOrchestrator] 🎯 Street-specific search: ${streetDetection.streetName}`);
  
  // Dual search: tight + wide radius
  const [exactResults, nearbyResults] = await Promise.all([
    this.placesProvider.search({
      ...searchParams,
      radius: 200,  // Tight radius for exact matches
    }),
    this.placesProvider.search({
      ...searchParams,
      radius: 400,  // Wider radius for nearby
    }),
  ]);
  
  // Tag results with groupKind
  exactResults.forEach(r => {
    r.groupKind = 'EXACT';
    r.distanceMeters = this.calculateDistance(r.location, location.coords);
  });
  
  // Deduplicate: remove exact results from nearby
  const exactIds = new Set(exactResults.map(r => r.placeId));
  const nearbyOnly = nearbyResults.filter(r => !exactIds.has(r.placeId));
  nearbyOnly.forEach(r => {
    r.groupKind = 'NEARBY';
    r.distanceMeters = this.calculateDistance(r.location, location.coords);
  });
  
  // Combine for flat list
  results = [...exactResults, ...nearbyOnly];
  
  // Create groups for frontend
  groups = [
    {
      kind: 'EXACT',
      label: this.formatStreetLabel(streetDetection.streetName!, intent.language),
      results: exactResults,
      radiusMeters: 200,
    },
    {
      kind: 'NEARBY',
      label: this.formatNearbyLabel(intent.language),
      results: nearbyOnly,
      radiusMeters: 400,
    },
  ].filter(g => g.results.length > 0);  // Only include non-empty groups
  
} else {
  // Standard single-radius search
  results = await this.placesProvider.search(searchParams);
}
```

#### 4.3 Add Helper Methods

```typescript
/**
 * Calculate distance between two coordinates in meters
 */
private calculateDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;

  const a_calc = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a_calc), Math.sqrt(1 - a_calc));

  return R * c;
}

/**
 * Format group labels based on language
 */
private formatStreetLabel(streetName: string, language: string): string {
  if (language === 'he') {
    return `ב${streetName}`;  // e.g., "ברחוב אלנבי"
  }
  return `On ${streetName}`;
}

private formatNearbyLabel(language: string): string {
  return language === 'he' ? 'באיזור' : 'Nearby';
}
```

#### 4.4 Update Response Builder Call

```typescript
// Add streetGrouping meta
const meta = {
  // ... existing meta fields ...
  streetGrouping: streetDetection.isStreet ? {
    enabled: true,
    streetName: streetDetection.streetName,
    detectionMethod: streetDetection.detectionMethod,
    exactCount: groups?.find(g => g.kind === 'EXACT')?.results.length || 0,
    nearbyCount: groups?.find(g => g.kind === 'NEARBY')?.results.length || 0,
    exactRadius: 200,
    nearbyRadius: 400,
  } : undefined,
};

// Pass groups to response builder
return createSearchResponse({
  // ... existing params ...
  groups,
  meta: {
    ...meta,
    streetGrouping: meta.streetGrouping,
  },
});
```

---

### 🟡 Task 5: Configuration Update (IN PROGRESS)

**File:** `server/src/services/search/config/search.config.ts`

**Add street search configuration:**

```typescript
export interface StreetSearchConfig {
  exactRadius: number;
  nearbyRadius: number;
  minExactResults: number;
  minNearbyResults: number;
}

export const SearchConfig = {
  // ... existing config ...
  
  /**
   * Street-specific search configuration
   * For queries targeting a specific street (e.g., "pizza on broadway")
   */
  streetSearch: {
    exactRadius: 200,        // 200m for "on street" results
    nearbyRadius: 400,       // 400m for "nearby" results
    minExactResults: 3,      // Min exact results before showing nearby
    minNearbyResults: 5,     // Min total results before expansion
  } as StreetSearchConfig,
};
```

---

### ⚪ Task 6: Backend Tests (PENDING)

**File:** `server/tests/street-grouping.test.ts`

**Test Coverage:**

1. **Detection Tests**:
   - Detects Hebrew street queries (`"רחוב אלנבי"`)
   - Detects English street queries (`"broadway"`, `"5th avenue"`)
   - LLM detection via `placeType='street'`
   - Pattern matching fallback
   - Does NOT detect city-only queries (`"Tel Aviv"`)

2. **Dual Search Tests**:
   - Runs two searches with different radii
   - Tags results with `groupKind`
   - Deduplicates (no result appears in both groups)
   - Calculates `distanceMeters` correctly

3. **Grouping Tests**:
   - Creates `EXACT` and `NEARBY` groups
   - Formats labels correctly (Hebrew/English)
   - Omits empty groups
   - Populates `meta.streetGrouping` correctly

4. **Backward Compatibility**:
   - Non-street queries use single-radius search
   - Flat `results` array still populated
   - `groups` is optional (undefined for non-street)

**Test Structure:**

```typescript
describe('Street Grouping Feature', () => {
  describe('StreetDetectorService', () => {
    it('should detect Hebrew street query via LLM', () => { ... });
    it('should detect English street query via pattern', () => { ... });
    it('should NOT detect city-only queries', () => { ... });
  });

  describe('SearchOrchestrator - Dual Search', () => {
    it('should run dual search for street queries', async () => { ... });
    it('should tag results with groupKind', async () => { ... });
    it('should deduplicate exact and nearby results', async () => { ... });
    it('should calculate distances correctly', async () => { ... });
  });

  describe('SearchOrchestrator - Result Grouping', () => {
    it('should create EXACT and NEARBY groups', async () => { ... });
    it('should format Hebrew labels correctly', async () => { ... });
    it('should format English labels correctly', async () => { ... });
    it('should omit empty groups', async () => { ... });
    it('should populate meta.streetGrouping', async () => { ... });
  });

  describe('Backward Compatibility', () => {
    it('should use single-radius for non-street queries', async () => { ... });
    it('should keep flat results array for all queries', async () => { ... });
    it('should set groups=undefined for non-street', async () => { ... });
  });
});
```

---

## Performance Considerations

### Latency Impact

**Single Search (Current):**
- 1 Google API call: ~1-3s

**Dual Search (Street Queries):**
- 2 parallel Google API calls: ~1-3s (no increase due to Promise.all)
- Distance calculation: <10ms for 20 results
- Deduplication: <5ms

**Net Impact:** +0-50ms (negligible)

### Optimization Strategies

1. **Parallel Execution**: Use `Promise.all` for dual search
2. **Early Return**: Skip grouping logic if only one group has results
3. **Distance Caching**: Cache distance calculations per result
4. **Radius Tuning**: Start with tight radii, expand only if needed

---

## Backward Compatibility

### API Contract

✅ **Fully backward compatible**:
- Flat `results` array always present
- `groups` is optional (undefined for non-street queries)
- Frontend can ignore `groups` and use `results` as before

### Frontend Opt-In

Frontend can check for groups support:

```typescript
if (response.groups && response.groups.length > 0) {
  // Render grouped UI
  renderGroupedResults(response.groups);
} else {
  // Fallback to flat list
  renderFlatResults(response.results);
}
```

---

## Logging & Observability

### Console Logs

```typescript
console.log(`[SearchOrchestrator] Street detection: ${JSON.stringify(streetDetection)}`);
console.log(`[SearchOrchestrator] 🎯 Street-specific search: ${streetDetection.streetName}`);
console.log(`[SearchOrchestrator] Exact results: ${exactResults.length}, Nearby: ${nearbyOnly.length}`);
```

### Meta Statistics

```json
{
  "meta": {
    "streetGrouping": {
      "enabled": true,
      "streetName": "אלנבי",
      "detectionMethod": "LLM",
      "exactCount": 5,
      "nearbyCount": 8,
      "exactRadius": 200,
      "nearbyRadius": 400
    }
  }
}
```

---

## Success Criteria

### Phase A Complete When:

- [ ] `StreetDetectorService` implemented with tests
- [ ] Dual search logic implemented in orchestrator
- [ ] Result grouping logic implemented
- [ ] Helper methods (distance, labels) implemented
- [ ] Configuration added for street search
- [ ] `street-grouping.test.ts` passes (15+ tests)
- [ ] Integration test validates full flow
- [ ] Logging includes street detection metadata
- [ ] Documentation complete

### Acceptance Test

**Query:** `"איטלקית ברחוב אלנבי"`

**Expected Response:**
```json
{
  "results": [...],
  "groups": [
    {
      "kind": "EXACT",
      "label": "ברחוב אלנבי",
      "results": [5 restaurants within 200m],
      "radiusMeters": 200
    },
    {
      "kind": "NEARBY",
      "label": "באיזור",
      "results": [8 restaurants within 400m],
      "radiusMeters": 400
    }
  ],
  "meta": {
    "streetGrouping": {
      "enabled": true,
      "streetName": "אלנבי",
      "detectionMethod": "LLM",
      "exactCount": 5,
      "nearbyCount": 8,
      "exactRadius": 200,
      "nearbyRadius": 400
    }
  }
}
```

---

## Next Steps (Phase B)

After Phase A completes, Phase B (Frontend) will:
1. Create `GroupedResultsComponent`
2. Add `InputStateMachine` for search bar behavior
3. Wire grouped results into `SearchPageComponent`

---

**Documentation Version:** 1.0  
**Last Updated:** 2025-12-21  
**Status:** 🟡 In Progress (Tasks 3-6)








