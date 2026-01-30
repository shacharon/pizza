# LLM-Driven Ranking System (Route2)

**Status:** Implemented  
**Feature Flags:** `RANKING_LLM_ENABLED`, `RANKING_DEFAULT_MODE`  
**Default Behavior:** Disabled (preserves Google order)

## Overview

This module implements an LLM-driven ranking profile selector with deterministic scoring for restaurant search results. The LLM selects a ranking profile based on query intent (not restaurant data), and results are scored deterministically using configurable weights.

## Architecture

### 1. Schema (`ranking-profile.schema.ts`)

Defines ranking profiles and weight structure:

- **Profiles:** `NEARBY`, `QUALITY`, `OPEN_FOCUS`, `BALANCED`
- **Weights:** `rating`, `reviews`, `distance`, `openBoost` (sum to 1.0)
- **Validation:** Zod schema with strict type checking
- **Normalization:** Automatic weight normalization if sum ≠ 1

### 2. LLM Profile Selector (`ranking-profile-llm.service.ts`)

Selects ranking profile using LLM based on minimal context:

**Input (NO restaurant data):**
```typescript
{
  query: string,
  route: "NEARBY" | "TEXTSEARCH" | "LANDMARK",
  hasUserLocation: boolean,
  appliedFilters: {
    openState?: OpenState,
    priceIntent?: PriceIntent,
    minRatingBucket?: MinRatingBucket
  }
}
```

**Output:**
```typescript
{
  profile: RankingProfile,
  weights: {
    rating: 0-1,
    reviews: 0-1,
    distance: 0-1,
    openBoost: 0-1
  }
}
```

**LLM Rules:**
- Distance weight only if `hasUserLocation=true` OR `route=NEARBY`
- OpenBoost weight (0.05-0.2) if `openState` filter present
- Rating+reviews priority if `minRatingBucket` present or query implies quality
- Fallback to `BALANCED` on LLM failure

### 3. Deterministic Ranker (`results-ranker.ts`)

Scores and sorts results using computed weights:

**Score Computation:**
```
score = w.rating * ratingNorm + w.reviews * reviewsNorm + w.distance * distanceNorm + w.openBoost * openNorm
```

**Normalization:**
- `ratingNorm = clamp(rating / 5, 0, 1)`
- `reviewsNorm = clamp(log10(userRatingCount + 1) / 5, 0, 1)`
- `distanceNorm = 1 / (1 + distanceKm)` if user location, else 0
- `openNorm = 1 (open), 0 (closed), 0.5 (unknown)`

**Sort Order:**
1. Score (descending)
2. Rating (descending)
3. Review count (descending)
4. Google index (ascending - preserves Google's order for ties)

### 4. Orchestrator Integration (`orchestrator.ranking.ts`)

Wiring point in Route2 pipeline:

**Location:** After post-filters, before response building (line 301 in orchestrator)

**Behavior:**
- Feature flag check (`RANKING_LLM_ENABLED && RANKING_DEFAULT_MODE=LLM_SCORE`)
- Empty results → skip ranking
- Builds minimal context (no restaurant data)
- Calls LLM selector → deterministic ranker
- Fails gracefully → returns original order

**Logging:**
```
event: "post_rank_applied"
fields: requestId, profile, weights, resultCount, hadUserLocation, mode
```

## Feature Flags

### Environment Variables

```bash
# Enable LLM-driven ranking
RANKING_LLM_ENABLED=false  # default: false

# Ranking mode when enabled
RANKING_DEFAULT_MODE=GOOGLE  # GOOGLE | LLM_SCORE, default: GOOGLE
```

### Configuration (`ranking.config.ts`)

```typescript
getRankingLLMConfig(): {
  enabled: boolean,
  defaultMode: 'GOOGLE' | 'LLM_SCORE'
}
```

## Usage

### Enabling the Feature

1. Set environment variables:
```bash
RANKING_LLM_ENABLED=true
RANKING_DEFAULT_MODE=LLM_SCORE
```

2. Restart server

3. Results will be ranked by LLM-selected profile

### Disabling (Default)

Leave flags at default or set:
```bash
RANKING_LLM_ENABLED=false
RANKING_DEFAULT_MODE=GOOGLE
```

Google's original order is preserved.

## Testing

Unit tests cover:

### Schema Tests (`ranking-profile.schema.test.ts`)
- Weight normalization (sum to 1)
- Zero weights handling
- Schema validation (profiles, weights, strict mode)

### Ranker Tests (`results-ranker.test.ts`)
- Single-factor ranking (rating, reviews, distance, openBoost)
- Multi-factor balanced ranking
- Tie-breaker stability (rating → reviews → googleIndex)
- Missing fields handling
- Non-mutation guarantees

**Run tests:**
```bash
npm test -- src/services/search/route2/ranking/*.test.ts
```

## Examples

### Example 1: Nearby Query

**Input:**
```
query: "pizza near me"
route: NEARBY
hasUserLocation: true
filters: { openState: null }
```

**LLM Selection:**
```json
{
  "profile": "NEARBY",
  "weights": {
    "rating": 0.2,
    "reviews": 0.1,
    "distance": 0.6,
    "openBoost": 0.1
  }
}
```

**Result:** Closest places ranked first, with quality tie-breaker.

### Example 2: Quality Query

**Input:**
```
query: "best sushi restaurants"
route: TEXTSEARCH
hasUserLocation: false
filters: { minRatingBucket: "R40" }
```

**LLM Selection:**
```json
{
  "profile": "QUALITY",
  "weights": {
    "rating": 0.5,
    "reviews": 0.4,
    "distance": 0,
    "openBoost": 0.1
  }
}
```

**Result:** Highest-rated places with many reviews ranked first.

### Example 3: Open Now Query

**Input:**
```
query: "open restaurants now"
route: TEXTSEARCH
hasUserLocation: true
filters: { openState: "OPEN_NOW" }
```

**LLM Selection:**
```json
{
  "profile": "OPEN_FOCUS",
  "weights": {
    "rating": 0.25,
    "reviews": 0.15,
    "distance": 0.4,
    "openBoost": 0.2
  }
}
```

**Result:** Open places prioritized, with proximity and quality factors.

## Ranking Signals (Metadata)

After post-filters and ranking, a `RankingSignals` object is computed and attached to response metadata. This provides deterministic insights about the ranking decision without affecting results.

### Structure

```typescript
{
  profile: "NEARBY" | "QUALITY" | "OPEN_FOCUS" | "BALANCED",
  dominantFactor: "DISTANCE" | "RATING" | "REVIEWS" | "OPEN" | "NONE",
  triggers: {
    lowResults: boolean,              // afterFilters <= 10
    relaxUsed: boolean,               // any filter relaxation
    manyOpenUnknown: boolean,         // >= 40% unknown openNow
    dominatedByOneFactor: boolean     // any weight >= 0.55
  },
  facts: {
    shownNow: number,                 // Results count after filters
    totalPool: number,                // Results count before filters
    hasUserLocation: boolean
  }
}
```

### Thresholds (Deterministic)

- **lowResults:** `resultsAfterFilters <= 10`
- **relaxUsed:** `priceIntent OR minRating relaxed`
- **manyOpenUnknown:** `unknownCount >= 0.4 * resultsAfterFilters`
- **dominatedByOneFactor:** `max(weights) >= 0.55`
- **dominantFactor:** Factor with highest weight (if >= 0.55), else NONE

### Example

```json
{
  "profile": "NEARBY",
  "dominantFactor": "DISTANCE",
  "triggers": {
    "lowResults": false,
    "relaxUsed": true,
    "manyOpenUnknown": false,
    "dominatedByOneFactor": true
  },
  "facts": {
    "shownNow": 15,
    "totalPool": 30,
    "hasUserLocation": true
  }
}
```

### Usage

Signals are always computed (even when ranking is disabled) and attached to `response.meta.rankingSignals`.

## Ranking Suggestions (Assistant Hook)

An LLM-powered assistant hook that generates actionable suggestions based on RankingSignals. Published via WebSocket when quality issues are detected.

**Triggers:**
- `lowResults` - Results count ≤ 10
- `relaxUsed` - Filters were auto-relaxed
- `manyOpenUnknown` - ≥40% results lack openNow data
- `dominatedByOneFactor` - One ranking weight ≥ 0.55

**Output:**
```json
{
  "message": "Found few results. Want to try without the 'open now' filter?",
  "suggestion": "Remove 'open now' filter",
  "suggestedAction": "REMOVE_OPEN_NOW"
}
```

**Key Features:**
- Non-blocking (fires after HTTP response)
- Minimal LLM call (only query + signals)
- Language-aware (Hebrew/English)
- Deterministic fallback on LLM failure
- Never mentions technical details (weights, scores)

See: `assistant/prompts/RANKING_SUGGESTIONS.md`

## Implementation Checklist

- [x] Schema (ranking-profile.schema.ts) with Zod validation
- [x] LLM service (ranking-profile-llm.service.ts) with minimal context
- [x] Deterministic ranker (results-ranker.ts) with stable sorting
- [x] Ranking signals (ranking-signals.ts) with deterministic thresholds
- [x] Ranking suggestions (assistant/ranking-suggestion.service.ts)
- [x] Suggestion prompts (assistant/prompts/ranking-suggestion.prompt.ts)
- [x] WebSocket publisher (assistant/ranking-suggestion-publisher.ts)
- [x] Orchestrator integration (orchestrator.ranking.ts) with feature flags
- [x] Configuration (ranking.config.ts) with env flags
- [x] LLM purpose type added (ranking_profile)
- [x] Unit tests (53 tests, all passing)
  - Schema: 13 tests
  - Ranker: 12 tests
  - Signals: 21 tests
  - Suggestions: 7 tests
- [x] Environment variables documented (.env)
- [x] Logging (post_rank_applied event)
- [x] Graceful fallbacks (LLM failure, empty results)
- [x] Default behavior unchanged (flags disabled)
- [x] Metadata attachment (response.meta.rankingSignals)
- [x] Assistant hook (non-blocking WebSocket suggestions)

## Hard Constraints Met

✅ **No behavior change when flags disabled** - Default mode preserves Google order  
✅ **No new sorting anywhere else** - Single integration point in orchestrator  
✅ **LLM never sees restaurant list** - Only query context passed to LLM  
✅ **All existing logs/events untouched** - Only new `post_rank_applied` event added  
✅ **Deterministic scoring** - Same inputs always produce same outputs  
✅ **Stable tie-breakers** - googleIndex preserves Google's original order  

## Future Enhancements

Potential improvements (not in scope):

- A/B testing framework for comparing GOOGLE vs LLM_SCORE
- User preference learning (personalized weights)
- Time-of-day context (boost open places during meal times)
- Regional preferences (different profiles per region)
- Cache LLM profile selections per query pattern
