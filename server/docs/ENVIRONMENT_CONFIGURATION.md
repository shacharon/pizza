# Environment Configuration Guide

## Quick Fix: Disable Geocoding Warnings

If you're seeing `[GeocodingService] ⚠️ Geocoding API key invalid or missing` warnings in your logs, add this to your `.env` file:

```bash
ENABLE_GEOCODING=false
```

This will disable geocoding validation and stop the warnings. The system will use LLM-extracted coordinates instead (which works perfectly fine for most use cases).

## Why This Happens

Your Google API key has **Google Places API** enabled (which is why searches work), but **NOT Google Geocoding API**. The system tries to use geocoding for city validation but gracefully falls back to LLM coordinates when it fails.

## Solution Options

### Option 1: Disable Geocoding (Recommended for Now)

Add to your `.env` file:
```bash
ENABLE_GEOCODING=false
```

**Pros:**
- ✅ No warnings
- ✅ System works perfectly
- ✅ No additional API costs

**Cons:**
- ❌ No city name validation
- ❌ Slightly less accurate coordinates (LLM vs Google API)

### Option 2: Enable Geocoding API (Best for Production)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Library**
3. Search for **"Geocoding API"**
4. Click **Enable**
5. Wait 2-3 minutes for activation
6. Add to your `.env` file:
```bash
ENABLE_GEOCODING=true
```

**Pros:**
- ✅ Better coordinate accuracy
- ✅ City name validation
- ✅ Better error handling

**Cons:**
- ❌ Minimal API costs (~$0.005 per validation, cached for 1 hour)

## Complete Environment Variables

### Required Variables

```bash
# Google API Key (must have Places API enabled)
GOOGLE_API_KEY=your_google_api_key_here

# OpenAI API Key (for LLM intent parsing and assistant)
OPENAI_API_KEY=your_openai_api_key_here
```

### Performance Variables (Highly Recommended)

```bash
# Disable geocoding if Geocoding API not enabled
ENABLE_GEOCODING=false

# ⚡ ENABLE INTENT CACHING (90% faster repeat queries!)
CACHE_INTENT=true
CACHE_INTENT_TTL=600000

# Enable all caching
CACHE_GEOCODING=true
CACHE_PLACES=true
CACHE_RANKING=true
CACHE_ASSISTANT=true

# LLM optimization
LLM_TEMPERATURE=0.0
LLM_MAX_TOKENS_INTENT=200
LLM_MAX_TOKENS_ASSISTANT=150

# Fast path for simple queries (bypasses LLM)
INTENT_FAST_PATH=true

# Use templates for high-confidence results
USE_ASSISTANT_TEMPLATES=true
```

### Optional Variables

```bash
# Server
PORT=3000
NODE_ENV=development

# Google Places API Settings
DEFAULT_REGION=il
ALLOWED_TYPES=restaurant,cafe,food,meal_takeaway,meal_delivery
ALLOWED_LANGUAGES=he,en,ar,ru

# Timeouts (milliseconds)
LLM_INTENT_TIMEOUT_MS=5000
LLM_ASSISTANT_TIMEOUT_MS=5000
PLACES_TEXTSEARCH_TIMEOUT_MS=3000
PLACES_NEARBY_TIMEOUT_MS=3000
PLACES_FINDPLACE_TIMEOUT_MS=2000

# Retries
PLACES_RETRY_ATTEMPTS=2
PLACES_RETRY_BACKOFF_MS=500,1000

# Metrics
METRICS_ENABLED=true

# Cache sizes (max entries)
CACHE_GEOCODING_SIZE=500
CACHE_PLACES_SIZE=1000
CACHE_RANKING_SIZE=500
CACHE_ASSISTANT_SIZE=200

# Dev mode settings
DEV_INTENT_MODE=false
CACHE_INTENT_IN_DEV=false
CACHE_INTENT_TTL_DEV_MS=30000
```

## Current System Behavior

With `ENABLE_GEOCODING=false`:

1. ✅ **Searches work perfectly** - Uses LLM-extracted coordinates
2. ✅ **No warnings** - Geocoding service not initialized
3. ✅ **Fast performance** - No extra API calls
4. ℹ️ **Startup log**: `[SearchController] ℹ️  Geocoding disabled (ENABLE_GEOCODING=false)`

With `ENABLE_GEOCODING=true` and Geocoding API enabled:

1. ✅ **Searches work perfectly** - Uses Google Geocoding for validation
2. ✅ **Better accuracy** - Official Google coordinates
3. ✅ **City validation** - Verifies city names are real
4. ✅ **Cached results** - 1 hour TTL, minimal API calls

## Troubleshooting

### Still seeing warnings after setting `ENABLE_GEOCODING=false`?

1. Make sure you **saved** your `.env` file
2. **Restart the server** completely (stop and start, not just reload)
3. Check the startup logs for: `[SearchController] ℹ️  Geocoding disabled (ENABLE_GEOCODING=false)`

### Want to enable Geocoding later?

1. Enable **Geocoding API** in Google Cloud Console
2. Change `.env`: `ENABLE_GEOCODING=true`
3. Restart server
4. Check logs for: `[SearchController] 🌍 Geocoding validation enabled`

## Performance Impact

| Configuration | First Search | Repeat Search | API Costs |
|---------------|-------------|---------------|-----------|
| Geocoding OFF | ~5-7s | ~1-2s | Lower |
| Geocoding ON | ~6-8s | ~1-2s | Minimal increase |

**Note:** With caching enabled (recommended), repeat searches are blazing fast regardless of geocoding setting.

