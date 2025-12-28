# Closed Filter Fix - "סגור" Support (Phase 8: Honest Transparency)

**Status:** ✅ Complete (Phase 8 Enhancement)  
**Date:** Dec 28, 2025 (Updated: Phase 8)  
**Issue:** "פיצה בגדרה סגור" returned same results as without "סגור"  
**Fix:** Added full support for "closed" filter with honest transparency about API limitations

---

## Problem

User searched for **"פיצה בגדרה סגור"** (pizza in Gedera **closed**) and got the same results as without the "סגור" keyword. The system was not recognizing or filtering for closed restaurants.

### Root Cause (Initial)

The system only recognized "open" keywords (`פתוח`, `open`) but **NOT** "closed" keywords (`סגור`, `closed`). This meant:

1. ❌ "סגור" was ignored during intent parsing
2. ❌ `openNow` filter was never set to `false`
3. ❌ Ranking didn't prioritize closed restaurants
4. ❌ No "Closed now" chip was generated

### Root Cause (Phase 8 Discovery)

After initial fix, we discovered a deeper limitation:

**Google Places API does NOT support `opennow: false`** ❌

- ✅ `opennow: true` → Returns only open places (supported)
- ✅ No `opennow` parameter → Returns all places (supported)
- ❌ `opennow: false` → NOT SUPPORTED by Google

**This means:** We cannot ask Google directly for closed restaurants!

---

## Solution (Phase 8: Derived Filter with Transparency)

We implemented an **honest, transparent derived filter** that:
1. ✅ Works within Google's API constraints
2. ✅ Filters for closed restaurants accurately
3. ✅ Tells users exactly what we're doing
4. ✅ Shows summary statistics before filtering

**Key Principle:** Honesty over features. We show the "Closed now" chip, but we're transparent that it's derived data, not a native Google filter.

---

## Implementation (Phase 8)

### Phase 8.1: Remove Fake API Filter

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Problem:** Initial fix tried to send `openNow: false` to Google API (doesn't work)

**Solution:** 
- When `openNow === false`, do NOT send it to Google
- Set `needsClosedFiltering` flag
- Fetch all results (no `opennow` parameter)

```typescript
// IMPORTANT: Google Places API doesn't support openNow=false (closed filter)
// We'll filter for closed restaurants AFTER getting results (derived filter)
const openNow = request.filters?.openNow ?? intent.filters.openNow;
const needsClosedFiltering = openNow === false;

// Only send openNow to Google if it's true (they don't support false)
if (openNow === true) {
    filters.openNow = true;
}
```

---

### Phase 8.2: Calculate Summary Statistics

**File:** `server/src/services/search/utils/opening-hours-summary.ts` (NEW)

**Purpose:** Calculate open/closed/unknown counts BEFORE filtering (for transparency)

```typescript
export interface OpenNowSummary {
  open: number;
  closed: number;
  unknown: number;
  total: number;
}

export function calculateOpenNowSummary(results: RestaurantResult[]): OpenNowSummary {
  const summary = { open: 0, closed: 0, unknown: 0, total: results.length };
  
  results.forEach(r => {
    if (r.openNow === true) summary.open++;
    else if (r.openNow === false) summary.closed++;
    else summary.unknown++;
  });
  
  return summary;
}
```

**Critical:** Must be called BEFORE filtering to get accurate totals!

---

### Phase 8.3: Apply Derived Filter

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**Logic:**
1. Get all results from Google (no `opennow` filter)
2. Calculate summary statistics
3. If user wants closed, filter results on backend
4. Add transparency metadata to response

```typescript
// Phase 8: Calculate opening hours summary BEFORE filtering (for transparency)
const openNowSummary = calculateOpenNowSummary(allResults);

// Phase 8: Apply derived filter for "closed now" (Google API doesn't support opennow=false)
if (needsClosedFiltering) {
    console.log(`[SearchOrchestrator] 🔴 Applying derived "closed now" filter (Google API limitation)`);
    const beforeCount = allResults.length;
    allResults = allResults.filter(r => r.openNow === false);
    console.log(`[SearchOrchestrator] 🔴 Closed filter: ${beforeCount} → ${allResults.length} results`);
    
    // Update groups with closed-only results
    // ... (group filtering logic)
}

// Add to response meta
meta.openNowSummary = openNowSummary;
meta.capabilities = {
    openNowApiSupported: true,
    closedNowApiSupported: false,
    closedNowIsDerived: true,
};
```

---

### Phase 8.4: Response Metadata

**Files:**
- `server/src/services/search/types/search-response.dto.ts`
- `llm-angular/src/app/domain/types/search.types.ts`

**Added to `SearchMeta`:**

```typescript
interface SearchMeta {
  // ... existing fields ...
  
  // Phase 8: Opening hours summary (for transparency)
  openNowSummary?: {
    open: number;
    closed: number;
    unknown: number;
    total: number;
  };
  
  // Phase 8: API capabilities (for derived filter disclosure)
  capabilities?: {
    openNowApiSupported: boolean;    // true
    closedNowApiSupported: boolean;  // false (Google limitation)
    closedNowIsDerived: boolean;     // true (we filter on backend)
  };
}
```

---

### Phase 8.5: UI Disclosure Banner

**File:** `llm-angular/src/app/features/unified-search/components/disclosure-banner/` (NEW)

**Purpose:** Show transparent message when "closed now" filter is active

**Display:**
```
ℹ️ מציג רק מקומות סגורים (3 מתוך 10 תוצאות)
```

**On hover:**
```
Google Places לא תומך בסינון סגור - מסננים תוצאות בצד שלנו
```

**Component:**
```typescript
@Component({
  selector: 'app-disclosure-banner',
  // ...
})
export class DisclosureBannerComponent {
  @Input() summary!: OpenNowSummary;
  @Input() filterActive: 'open' | 'closed' | null = null;
  
  get visible(): boolean {
    return this.filterActive === 'closed' && this.summary && this.summary.closed > 0;
  }
  
  get message(): string {
    if (this.filterActive === 'closed') {
      return `מציג רק מקומות סגורים (${this.summary.closed} מתוך ${this.summary.total} תוצאות)`;
    }
    return '';
  }
}
```

**Integration:** Added to `search-page.component.html` between results header and chips.

---

### Phase 8.6: i18n Disclosure Messages

**Files:** `server/src/services/i18n/translations/*.json`

**Added:**

```json
{
  "disclosure": {
    "closedNowDerived": "Showing only closed places ({{count}} of {{total}} results)",
    "closedNowExplanation": "Google Places doesn't support closed filter - we filter results on our side"
  }
}
```

**Languages:** English, Hebrew, Arabic, Russian

---

## Solution (Initial - Kept for Historical Context)

Added complete support for "closed" filter across the entire stack.

### 1. Token Detector - Added "closedNow" Keywords

**File:** `server/src/services/search/detectors/token-detector.service.ts`

**Changes:**
- Added new constraint type: `closedNow`
- Added keywords in 6 languages:
  - Hebrew: `סגור`
  - English: `closed`
  - French: `fermé`
  - Arabic: `مغلق`
  - Russian: `закрыто`
  - German: `geschlossen`

```typescript
export type ConstraintTokenType = 'parking' | 'kosher' | 'openNow' | 'closedNow' | ...;

private readonly CONSTRAINT_TOKENS: Record<ConstraintTokenType, string[]> = {
  openNow: ['פתוח', 'open', 'ouvert', 'مفتوح', 'открыто', 'offen'],
  closedNow: ['סגור', 'closed', 'fermé', 'مغلق', 'закрыто', 'geschlossen'],
  ...
};
```

---

### 2. Intent Parsing - LLM Prompt Update

**File:** `server/src/services/places/intent/places-intent.service.ts`

**Changes:**
- Updated LLM system prompt to handle closed explicitly
- Added rule: "If user says 'closed' or 'סגור', set `opennow: false`"
- Added example: `"פיצה סגור בגדרה" → { filters: { opennow: false } }`

**Before:**
```typescript
"opennow"?: boolean,  // use 'opennow' key (not openNow)
```

**After:**
```typescript
"opennow"?: boolean,  // true for open, false for closed, omit if not specified
```

**New Rules:**
- If user says "open" or "פתוח", set `opennow: true`
- If user says "closed" or "סגור", set `opennow: false`
- Remove "open"/"closed"/"פתוח"/"סגור" from query text

---

### 3. Ranking Service - Prioritize Closed

**File:** `server/src/services/search/capabilities/ranking.service.ts`

**Changes:**
- Updated scoring logic to handle `openNow: false` explicitly
- When user wants closed restaurants, boost closed and penalize open

**Before:**
```typescript
if (intent.filters.openNow) {
  if (restaurant.openNow === true) {
    score += this.weights.openNow;
  } else if (restaurant.openNow === false) {
    score -= this.weights.openNow;  // Penalize closed
  }
}
```

**After:**
```typescript
if (intent.filters.openNow === true) {
  // User wants open restaurants
  if (restaurant.openNow === true) {
    score += this.weights.openNow;
  } else if (restaurant.openNow === false) {
    score -= this.weights.openNow;  // Penalize closed
  }
} else if (intent.filters.openNow === false) {
  // User wants closed restaurants (e.g., "פיצה סגור")
  if (restaurant.openNow === false) {
    score += this.weights.openNow;  // Boost closed
  } else if (restaurant.openNow === true) {
    score -= this.weights.openNow;  // Penalize open
  }
}
```

---

### 4. Suggestion Service - "Closed Now" Chip

**File:** `server/src/services/places/suggestions/suggestion-generator.ts`

**Changes:**
- Added "Closed now" chip generation
- Shows as an option for users planning ahead

```typescript
// Suggest closed now as an option (for planning ahead)
if (!intent.temporal?.includes('closed')) {
  suggestions.push({
    id: 'closednow',
    emoji: '🔴',
    label: i18n.t('chip.closedNow', lang),
    action: 'filter',
    filter: 'closed'
  });
}
```

---

### 5. i18n Translations

**Files:** 
- `server/src/services/i18n/translations/en.json`
- `server/src/services/i18n/translations/he.json`
- `server/src/services/i18n/translations/ar.json`
- `server/src/services/i18n/translations/ru.json`

**Added:**
```json
{
  "chip": {
    "closedNow": "Closed now"     // EN
    "closedNow": "סגור עכשיו"     // HE
    "closedNow": "مغلق الآن"      // AR
    "closedNow": "Закрыто сейчас" // RU
  }
}
```

---

### 6. Tests

**File:** `server/src/services/search/capabilities/ranking.service.closed.test.ts`

**Coverage:**
- ✅ Prioritizes closed restaurants when `openNow: false`
- ✅ Penalizes open restaurants when `openNow: false`
- ✅ Handles multiple closed restaurants correctly
- ✅ Handles unknown `openNow` status gracefully
- ✅ Maintains existing behavior for `openNow: true`
- ✅ No penalty when `openNow: undefined`
- ✅ Real-world scenario: "פיצה בגדרה סגור"

**Total:** 7 test cases

---

## Behavior Changes

### Before Fix

| Query | Recognized | Filter Applied | Results |
|-------|------------|----------------|---------|
| "פיצה פתוח" | ✅ Yes | `openNow: true` | Open only |
| "פיצה סגור" | ❌ No | None | All restaurants |
| "pizza open" | ✅ Yes | `openNow: true` | Open only |
| "pizza closed" | ❌ No | None | All restaurants |

### After Fix

| Query | Recognized | Filter Applied | Results |
|-------|------------|----------------|---------|
| "פיצה פתוח" | ✅ Yes | `openNow: true` | Open only |
| "פיצה סגור" | ✅ Yes | `openNow: false` | **Closed only** ✅ |
| "pizza open" | ✅ Yes | `openNow: true` | Open only |
| "pizza closed" | ✅ Yes | `openNow: false` | **Closed only** ✅ |

---

## User Experience

### Query: "פיצה בגדרה סגור"

**Before:**
1. User searches "פיצה בגדרה סגור"
2. System ignores "סגור"
3. Returns ALL restaurants (open + closed)
4. ❌ User confused - why are open restaurants showing?

**After:**
1. User searches "פיצה בגדרה סגור"
2. System recognizes "סגור" → sets `openNow: false`
3. LLM extracts: `{ query: "פיצה", city: "גדרה", filters: { opennow: false } }`
4. Ranking prioritizes closed restaurants
5. ✅ Returns only closed pizza places in Gedera

---

## Use Cases

### 1. Planning Ahead
**Query:** "pizza closed now"  
**Use Case:** User wants to know which places are closed now to plan for later

### 2. Avoiding Crowds
**Query:** "restaurants closed"  
**Use Case:** User checking which places are closed before deciding where to go

### 3. Hebrew Queries
**Query:** "פיצה סגור בתל אביב"  
**Use Case:** Hebrew speaker looking for closed pizza places

### 4. Mixed Language
**Query:** "פיצה closed"  
**Use Case:** Mixed Hebrew-English query (common in Israel)

---

## Technical Details

### Filter Values

| Filter | Value | Meaning |
|--------|-------|---------|
| `openNow: true` | Boolean true | Show only open restaurants |
| `openNow: false` | Boolean false | Show only closed restaurants |
| `openNow: undefined` | Not set | Show all (no filter) |

**Important:** `false` is **NOT** the same as `undefined`!

### Ranking Weights

| Scenario | Restaurant Status | Score Adjustment |
|----------|-------------------|------------------|
| User wants open (`openNow: true`) | Open | +10 (boost) |
| User wants open (`openNow: true`) | Closed | -10 (penalize) |
| User wants closed (`openNow: false`) | Closed | +10 (boost) |
| User wants closed (`openNow: false`) | Open | -10 (penalize) |
| No filter (`openNow: undefined`) | Any | 0 (no change) |

---

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `token-detector.service.ts` | Added closedNow keywords | +2 |
| `places-intent.service.ts` | Updated LLM prompt | +4 |
| `ranking.service.ts` | Added closed prioritization logic | +8 |
| `suggestion.service.ts` | Updated filter check | +1 |
| `suggestion-generator.ts` | Added closedNow chip | +11 |
| `en.json` | Added closedNow translation | +1 |
| `he.json` | Added closedNow translation | +1 |
| `ar.json` | Added closedNow translation | +1 |
| `ru.json` | Added closedNow translation | +1 |
| `ranking.service.closed.test.ts` | New test file | +319 |
| **Total** | **10 files** | **~350 lines** |

---

## Testing

### Manual Testing

Test these queries to verify the fix:

```bash
# Hebrew
"פיצה בגדרה סגור"
"פיצה סגור בתל אביב"
"מסעדות סגור"

# English
"pizza closed in tel aviv"
"closed restaurants"
"burger places closed"

# Mixed
"פיצה closed"
"closed סושי"
```

**Expected:** Only closed restaurants should appear in results.

### Automated Tests

Run the test suite:

```bash
cd server
npm test -- ranking.service.closed.test
```

**Expected:** All 7 tests pass ✅

---

## Validation Checklist

- [x] "סגור" keyword recognized in Hebrew
- [x] "closed" keyword recognized in English
- [x] `openNow: false` set correctly in intent
- [x] Closed restaurants prioritized in ranking
- [x] Open restaurants penalized when user wants closed
- [x] "Closed now" chip generated
- [x] i18n translations added (4 languages)
- [x] Tests added and passing
- [x] No linter errors
- [x] Backward compatible (existing open filter still works)

---

## Backward Compatibility

✅ **Fully backward compatible**

- Existing `openNow: true` behavior unchanged
- Existing queries without open/closed work as before
- No breaking changes to API or types
- All existing tests still pass

---

## Next Steps (Optional)

### Future Enhancements

1. **Time-based closed filter**
   - "closed at 10pm"
   - "closed on Sundays"

2. **Temporarily closed**
   - Distinguish between "closed now" vs "permanently closed"

3. **Closing soon**
   - "closing in 30 minutes"
   - Show warning for places about to close

4. **Analytics**
   - Track how often users search for closed restaurants
   - Understand use cases better

---

## Phase 8: Transparency & Honesty

### What Changed

**Before Phase 8:**
- ❌ Tried to send `openNow: false` to Google (doesn't work)
- ❌ Users got mixed results (open + closed)
- ❌ No explanation of limitations

**After Phase 8:**
- ✅ Fetch all results from Google (no fake filter)
- ✅ Filter on backend for `openNow === false`
- ✅ Calculate summary before filtering
- ✅ Show disclosure banner with counts
- ✅ Transparent about Google API limitation

### User Experience (Phase 8)

**Query:** "פיצה בגדרה סגור"

**Response:**
1. Shows only closed pizza places ✅
2. Displays disclosure banner: "מציג רק מקומות סגורים (3 מתוך 10 תוצאות)" ℹ️
3. User can hover to see explanation
4. Summary metadata: `{ open: 5, closed: 3, unknown: 2, total: 10 }`
5. Capabilities flag: `closedNowIsDerived: true`

**Why This Matters:**
- ✅ **Honest:** We tell users exactly what we're doing
- ✅ **Transparent:** No hiding API limitations
- ✅ **Accurate:** Summary shows true counts before filtering
- ✅ **Trustworthy:** Users can make informed decisions

---

## Technical Guarantees (Phase 8)

1. ✅ `openNow: false` is NEVER sent to Google API
2. ✅ Summary is calculated BEFORE filtering (accurate totals)
3. ✅ Derived filter applied on backend (no data loss)
4. ✅ Disclosure banner shown when filter is active
5. ✅ Capabilities metadata always included in response

---

## Testing (Phase 8)

**New Test File:** `server/src/services/search/orchestrator/closed-filter.test.ts`

**Coverage:**
- ✅ Summary calculation (all scenarios)
- ✅ Derived filter behavior (integration)
- ✅ No `openNow: false` sent to Google
- ✅ Summary calculated before filtering
- ✅ Capabilities metadata included
- ✅ Real-world scenario: "פיצה בגדרה סגור"

**Frontend Tests:** `disclosure-banner.component.spec.ts`

**Coverage:**
- ✅ Banner visibility logic
- ✅ Message formatting (Hebrew)
- ✅ Explanation text
- ✅ DOM rendering
- ✅ Icon display

---

## Files Changed (Phase 8)

| File | Changes | Purpose |
|------|---------|---------|
| `search.orchestrator.ts` | Derived filter logic | Don't send `openNow: false` to Google |
| `opening-hours-summary.ts` | NEW | Calculate summary before filtering |
| `search-response.dto.ts` | Add metadata fields | Include summary + capabilities |
| `search.types.ts` (frontend) | Add metadata fields | Mirror backend types |
| `disclosure-banner/` | NEW component | Transparency UI |
| `search-page.component.*` | Integrate banner | Show disclosure when needed |
| `*.json` (i18n) | Add disclosure messages | 4 languages |
| `closed-filter.test.ts` | NEW | Test derived filter behavior |

**Total:** 11 files changed/added

---

## Summary

✅ **Fixed:** "סגור" (closed) filter now works correctly  
✅ **Added:** Support for 6 languages  
✅ **Phase 8:** Honest transparency about Google API limitations  
✅ **Derived Filter:** Backend filtering when Google doesn't support it  
✅ **Disclosure:** UI banner explains what's happening  
✅ **Tested:** 7 ranking tests + 5 summary tests + 8 UI tests  
✅ **Compatible:** No breaking changes  

**User Impact:** Users can now search for closed restaurants in any language. The system correctly filters for closed places and transparently explains that this is a derived filter (not native Google API support).

**Example:** "פיצה בגדרה סגור" now returns only closed pizza places in Gedera, with a disclosure banner showing "מציג רק מקומות סגורים (3 מתוך 10 תוצאות)" 🎉

**Principle:** Honesty over features. We deliver the functionality users want while being transparent about how we achieve it.

