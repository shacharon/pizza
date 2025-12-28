# Structured Logging for Language Parameters

## 🎯 Overview

Added structured JSON logging for all language-related parameters to make debugging easier and enable direct comparison with Google Maps API calls.

## ✅ What Was Added

### 1. Language Detection Log

**File:** `server/src/services/search/capabilities/intent.service.ts`

**When:** At the start of every search, after detecting the language

**Log:**
```json
{
  "level": "info",
  "time": "2025-12-28T...",
  "msg": "Language detected",
  "requestLanguage": "fr",
  "googleLanguage": "en",
  "uiLanguage": "en"
}
```

**Fields:**
- `requestLanguage`: Detected from user query (fr, en, he, ar, ru, etc.)
- `googleLanguage`: Language sent to Google Places API (he or en)
- `uiLanguage`: UI display language (he or en)

---

### 2. City Verification with Region Log

**File:** `server/src/services/search/capabilities/intent.service.ts`

**When:** After successfully geocoding a city

**Log:**
```json
{
  "level": "info",
  "time": "2025-12-28T...",
  "msg": "City verified with region",
  "city": "Paris",
  "region": "fr",
  "displayName": "Paris, France"
}
```

**Fields:**
- `city`: Original city name from query
- `region`: Country code from geocoding (e.g., 'fr', 'il', 'us')
- `displayName`: Formatted address from geocoding API

---

### 3. Google Places API Parameters Log

**File:** `server/src/services/search/orchestrator/search.orchestrator.ts`

**When:** Before calling Google Places API

**Log:**
```json
{
  "level": "info",
  "time": "2025-12-28T...",
  "traceId": "...",
  "msg": "Google Places API parameters",
  "query": "italian restaurant",
  "language": "en",
  "region": "fr",
  "radius": 200,
  "requestLanguage": "fr",
  "canonicalCategory": "italian restaurant",
  "canonicalLocation": "Champs-Élysées Paris"
}
```

**Fields:**
- `query`: Actual query sent to Google Places (English canonical)
- `language`: Language parameter sent to API (he or en)
- `region`: Country code for geographic biasing (e.g., 'fr')
- `radius`: Search radius in meters
- `requestLanguage`: Original detected language from user
- `canonicalCategory`: English category extracted by LLM
- `canonicalLocation`: Original location text (keeps original language)

---

## 🔍 How to Use

### Find Language Detection
```bash
grep '"Language detected"' your-log-file.json
```

### Find Google API Parameters
```bash
grep '"Google Places API parameters"' your-log-file.json
```

### Compare French vs English Search
```bash
# Search 1: French
grep -A1 '"Restaurants italiens sur les Champs-Élysées à Paris"' your-log.json
grep -A10 '"Google Places API parameters"' your-log.json | head -15

# Search 2: English  
grep -A1 '"Italian restaurants on Champs-Élysées Paris"' your-log.json
grep -A10 '"Google Places API parameters"' your-log.json | tail -15
```

---

## 📊 Expected Output

### For French Query: "Restaurants italiens sur les Champs-Élysées à Paris"

```json
{
  "level": "info",
  "msg": "Language detected",
  "requestLanguage": "fr",
  "googleLanguage": "en",
  "uiLanguage": "en"
}

{
  "level": "info",
  "msg": "City verified with region",
  "city": "Paris",
  "region": "fr",
  "displayName": "Paris, France"
}

{
  "level": "info",
  "msg": "Google Places API parameters",
  "query": "italian restaurant",
  "language": "en",
  "region": "fr",
  "radius": 200,
  "requestLanguage": "fr",
  "canonicalCategory": "italian restaurant",
  "canonicalLocation": "Champs-Élysées Paris"
}
```

### For English Query: "Italian restaurants on Champs-Élysées Paris"

```json
{
  "level": "info",
  "msg": "Language detected",
  "requestLanguage": "en",
  "googleLanguage": "en",
  "uiLanguage": "en"
}

{
  "level": "info",
  "msg": "City verified with region",
  "city": "Paris",
  "region": "fr",
  "displayName": "Paris, France"
}

{
  "level": "info",
  "msg": "Google Places API parameters",
  "query": "italian restaurant",
  "language": "en",
  "region": "fr",
  "radius": 200,
  "requestLanguage": "en",
  "canonicalCategory": "italian restaurant",
  "canonicalLocation": "Champs-Élysées Paris"
}
```

**Notice:** Both queries send **identical parameters** to Google Places API:
- ✅ Same `query`: "italian restaurant"
- ✅ Same `language`: "en"
- ✅ Same `region`: "fr"

---

## 🆚 Comparing with Google Maps

### Google Maps Direct Search (French)
When you search "restaurants italiens Champs-Élysées Paris" in Google Maps, it likely uses:
- Query: "restaurants italiens" (French)
- Language: fr
- Region: fr

### Our System
- Query: "italian restaurant" (English)
- Language: en
- Region: fr

**Why Different?**
- Our goal: **Consistency** across languages
- Google Maps: **Native language** optimization

If Google Maps French results are better, we can adjust the strategy to use the detected language when region matches (e.g., French query + French region = use French language).

---

## 🔧 Next Steps

1. **Restart the server** to apply the new logging
2. **Search** for "Restaurants italiens sur les Champs-Élysées à Paris"
3. **Check the logs** for the three new structured log messages
4. **Compare** the parameters with what Google Maps uses
5. **Decide** if we need to adjust the language strategy

---

**Date:** December 28, 2025  
**Status:** ✅ Implemented — Ready for Testing

