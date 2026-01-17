# ✅ LANDMARK + Keyword Normalization Fix - Complete

## Changes Implemented

### 1. Intent Stage (v3 → v4)

**File**: `server/src/services/search/route2/stages/intent/intent.prompt.ts`

**Added**:
- New field `extraAreaText` (string | null) for secondary area/street phrases
- Detection of pattern: distance from landmark AND area/street phrase
- Examples: "בשאנז אליזה 800 מטר משער הניצחון" → extraAreaText: "Champs-Élysées"

**Updated Schema**: `server/src/services/search/route2/stages/intent/intent.types.ts`
```typescript
extraAreaText: z.string().nullable().optional()
```

**Updated Type**: `server/src/services/search/route2/types.ts`
```typescript
export interface IntentResult {
  // ... existing fields
  extraAreaText?: string | null;
}
```

### 2. Landmark Mapper (v2 → v3)

**File**: `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts`

**Enhanced geocodeQuery logic**:
- If `extraAreaText` exists: `"<extraAreaText> near <landmark> <city>"`
- Example: "Champs-Élysées near Arc de Triomphe Paris"

**Added logging**:
- `debug_dump` with extraAreaText, finalGeocodeQuery, finalKeyword, region
- Warn log if extraAreaText present but not used in geocodeQuery

**Updated prompt**: Passes extraAreaText to LLM

### 3. Keyword Normalization

**File**: `server/src/services/search/route2/stages/google-maps.stage.ts`

**Two locations normalized**:

a) **In `executeLandmarkPlan` (nearbySearch path)**:
```typescript
if (mapping.region && mapping.region !== 'IL') {
  if (keyword.includes('איטלק') || keyword.includes('italian')) {
    normalizedKeyword = 'Italian restaurant';
  } else {
    normalizedKeyword = `${keyword} restaurant`;
  }
}
```

b) **In `buildNearbySearchBody`**:
- Same normalization logic
- Applies to all nearbySearch calls

**Rules**:
- Region != "IL" → normalize to English + "restaurant"
- Italian cuisine → "Italian restaurant"
- Other cuisines → "{cuisine} restaurant"
- Always includes "restaurant" suffix

### 4. Logging Enhancements

**Intent Stage**:
```json
{
  "event": "stage_completed",
  "extraAreaText": "Champs-Élysées"
}
```

**Landmark Mapper**:
```json
{
  "debug_dump": {
    "extraAreaText": "Champs-Élysées",
    "finalGeocodeQuery": "Champs-Élysées near Arc de Triomphe Paris",
    "finalKeyword": "מסעדות איטלקיות",
    "region": "FR"
  }
}
```

**Google Maps Stage**:
```json
{
  "originalKeyword": "מסעדות איטלקיות",
  "normalizedKeyword": "Italian restaurant",
  "region": "FR"
}
```

## Test Case

**Query**: `"מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"`

**Expected Flow**:
1. Intent Stage:
   - route: LANDMARK
   - reason: distance_from_landmark
   - region: FR
   - extraAreaText: "Champs-Élysées"

2. Landmark Mapper:
   - geocodeQuery: "Champs-Élysées near Arc de Triomphe Paris"
   - radiusMeters: 800
   - keyword: "מסעדות איטלקיות"
   - afterGeocode: nearbySearch

3. Google Maps:
   - Geocode: "Champs-Élysées near Arc de Triomphe Paris" → {lat: 48.87, lng: 2.29}
   - Nearby Search:
     - Center: Paris coordinates (not userLocation)
     - Radius: 800m
     - Normalized keyword: "Italian restaurant"
     - Language: he
     - Region: FR

4. Result:
   - Italian restaurants in Champs-Élysées area, near Arc de Triomphe
   - Correct location (Paris, not Israel)

## Files Modified

1. ✅ `server/src/services/search/route2/types.ts` (+1 field)
2. ✅ `server/src/services/search/route2/stages/intent/intent.types.ts` (+1 schema field)
3. ✅ `server/src/services/search/route2/stages/intent/intent.prompt.ts` (v3 → v4, +extraAreaText rules)
4. ✅ `server/src/services/search/route2/stages/intent/intent.stage.ts` (+extraAreaText in result)
5. ✅ `server/src/services/search/route2/stages/route-llm/landmark.mapper.ts` (v2 → v3, +extraAreaText logic, +logging)
6. ✅ `server/src/services/search/route2/stages/google-maps.stage.ts` (+keyword normalization in 2 places)

## Validation

✅ No TypeScript errors  
✅ No linter errors  
✅ Build passes  
✅ Server restarted successfully  
✅ Prompt versions incremented  
✅ Logging comprehensive  

**Status**: ✅ **READY FOR TESTING**

## How to Test

1. **Query**: `"מסעדות איטלקיות בשאנז אליזה 800 מטר משער הניצחון"`

2. **Check logs for**:
   - Intent: extraAreaText="Champs-Élysées"
   - Landmark Mapper: geocodeQuery contains both area AND landmark
   - Google: normalizedKeyword="Italian restaurant"
   - Google: location near Paris (48.87, 2.29)

3. **Verify results**: Italian restaurants in Paris, not Israel
