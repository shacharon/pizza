# Canonical Google Query Generation (LLM)

## Overview

Canonical query generation optimizes user queries for Google Places Text Search API by transforming them into standardized, Google-friendly formats using an LLM.

## Architecture

```
User Query
    ↓
TextSearch Mapper (existing LLM)
    ↓
Query Normalization (existing)
    ↓
┌─────────────────────────────────────┐
│ Canonical Query Generator (NEW)     │
│ - LLM-based transformation          │
│ - Strict phrase validation          │
│ - Confidence scoring                │
│ - 24h caching                       │
└─────────────────────────────────────┘
    ↓
Google Places Text Search API
```

## Components

### 1. **Canonical Query Generator** (`canonical-query.generator.ts`)

**Purpose:** Transform user queries into canonical Google-optimized format.

**Output:**
```typescript
{
  googleQuery: string,      // Canonical query
  confidence: number,        // 0.0-1.0
  wasRewritten: boolean,     // True if query was transformed
  reason: string            // Success/fallback reason
}
```

**Rules:**
1. Output MUST be: `"<canonical phrase> <city>"` (if city exists)
2. Only allowed phrases:
   - Hebrew: "מסעדה איטלקית", "פיצה", "בית קפה", "שווארמה", "תחנת דלק", "מסעדות"
   - English: "italian restaurant", "pizza", "cafe", "shawarma", "gas station", "restaurants"
3. No extra tokens or filler words
4. If confidence < 0.7 OR error/timeout → use original query (no rewrite)

**Examples:**
```
Input:  "italian food tel aviv"
Output: "italian restaurant tel aviv" (confidence: 0.95)

Input:  "pizza in haifa"
Output: "pizza haifa" (confidence: 0.99)

Input:  "מסעדה איטלקית בתל אביב"
Output: "מסעדה איטלקית תל אביב" (confidence: 0.99)

Input:  "best burger place"
Output: "best burger place" (confidence: 0.4, fallback to original)
```

### 2. **Canonical Query Cache** (`canonical-query.cache.ts`)

**Purpose:** Cache LLM-generated canonical queries to reduce costs and latency.

**Cache Key:** `(rawQueryHash, uiLanguage, regionCode)`
- rawQueryHash: SHA256 of normalized query (first 16 chars)
- uiLanguage: 'he' | 'en'
- regionCode: 'IL' | 'US' | etc.

**TTL:** 24 hours (86400 seconds)

**Cache Tiers:**
- L1 (memory): < 5ms response
- L2 (Redis): < 100ms response
- MISS: > 100ms response (LLM call)

**Format:**
```typescript
Cache Key: canonical_query:{queryHash}:{uiLanguage}:{regionCode}
Example:   canonical_query:a3f2e9d1b8c7a5f4:he:IL

Cached Value: CanonicalQueryOutput {
  googleQuery: "pizza tel aviv",
  wasRewritten: true,
  confidence: 0.98,
  reason: "canonical_success"
}
```

### 3. **Integration** (`textsearch.mapper.ts`)

**Flow:**
```typescript
1. Execute TextSearch Mapper (existing LLM)
   ↓
2. Normalize query (remove chatty language)
   ↓
3. Generate Canonical Query (NEW)
   - Check cache (by query hash, language, region)
   - If miss: call LLM
   - If confidence < 0.7: fallback to original
   - If error/timeout: fallback to original
   ↓
4. Apply location bias
   ↓
5. Send to Google Places API
```

**Integration Points:**
- After query normalization (line ~195)
- Before location bias application (line ~199)
- Also in fallback path (buildDeterministicMapping)

## Logging

### Success
```json
{
  "requestId": "req_123",
  "stage": "canonical_query_generator",
  "event": "canonical_query_success",
  "type": "llm_rewrite",
  "queryHash": "a3f2e9d1b8c7",
  "originalQuery": "italian food tel aviv",
  "canonicalQuery": "italian restaurant tel aviv",
  "confidence": 0.95,
  "durationMs": 250
}
```

### Fallback (Low Confidence)
```json
{
  "requestId": "req_123",
  "stage": "canonical_query_generator",
  "event": "canonical_query_fallback",
  "reason": "low_confidence",
  "originalQuery": "best burger place",
  "proposedQuery": "best burger place",
  "confidence": 0.4,
  "durationMs": 200
}
```

### Fallback (Error/Timeout)
```json
{
  "requestId": "req_123",
  "stage": "canonical_query_generator",
  "event": "canonical_query_fallback",
  "reason": "canonical_fallback_timeout",
  "errorType": "abort_timeout",
  "error": "Request timeout after 3000ms",
  "durationMs": 3005
}
```

### Cache Hit
```json
{
  "requestId": "req_123",
  "event": "canonical_query_cache_result",
  "servedFrom": "cache",
  "cacheTier": "L1",
  "durationMs": 3,
  "wasRewritten": true
}
```

### Cache Miss
```json
{
  "requestId": "req_123",
  "event": "canonical_query_cache_result",
  "servedFrom": "generator",
  "cacheTier": "MISS",
  "durationMs": 280,
  "wasRewritten": true
}
```

## Metrics & Monitoring

### Key Metrics

1. **Cache Hit Rate**
   - Query: `event=canonical_query_cache_result AND servedFrom=cache`
   - Target: > 60% after warm-up

2. **Rewrite Rate**
   - Query: `event=canonical_query_success AND wasRewritten=true`
   - Target: 40-60% (depends on query types)

3. **Fallback Rate**
   - Query: `event=canonical_query_fallback`
   - Target: < 20%

4. **Latency (P95)**
   - Cache hit: < 10ms
   - Cache miss: < 500ms
   - Timeout threshold: 3000ms

### Alerts

1. **High Fallback Rate**
   - Condition: Fallback rate > 30% for 5min
   - Action: Check LLM service health

2. **Low Cache Hit Rate**
   - Condition: Cache hit rate < 40% after 1 hour
   - Action: Check cache service (Redis)

3. **High Latency**
   - Condition: P95 latency > 1000ms
   - Action: Check LLM provider API

## Performance

### Expected Latency

| Scenario | Latency | Notes |
|----------|---------|-------|
| Cache hit (L1) | 2-5ms | Memory cache |
| Cache hit (L2) | 20-80ms | Redis cache |
| Cache miss | 200-500ms | LLM call |
| Timeout | 3000ms | Falls back to original query |

### Cost Optimization

1. **Cache effectiveness:** 60-70% hit rate expected
2. **LLM calls saved:** ~10,000-15,000 calls/day (assuming 25K daily searches)
3. **Estimated cost reduction:** 60-70% for canonical query generation

## Testing

### Manual Testing

```bash
# Test Hebrew query
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "מסעדה איטלקית בתל אביב",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'

# Test English query
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "italian food near me",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'

# Test low-confidence query (should fallback)
curl -X POST http://localhost:8080/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "best sushi place with outdoor seating",
    "userLocation": {"lat": 32.0853, "lng": 34.7818}
  }'
```

### Log Verification

```bash
# Check canonical query logs
cat server/logs/server.log | grep "canonical_query"

# Check success rate
cat server/logs/server.log | grep "canonical_query_success" | wc -l

# Check fallback rate
cat server/logs/server.log | grep "canonical_query_fallback" | wc -l

# Check cache performance
cat server/logs/server.log | grep "canonical_query_cache_result"
```

## Rollout Plan

### Phase 1: Shadow Mode (Week 1)
- Deploy to production
- Generate canonical queries but DON'T use them
- Log both original and canonical queries
- Monitor: confidence scores, rewrite patterns, cache hit rate

### Phase 2: A/B Test (Week 2-3)
- 10% traffic: Use canonical queries
- 90% traffic: Use original queries
- Compare: result quality, CTR, search success rate

### Phase 3: Gradual Rollout (Week 4-6)
- 25% → 50% → 75% → 100% traffic
- Monitor: P95 latency, error rate, user satisfaction

### Phase 4: Full Production (Week 7+)
- 100% traffic
- Continue monitoring and optimization

## Troubleshooting

### Issue: High fallback rate (> 30%)

**Possible Causes:**
1. LLM service down/slow
2. Network issues to LLM provider
3. Confidence threshold too high (0.7)

**Actions:**
1. Check LLM provider status
2. Review recent LLM responses in logs
3. Consider lowering confidence threshold to 0.6

### Issue: Low cache hit rate (< 40%)

**Possible Causes:**
1. Redis cache service down
2. TTL too short (< 24h)
3. High query diversity (many unique queries)

**Actions:**
1. Check Redis connectivity
2. Verify TTL is 86400s (24h)
3. Analyze query patterns (may be expected for diverse queries)

### Issue: Google API errors

**Possible Causes:**
1. Canonical queries too strict (Google doesn't understand)
2. Missing city context in query

**Actions:**
1. Review failed queries in logs
2. Check if allowed phrases match Google's expectations
3. Consider expanding allowed phrase list

## Configuration

### Environment Variables

```bash
# LLM Provider (already configured)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Cache (already configured)
REDIS_URL=redis://localhost:6379

# Timeouts
ROUTE_MAPPER_TIMEOUT_MS=3000  # Canonical query timeout
```

### Feature Flags

None required - integrated into existing TextSearch Mapper flow.

## Future Enhancements

1. **Expand Allowed Phrases**
   - Add more canonical phrases based on real query patterns
   - Support more cuisines (e.g., "sushi", "chinese")

2. **Multi-Language Support**
   - Add support for Russian, Arabic, French
   - Maintain strict phrase lists per language

3. **Dynamic Confidence Threshold**
   - Adjust threshold based on query complexity
   - Lower threshold for simple queries, higher for complex

4. **Query Rewrite Suggestions**
   - Return multiple canonical options
   - Let Google choose best match

5. **Analytics Dashboard**
   - Real-time rewrite rate
   - Cache performance metrics
   - Query pattern analysis

## References

- [Google Places API Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Query Optimization Best Practices](https://support.google.com/business/answer/7091)
- TextSearch Mapper: `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
- Text Search Handler: `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`
