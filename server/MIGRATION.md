# Google Places API Migration to Places API (New)

**Migration Date:** January 2026  
**Status:** ✅ COMPLETED

## Overview

Successfully migrated from Google Places API (Legacy) to Places API (New) v1.

### What Changed

- **Endpoints:** Migrated from GET-based legacy endpoints to POST-based New API
- **Authentication:** Changed from query parameter (`?key=`) to header-based (`X-Goog-Api-Key`)
- **Field Masking:** Added required `X-Goog-FieldMask` header for response field selection
- **Response Format:** Updated response mapping to handle new JSON structure
- **Pagination:** Removed 2-second delay requirement for pagination tokens

### What Stayed the Same

- External API contracts (DTOs, WebSocket payloads, controller endpoints)
- Internal data models (`RestaurantResult`, `SearchResponse`)
- Business logic and routing
- Environment variables (`GOOGLE_API_KEY` unchanged)

---

## API Endpoints

### Text Search

**Old (Legacy):**
```
GET https://maps.googleapis.com/maps/api/place/textsearch/json?key={API_KEY}&query=...
```

**New (Places API v1):**
```
POST https://places.googleapis.com/v1/places:searchText
Headers:
  X-Goog-Api-Key: {API_KEY}
  X-Goog-FieldMask: places.id,places.displayName,...
  Content-Type: application/json
Body:
  {
    "textQuery": "pizza restaurant",
    "languageCode": "he",
    "regionCode": "IL",
    "includedType": "restaurant",
    "locationBias": {
      "circle": {
        "center": {"latitude": 32.0853, "longitude": 34.7818},
        "radius": 1000
      }
    }
  }
```

### Nearby Search

**Old (Legacy):**
```
GET https://maps.googleapis.com/maps/api/place/nearbysearch/json?key={API_KEY}&location=...
```

**New (Places API v1):**
```
POST https://places.googleapis.com/v1/places:searchNearby
Headers:
  X-Goog-Api-Key: {API_KEY}
  X-Goog-FieldMask: places.id,places.displayName,...
  Content-Type: application/json
Body:
  {
    "locationRestriction": {
      "circle": {
        "center": {"latitude": 32.0853, "longitude": 34.7818},
        "radius": 500
      }
    },
    "languageCode": "he",
    "regionCode": "IL",
    "includedType": "restaurant",
    "rankPreference": "DISTANCE"
  }
```

---

## Required Headers

All Places API (New) requests require these headers:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Goog-Api-Key` | `{GOOGLE_API_KEY}` | API authentication |
| `X-Goog-FieldMask` | Field paths (see below) | Specify which response fields to return |
| `Content-Type` | `application/json` | Request body format |

### Field Mask

The following field mask is used to preserve compatibility with existing DTOs:

```
places.id,places.displayName,places.formattedAddress,places.location,
places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,
places.photos,places.types,places.googleMapsUri
```

**Why field masking?** The New API requires explicit field specification for:
- Performance optimization
- Cost control (billing based on fields requested)
- Forward compatibility

---

## Request Body Format

### Common Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `textQuery` | string | Search query text | `"pizza restaurant"` |
| `languageCode` | string | ISO 639-1 code | `"he"`, `"en"` |
| `regionCode` | string | ISO 3166-1 alpha-2 | `"IL"`, `"US"` |
| `includedType` | string | Place type filter | `"restaurant"` |

### Location Bias (Text Search)

```json
{
  "locationBias": {
    "circle": {
      "center": {"latitude": 32.0853, "longitude": 34.7818},
      "radius": 1000
    }
  }
}
```

### Location Restriction (Nearby Search)

```json
{
  "locationRestriction": {
    "circle": {
      "center": {"latitude": 32.0853, "longitude": 34.7818},
      "radius": 500
    }
  }
}
```

---

## Response Format

### Legacy Response Structure

```json
{
  "status": "OK",
  "results": [
    {
      "place_id": "ChIJ...",
      "name": "Pizza Place",
      "formatted_address": "123 Main St",
      "geometry": {
        "location": {"lat": 32.0853, "lng": 34.7818}
      },
      "rating": 4.5,
      "user_ratings_total": 120,
      "price_level": 2,
      "opening_hours": {"open_now": true},
      "photos": [{"photo_reference": "..."}],
      "types": ["restaurant", "food"],
      "url": "https://maps.google.com/..."
    }
  ],
  "next_page_token": "..."
}
```

### New API Response Structure

```json
{
  "places": [
    {
      "id": "places/ChIJ...",
      "displayName": {"text": "Pizza Place", "languageCode": "en"},
      "formattedAddress": "123 Main St",
      "location": {"latitude": 32.0853, "longitude": 34.7818},
      "rating": 4.5,
      "userRatingCount": 120,
      "priceLevel": "PRICE_LEVEL_MODERATE",
      "currentOpeningHours": {"openNow": true},
      "photos": [{"name": "places/ChIJ.../photos/..."}],
      "types": ["restaurant", "food"],
      "googleMapsUri": "https://maps.google.com/..."
    }
  ],
  "nextPageToken": "..."
}
```

### Response Mapping

| Legacy Field | New API Field | Transform |
|--------------|---------------|-----------|
| `results` | `places` | Array name changed |
| `place_id` | `id` | Extract from resource name (`places/ChIJ...` → `ChIJ...`) |
| `name` | `displayName.text` | Nested object |
| `formatted_address` | `formattedAddress` | Renamed (camelCase) |
| `geometry.location.lat` | `location.latitude` | Renamed property |
| `geometry.location.lng` | `location.longitude` | Renamed property |
| `user_ratings_total` | `userRatingCount` | Renamed |
| `price_level` (0-4) | `priceLevel` (enum) | Mapped to integer (see below) |
| `opening_hours.open_now` | `currentOpeningHours.openNow` | Renamed |
| `photos[].photo_reference` | `photos[].name` | Resource name format |
| `url` | `googleMapsUri` | Renamed |
| `next_page_token` | `nextPageToken` | Renamed (camelCase) |

### Price Level Mapping

| New API Enum | Legacy Number | Description |
|--------------|---------------|-------------|
| `PRICE_LEVEL_FREE` | 0 | Free |
| `PRICE_LEVEL_INEXPENSIVE` | 1 | $ |
| `PRICE_LEVEL_MODERATE` | 2 | $$ |
| `PRICE_LEVEL_EXPENSIVE` | 3 | $$$ |
| `PRICE_LEVEL_VERY_EXPENSIVE` | 4 | $$$$ |

---

## Photo URLs

### Legacy Format

```
https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference={photo_reference}&key={API_KEY}
```

### New API Format

```
https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx=800&key={API_KEY}
```

**Example:**
```
https://places.googleapis.com/v1/places/ChIJ.../photos/.../media?maxWidthPx=800&key={API_KEY}
```

Where `photo.name` is the resource name from the response (e.g., `places/ChIJ.../photos/...`).

---

## Pagination

### Legacy Pagination

- Used `next_page_token` in response
- **Required 2-second delay** before using token
- Passed as `pagetoken` query parameter

```javascript
await new Promise(resolve => setTimeout(resolve, 2000)); // Required delay
const params = new URLSearchParams({ key: apiKey, pagetoken: nextPageToken });
```

### New API Pagination

- Uses `nextPageToken` in response
- **No delay required** - immediate use
- Passed in request body

```javascript
const pageBody = { ...requestBody, pageToken: nextPageToken };
// No delay needed!
```

---

## Known Differences & Behavioral Changes

### 1. Keyword Parameter Removed

**Impact:** Nearby Search

**Old:** `keyword` parameter accepted for filtering
```
?keyword=pizza
```

**New:** No direct `keyword` support. Use `includedType` + ranking instead.
```json
{
  "includedType": "restaurant",
  "rankPreference": "DISTANCE"
}
```

**Workaround:** For keyword-based nearby searches, the system now relies on:
- Type filtering (`includedType: "restaurant"`)
- Distance-based ranking (`rankPreference: "DISTANCE"`)
- Post-processing filters if needed

### 2. Pagination is Immediate

**Old:** Required ~2-second delay between page requests  
**New:** No delay needed - tokens are immediately usable

**Benefit:** Faster multi-page result fetching

### 3. Resource Names vs. Simple IDs

**Old:** Place IDs were simple strings: `ChIJxxx...`  
**New:** Place IDs use resource name format: `places/ChIJxxx...`

**Handling:** Extract the ID segment:
```typescript
const placeId = place.id.split('/').pop(); // "places/ChIJ..." → "ChIJ..."
```

### 4. Field Masking Required

**Old:** All fields returned by default  
**New:** Must explicitly request fields via `X-Goog-FieldMask`

**Benefit:** Reduced payload size and API costs

### 5. Error Response Format

**Old:** JSON status field
```json
{
  "status": "REQUEST_DENIED",
  "error_message": "..."
}
```

**New:** HTTP status codes only (no JSON status field)
- 200: Success
- 400: Invalid request
- 403: Authentication failed
- 429: Rate limit exceeded

---

## Environment Variables

No changes required. The same API key works for both legacy and new APIs:

```env
GOOGLE_API_KEY=AIza...
```

**Note:** Ensure your Google Cloud project has the **Places API (New)** enabled in the API Library.

---

## Migration Checklist

- [x] Replace GET endpoints with POST endpoints
- [x] Add required headers (`X-Goog-Api-Key`, `X-Goog-FieldMask`)
- [x] Convert URL params to JSON request bodies
- [x] Update response mapping for new field names
- [x] Update photo URL generation
- [x] Remove pagination delay
- [x] Update logging (provider: `google_places_new`)
- [x] Delete all legacy code paths
- [x] Verify zero legacy API references (grep validation)
- [x] Update TypeScript types (no external API changes)

---

## Files Modified

| File | Changes |
|------|---------|
| `server/src/services/search/route2/stages/google-maps.stage.ts` | Complete rewrite for New API |

**No other files modified.** External APIs, DTOs, and controllers unchanged.

---

## Testing

### Manual Testing

Test each search route:

1. **Text Search:**
   ```
   Query: "pizza in tel aviv"
   Expected: Results from Tel Aviv area
   ```

2. **Nearby Search:**
   ```
   Query: "pizza near me"
   Location: (32.0853, 34.7818)
   Expected: Results within radius
   ```

3. **Landmark Search:**
   ```
   Query: "pizza at azrieli center"
   Expected: Two-phase geocoding + search
   ```

### Validation Commands

```bash
# Verify no legacy API references
grep -r "maps.googleapis.com/maps/api/place" server/src  # Should return 0 results
grep -r "nearbysearch/json" server/src                    # Should return 0 results
grep -r "textsearch/json" server/src                      # Should return 0 results

# Build check
cd server && npm run build
```

---

## Rollback

If issues arise, revert the single modified file:

```bash
git checkout HEAD~1 server/src/services/search/route2/stages/google-maps.stage.ts
```

No other rollback needed.

---

## References

- [Places API (New) Documentation](https://developers.google.com/maps/documentation/places/web-service/op-overview)
- [Text Search Reference](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Nearby Search Reference](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Field Mask Guide](https://developers.google.com/maps/documentation/places/web-service/choose-fields)
- [Migration Guide](https://developers.google.com/maps/documentation/places/web-service/migrate)

---

## Support

For questions or issues related to this migration:

1. Check server logs: `server/logs/server.log`
2. Search for `provider: 'google_places_new'` in logs
3. Verify `fieldMaskUsed` matches expected fields
4. Check API quotas in Google Cloud Console

---

**Migration completed successfully! 🚀**
