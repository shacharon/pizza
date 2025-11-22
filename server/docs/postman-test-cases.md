# Postman Test Cases for Translation Service

## Setup

- **Method:** `POST`
- **URL:** `http://localhost:3000/api/places/search`
- **Headers:**
  ```json
  {
    "Content-Type": "application/json"
  }
  ```

---

## Test 1: English → Hebrew (Gedera)

**Request Body:**
```json
{
  "text": "pizza gluten free in gedera",
  "userLocation": null,
  "nearMe": false,
  "schema": null
}
```

**Expected Behavior:**
- ✅ Translation detects: `inputLanguage: 'en'`, `targetRegion: 'IL'`, `regionLanguage: 'he'`
- ✅ Query translated to Hebrew: "פיצה ללא גלוטן בגדרה"
- ✅ Google searches in Hebrew
- ✅ Results translated back to English
- ✅ Place names and addresses in English

**Expected Response:**
```json
{
  "query": {
    "mode": "textsearch",
    "language": "he"
  },
  "restaurants": [
    {
      "placeId": "ChIJ...",
      "name": "TATU PIZZA",
      "address": "Iris 3, Gedera",
      "rating": 5
    }
  ],
  "meta": {
    "source": "google",
    "mode": "nearbysearch",
    "tookMs": 3500
  }
}
```

---

## Test 2: Hebrew → Hebrew (Gedera) - Skip Translation

**Request Body:**
```json
{
  "text": "פיצה ללא גלוטן בגדרה",
  "userLocation": null,
  "nearMe": false,
  "schema": null
}
```

**Expected Behavior:**
- ✅ Translation detects: `inputLanguage: 'he'`, `targetRegion: 'IL'`, `regionLanguage: 'he'`
- ✅ Translation SKIPPED (same language)
- ✅ Google searches in Hebrew (original query)
- ✅ Results NOT translated (already in Hebrew)
- ✅ Place names and addresses in Hebrew

**Expected Response:**
```json
{
  "query": {
    "mode": "textsearch",
    "language": "he"
  },
  "restaurants": [
    {
      "placeId": "ChIJ...",
      "name": "TATU PIZZA תאתו פיצה",
      "address": "אירוס 3, גדרה",
      "rating": 5
    }
  ],
  "meta": {
    "source": "google",
    "mode": "nearbysearch",
    "tookMs": 2500
  }
}
```

**Key Point:** Both Test 1 and Test 2 should return **the same `placeId` values** (same places, different languages)

---

## Test 3: Hebrew → French (Paris)

**Request Body:**
```json
{
  "text": "פיצה בפריז",
  "userLocation": null,
  "nearMe": false,
  "schema": null
}
```

**Expected Behavior:**
- ✅ Translation detects: `inputLanguage: 'he'`, `targetRegion: 'FR'`, `regionLanguage: 'fr'`
- ✅ Query translated to French: "pizza à Paris"
- ✅ Google searches in French
- ✅ Results translated back to Hebrew
- ✅ Place names and addresses in Hebrew

**Expected Response:**
```json
{
  "query": {
    "mode": "textsearch",
    "language": "fr"
  },
  "restaurants": [
    {
      "placeId": "ChIJ...",
      "name": "פיצריה איטלקית",
      "address": "רחוב פריז 123, פריז",
      "rating": 4.5
    }
  ],
  "meta": {
    "source": "google",
    "mode": "textsearch",
    "tookMs": 4000
  }
}
```

---

## Test 4: Near Me with Location

**Request Body:**
```json
{
  "text": "pizza near me",
  "userLocation": {
    "lat": 31.8120082,
    "lng": 34.7774347
  },
  "nearMe": true,
  "schema": null
}
```

**Expected Behavior:**
- ✅ Translation uses `userLocation` for region detection (privacy-aware)
- ✅ Detects region: 'IL' from coordinates
- ✅ Searches in Hebrew
- ✅ Results translated to English

---

## Test 5: Near Me without Location (Fallback)

**Request Body:**
```json
{
  "text": "pizza near me",
  "userLocation": null,
  "nearMe": true,
  "schema": null
}
```

**Expected Behavior:**
- ✅ Translation fallback triggered (no location provided)
- ✅ Defaults to region 'IL'
- ✅ `meta.note` present: "Translation service unavailable; region detected from default"
- ✅ Results in original language (no translation in fallback)

**Expected Response:**
```json
{
  "query": {
    "mode": "textsearch"
  },
  "restaurants": [...],
  "meta": {
    "source": "google",
    "mode": "textsearch",
    "tookMs": 2000,
    "note": "Translation service unavailable; region detected from default"
  }
}
```

---

## Test 6: English in Tel Aviv (Same as Test 1)

**Request Body:**
```json
{
  "text": "pizza in tel aviv",
  "userLocation": null,
  "nearMe": false,
  "schema": null
}
```

**Expected Behavior:**
- ✅ Translation detects: `inputLanguage: 'en'`, `targetRegion: 'IL'`, `regionLanguage: 'he'`
- ✅ Query translated to Hebrew: "פיצה בתל אביב"
- ✅ Google searches in Hebrew
- ✅ Results translated back to English

---

## Console Logs to Check

When running tests, check the server console for:

```
[PlacesLangGraph] translation result {
  inputLanguage: 'en',
  targetRegion: 'IL',
  regionLanguage: 'he',
  skipTranslation: false,
  fallback: undefined
}

[PlacesLangGraph] effective intent {
  mode: 'textsearch',
  query: 'פיצה ללא גלוטן',
  target: { kind: 'city', city: 'גדרה' }
}

[PlacesLangGraph] translated results back to en
```

---

## Key Validation Points

1. ✅ **Same Places:** Test 1 (English) and Test 2 (Hebrew) return same `placeId` values
2. ✅ **Language Detection:** Console shows correct `inputLanguage` and `regionLanguage`
3. ✅ **Skip Translation:** Test 2 shows `skipTranslation: true` in logs
4. ✅ **Result Translation:** Test 1 shows English names, Test 2 shows Hebrew names
5. ✅ **Fallback:** Test 5 shows `meta.note` with fallback explanation
6. ✅ **No Errors:** No `[TranslationService] Failed to parse` errors in console

---

## Import into Postman

1. Open Postman
2. Click "Import"
3. Select `server/docs/postman-translation-tests.json`
4. Run the collection

Or copy/paste the JSON bodies above into individual requests.

