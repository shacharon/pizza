# Explicit City Fix - Change Summary

## Key Changes

### 1. textquery-normalizer.ts - City Preservation

**Added: City Detection Function**
```typescript
function extractCityFromQuery(query: string): string | null {
  const lowerQuery = query.toLowerCase().trim();
  
  // Hebrew prepositions for location: ב (in), ליד (near), בקרבת (near)
  const cityPatterns = [
    /ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s*$/,  // "בגדרה" at end
    /ב([א-ת]{2,}(?:\s+[א-ת]{2,})?)\s+/,   // "בגדרה " in middle
    /ליד\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/,  // "ליד גדרה"
    /בקרבת\s+([א-ת]{2,}(?:\s+[א-ת]{2,})?)/, // "בקרבת גדרה"
  ];
  // ... extraction logic
}
```

**Updated: normalizeTextQuery() Function Signature**
```typescript
// BEFORE
export function normalizeTextQuery(
  textQuery: string,
  requestId?: string
): { canonicalTextQuery: string; wasNormalized: boolean; reason: string }

// AFTER
export function normalizeTextQuery(
  textQuery: string,
  cityText?: string | null,        // NEW: Accept cityText
  requestId?: string
): { 
  canonicalTextQuery: string; 
  wasNormalized: boolean; 
  reason: string;
  keptCity?: boolean                // NEW: Track city preservation
}
```

**Updated: Cuisine Extraction Logic**
```typescript
// BEFORE - Drops city
const cuisineKeyword = extractCuisineKeyword(trimmed);
if (cuisineKeyword) {
  return {
    canonicalTextQuery: cuisineKeyword,  // Just "איטלקי"
    wasNormalized: true,
    reason: 'extracted_cuisine'
  };
}

// AFTER - Preserves city
const cuisineKeyword = extractCuisineKeyword(trimmed);
if (cuisineKeyword) {
  // Check if explicit city exists
  const detectedCity = extractCityFromQuery(trimmed);
  const hasExplicitCity = !!(cityText || detectedCity);
  const cityToKeep = cityText || detectedCity;
  
  if (hasExplicitCity && cityToKeep) {
    // Preserve city with cuisine
    return {
      canonicalTextQuery: `${cuisineKeyword} ב${cityToKeep}`,  // "איטלקי בגדרה"
      wasNormalized: true,
      reason: 'extracted_cuisine_with_city',
      keptCity: true
    };
  }
  
  // No city - extract cuisine only (original behavior)
  return {
    canonicalTextQuery: cuisineKeyword,
    wasNormalized: true,
    reason: 'extracted_cuisine',
    keptCity: false
  };
}
```

### 2. textsearch.mapper.ts - Reversed Bias Priority

**Updated: applyLocationBias() Priority**
```typescript
// BEFORE - userLocation first
function applyLocationBias(...) {
  // Priority 1: userLocation (if present)
  if (request.userLocation) {
    return { bias: userLocationBias, source: 'userLocation' };
  }
  
  // Priority 2: cityText (geocoded later)
  if (mapping.cityText) {
    return { bias: undefined, source: 'cityText_pending_geocode' };
  }
}

// AFTER - cityText first
function applyLocationBias(...) {
  // P0 FIX: Check for EXPLICIT city first (before userLocation)
  const hasExplicitCity = !!(mapping.cityText || intent.reason === 'explicit_city_mentioned');
  
  if (hasExplicitCity && mapping.cityText) {
    logger.info({
      note: 'explicit_city_preferred_over_userLocation'
    });
    return { 
      bias: undefined, 
      source: 'cityCenter_pending_geocode'  // Will be geocoded with 10km radius
    };
  }
  
  // Priority 2: userLocation (fallback when no explicit city)
  if (request.userLocation) {
    logger.info({
      note: 'no_explicit_city_using_userLocation'
    });
    return { bias: userLocationBias, source: 'userLocation' };
  }
}
```

### 3. text-search.handler.ts - City-Center Bias & Enhanced Logging

**Updated: normalizeTextQuery() Call**
```typescript
// BEFORE
const { canonicalTextQuery, wasNormalized, reason } = normalizeTextQuery(
  mapping.textQuery, 
  requestId
);

// AFTER
const { canonicalTextQuery, wasNormalized, reason, keptCity } = normalizeTextQuery(
  mapping.textQuery, 
  mapping.cityText,  // NEW: Pass cityText
  requestId
);
```

**Updated: City Geocoding with Smaller Radius**
```typescript
// BEFORE
if (mapping.cityText && !mapping.bias) {
  const cityCoords = await callGoogleGeocodingAPI(...);
  enrichedMapping = {
    ...mapping,
    bias: {
      center: cityCoords,
      radiusMeters: 20000  // 20km
    }
  };
}

// AFTER
const hasExplicitCity = !!mapping.cityText;
const shouldPreferCityBias = hasExplicitCity && !mapping.bias;

if (shouldPreferCityBias) {
  const cityCoords = await callGoogleGeocodingAPI(...);
  const radiusMeters = 10000;  // P0 FIX: 10km for city-center focus
  
  logger.info({
    radiusMeters,
    biasSource: 'cityCenter',  // NEW: Clear label
    event: 'city_geocoded_for_bias'
  });
  
  enrichedMapping = {
    ...mapping,
    textQuery: canonicalTextQuery,
    bias: {
      center: cityCoords,
      radiusMeters  // 10km instead of 20km
    }
  };
}
```

**Updated: Enhanced Payload Logging**
```typescript
// BEFORE
logger.info({
  requestId,
  event: 'textsearch_request_payload',
  textQueryLen: requestBody.textQuery?.length || 0,
  textQueryHash,
  hasBiasApplied: !!requestBody.locationBias,
  biasSource: finalBiasSource  // Generic label
});

// AFTER
logger.info({
  requestId,
  event: 'textsearch_request_payload',
  finalTextQuery: requestBody.textQuery,      // NEW: Show actual query
  textQueryLen: requestBody.textQuery?.length || 0,
  textQueryHash,
  keptCity: keptCity || false,                // NEW: City preserved?
  hasExplicitCity: hasExplicitCity,           // NEW: Explicit city detected?
  hasBiasApplied: !!requestBody.locationBias,
  biasSource: finalBiasSource,                // "cityCenter" or "userLocation"
  ...(requestBody.locationBias && {
    biasRadiusMeters: requestBody.locationBias.circle.radius  // Show radius
  })
});
```

## Summary of Changes

### Behavior Changes
1. **Query Normalization:** "מסעדה איטלקית בגדרה" → "איטלקי בגדרה" (not "איטלקי")
2. **Bias Priority:** explicit city > userLocation (reversed)
3. **Radius:** 10km for city-center, 20km for userLocation

### New Flags & Fields
- `keptCity: boolean` - Whether city was preserved in normalization
- `hasExplicitCity: boolean` - Whether explicit city was detected
- `finalTextQuery: string` - Actual query sent to Google API
- `biasSource: "cityCenter" | "userLocation"` - Clear bias source label

### Log Examples

**Before Fix:**
```
textquery_normalized: canonicalTextQuery="איטלקי", textQueryLen=6
bias_applied: source="userLocation", radiusMeters=20000
textsearch_request_payload: textQueryLen=6
```

**After Fix:**
```
textquery_normalized: canonicalTextQuery="איטלקי בגדרה", keptCity=true, cityText="גדרה"
bias_planned: source="cityCenter_pending_geocode", note="explicit_city_preferred_over_userLocation"
city_geocoded_for_bias: biasSource="cityCenter", radiusMeters=10000
textsearch_request_payload: finalTextQuery="איטלקי בגדרה", textQueryLen=13, keptCity=true, biasSource="cityCenter"
```
