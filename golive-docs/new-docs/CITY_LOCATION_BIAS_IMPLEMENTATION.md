# City Location Bias Implementation

## Summary
Fixed region/city handling so queries like "פיצה בגדרה" (pizza in Gedera) maintain location bias without overloading `regionCode` with city codes.

## Changes Made

### 1. Intent Stage Schema (`intent.types.ts`)
- Added optional `cityText` field to `IntentLLMSchema`
- City names extracted by LLM (e.g., "גדרה", "אשקלון")

### 2. Intent JSON Schema (`intent.prompt.ts`)
- Added `cityText` as optional property in `INTENT_JSON_SCHEMA`
- Allows LLM to return city names without breaking strict mode

### 3. Intent Result Type (`types.ts`)
- Added optional `cityText?: string` to `IntentResult` interface
- Propagates city information through pipeline

### 4. Intent Stage Implementation (`intent.stage.ts`)
- Propagates `cityText` from LLM result to IntentResult in both:
  - Normal flow (line 143-151)
  - Fallback flow when NEARBY → TEXTSEARCH (line 121-135)

### 5. TextSearch Mapper Schema (`schemas.ts`)
- Extended `TextSearchMappingSchema` with optional `cityText` field
- Maintains backward compatibility with existing code

### 6. TextSearch Mapper Implementation (`textsearch.mapper.ts`)
- Propagates `cityText` from intent to mapping in:
  - LLM response flow (line 171-174)
  - Deterministic fallback (line 199-206)

### 7. Google Maps Stage (`google-maps.stage.ts`)
- **Geocoding on cityText**: When `cityText` exists and no bias is set:
  - Geocodes city name using Google Geocoding API (line 435-462)
  - Creates 20km radius location bias centered on city
  - Logs geocoding results and errors
- **Enhanced logging**:
  - `hasBias` now returns `true` when cityText exists (line 249)
  - Logs `cityText` when present (line 250)
  - Tracks bias source: `cityText_geocoded` vs `provided` (line 485)

## Flow Example: "פיצה בגדרה"

1. **Intent Stage**: LLM extracts `cityText: "גדרה"`, `region: "IL"`
2. **TextSearch Mapper**: Propagates `cityText` to mapping
3. **Google Maps Stage**: 
   - Geocodes "גדרה" → `{ lat: 31.8169, lng: 34.7739 }`
   - Creates location bias with 20km radius
   - Sends to Google Places API with bias

## Key Benefits

✅ **No regionCode overload**: City codes (GD/GZ) don't corrupt ISO-3166-1 alpha-2  
✅ **Backward compatible**: Optional field, existing flows unchanged  
✅ **Automatic geocoding**: Cities converted to coordinates transparently  
✅ **Proper hasBias**: Reflects true bias state including city-based bias  
✅ **Observable**: Logs show when city bias is applied and from where

## Files Modified

- `server/src/services/search/route2/stages/intent/intent.types.ts`
- `server/src/services/search/route2/stages/intent/intent.prompt.ts`
- `server/src/services/search/route2/types.ts`
- `server/src/services/search/route2/stages/intent/intent.stage.ts`
- `server/src/services/search/route2/stages/route-llm/schemas.ts`
- `server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts`
- `server/src/services/search/route2/stages/google-maps.stage.ts`

## Testing Recommendations

1. Test query: "פיצה בגדרה" → should show Gedera-area results
2. Test query: "מסעדה באשקלון" → should show Ashkelon-area results
3. Test fallback: cityText geocoding fails → should continue without bias
4. Test backward compat: queries without cityText → work as before
