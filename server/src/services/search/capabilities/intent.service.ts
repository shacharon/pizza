/**
 * IntentService: Parses natural language queries into structured intents with confidence scoring
 * Wraps PlacesIntentService and adds confidence calculation
 * 
 * Phase 8: Enhanced with intent caching
 */

import type {
  IIntentService,
  ParsedIntent,
  IntentParseResult,
  SessionContext,
  SearchMode,
} from '../types/search.types.js';
import { PlacesIntentService } from '../../places/intent/places-intent.service.js';
import type { PlacesIntent } from '../../places/intent/places-intent.schema.js';
import { SearchConfig, type ConfidenceWeights } from '../config/search.config.js';
import { GeocodingService } from '../geocoding/geocoding.service.js';
import { caches } from '../../../lib/cache/cache-manager.js';
import { CacheConfig, buildIntentCacheKey } from '../config/cache.config.js';

export class IntentService implements IIntentService {
  private placesIntentService: PlacesIntentService;
  private geocodingService?: GeocodingService;
  private confidenceWeights: ConfidenceWeights;

  constructor(
    confidenceWeights?: Partial<ConfidenceWeights>,
    geocodingService?: GeocodingService
  ) {
    this.placesIntentService = new PlacesIntentService();
    this.geocodingService = geocodingService;
    this.confidenceWeights = {
      ...SearchConfig.confidence,
      ...confidenceWeights,
    };
  }

  /**
   * Set session service for city caching
   * Called by orchestrator to enable session-level deduplication
   */
  setSessionService(sessionService: any): void {
    this.sessionService = sessionService;
  }

  private sessionService?: any;

  /**
   * Parse a natural language query into a structured intent with confidence score
   * Phase 8: With intent caching support
   */
  async parse(text: string, context?: SessionContext): Promise<IntentParseResult> {
    const parseStart = Date.now();
    
    // Phase 8: Check intent cache first
    const language = context?.language || 'en';
    if (CacheConfig.intentParsing.enabled) {
      const cacheKey = buildIntentCacheKey(text, language, context);
      const cached = caches.intentParsing.get(cacheKey);
      
      if (cached) {
        const cacheTime = Date.now() - parseStart;
        console.log(`[IntentService] ✅ INTENT CACHE HIT for "${text}" (${cacheTime}ms)`);
        return cached;
      }
      console.log(`[IntentService] ❌ Intent cache MISS for "${text}"`);
    }
    
    // Get intent from existing PlacesIntentService (LLM call)
    const placesIntent = await this.placesIntentService.resolve(text);

    // Convert to ParsedIntent format
    const intent = this.convertToParseIntent(placesIntent, text);

    // Validate city with geocoding if service is available
    // Strategy: Trust but verify - always canonicalize LLM-extracted cities
    if (this.geocodingService && intent.location?.city) {
      const cityCandidate = intent.location.city;
      const sessionId = context?.sessionId;
      
      // Check session cache first (avoid redundant API calls)
      let validationResult = null;
      if (sessionId && this.sessionService) {
        validationResult = await this.sessionService.getValidatedCity(sessionId, cityCandidate);
        if (validationResult) {
          console.log(`[IntentService] 📦 City cache hit: "${cityCandidate}"`);
          intent.location.cityValidation = validationResult.status;
          if (validationResult.status === 'VERIFIED') {
            intent.location.coords = validationResult.coordinates;
          }
        }
      }
      
      // If not in cache, call geocoding API
      if (!validationResult) {
        console.log(`[IntentService] 🌍 Validating city via geocoding: "${cityCandidate}"`);
        
        try {
          const validation = await this.geocodingService.validateCity(cityCandidate);
          intent.location.cityValidation = validation.status;
          
          // Store in session cache for future queries
          if (sessionId && this.sessionService && validation.displayName) {
            await this.sessionService.storeValidatedCity(sessionId, cityCandidate, {
              displayName: validation.displayName,
              coordinates: validation.coordinates || { lat: 0, lng: 0 },
              status: validation.status,
            });
          }
          
          // If verified, update coordinates (ALWAYS use canonical coords, not LLM)
          if (validation.status === 'VERIFIED' && validation.coordinates) {
            intent.location.coords = validation.coordinates;
            console.log(`[IntentService] ✅ City verified: ${validation.displayName}`);
          } else if (validation.status === 'FAILED') {
            console.log(`[IntentService] ❌ City validation failed: "${cityCandidate}"`);
          } else if (validation.status === 'AMBIGUOUS') {
            console.log(`[IntentService] ⚠️ City ambiguous: "${cityCandidate}" (${validation.candidates?.length} candidates)`);
          }
        } catch (error: any) {
          console.error(`[IntentService] Geocoding error:`, error.message);
          // Graceful degradation: proceed without validation
          // This allows search to work even if API is down
          console.log(`[IntentService] ⚠️ Geocoding API unavailable, proceeding with LLM coordinates`);
        }
      }
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(intent, context);
    
    // NEW: Populate semantic header for AI assistant
    intent.originalQuery = text;
    intent.confidenceLevel = this.mapConfidenceLevel(confidence);
    intent.intent = this.determineIntentType(text, intent);
    intent.requiresLiveData = this.checkRequiresLiveData(text, intent);
    
    // NEW: Extract canonical category and location for assistant context
    intent.canonical = {
      category: intent.query || undefined,
      locationText: intent.location?.city || intent.location?.place || undefined,
    };

    const result = { intent, confidence };
    
    // Phase 8: Cache the result
    if (CacheConfig.intentParsing.enabled) {
      const cacheKey = buildIntentCacheKey(text, language, context);
      caches.intentParsing.set(cacheKey, result, CacheConfig.intentParsing.ttl);
      const totalTime = Date.now() - parseStart;
      console.log(`[IntentService] 💾 Cached intent for "${text}" (${totalTime}ms, TTL: ${CacheConfig.intentParsing.ttl / 1000}s)`);
    }

    return result;
  }

  /**
   * Convert PlacesIntent to ParsedIntent format
   */
  private convertToParseIntent(placesIntent: PlacesIntent, originalText: string): ParsedIntent {
    const search = placesIntent.search;
    const target = search.target;
    const filters = search.filters ?? {};

    const intent: ParsedIntent = {
      query: search.query ?? originalText,
      searchMode: search.mode as SearchMode,
      filters: {
        openNow: filters.opennow ?? false,
      },
      language: filters.language ?? SearchConfig.places.defaultLanguage,
    };

    // Only add optional location properties if they exist
    const location: ParsedIntent['location'] = {
      radius: filters.radius ?? (target.coords ? 0 : SearchConfig.places.defaultRadius),
    };
    if (target.city) location.city = target.city;
    if (target.place) location.place = target.place;
    if (target.coords) location.coords = target.coords;
    intent.location = location;

    // Only add priceLevel if it exists
    if (filters.price) {
      intent.filters.priceLevel = this.convertPriceRange(filters.price);
    }

    // Only add cuisine if it exists
    if (filters.type) {
      intent.cuisine = [filters.type];
    }

    // Only add regionLanguage if it exists
    if (filters.language) {
      intent.regionLanguage = filters.language;
    }

    return intent;
  }

  /**
   * Calculate confidence score (0-1) based on query completeness and clarity
   */
  private calculateConfidence(intent: ParsedIntent, context?: SessionContext): number {
    const weights = this.confidenceWeights;
    let confidence = weights.base;

    // Boost if query has explicit food type
    if (intent.query && intent.query.length > 0) {
      confidence += weights.hasQuery;
    }

    // Boost if location is specified (city, place, or coords)
    if (intent.location?.city || intent.location?.place || intent.location?.coords) {
      confidence += weights.hasLocation;
    }

    // Boost if has additional filters (shows specific intent)
    if (intent.filters.openNow || intent.filters.priceLevel || 
        (intent.filters.dietary && intent.filters.dietary.length > 0)) {
      confidence += weights.hasFilters;
    }

    // Penalty if query is too vague (short and no filters)
    if (intent.query.length < weights.vagueQueryLength && !this.hasAnyFilters(intent)) {
      confidence += weights.isVague; // Note: weight is negative
    }

    // Boost if this is a refinement (has context)
    if (context?.previousIntent) {
      confidence += weights.hasContext;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Convert price range to price level (1-4)
   */
  private convertPriceRange(price: { min: number; max: number }): number {
    const avg = (price.min + price.max) / 2;
    if (avg <= 1) return 1;
    if (avg <= 2) return 2;
    if (avg <= 3) return 3;
    return 4;
  }

  /**
   * Check if intent has any filters applied
   */
  private hasAnyFilters(intent: ParsedIntent): boolean {
    return Boolean(
      intent.filters.openNow ||
      intent.filters.priceLevel ||
      (intent.filters.dietary && intent.filters.dietary.length > 0) ||
      (intent.filters.mustHave && intent.filters.mustHave.length > 0) ||
      intent.occasion ||
      (intent.vibe && intent.vibe.length > 0)
    );
  }

  // ============================================================================
  // NEW: AI Assistant Helper Methods
  // ============================================================================

  /**
   * Map numeric confidence to semantic level
   */
  private mapConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
    if (confidence >= 0.7) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Determine intent type from text and parsed intent
   */
  private determineIntentType(
    text: string,
    intent: ParsedIntent
  ): 'search_food' | 'refine' | 'check_opening_status' {
    const lowerText = text.toLowerCase();
    
    // Check for opening status queries
    const openingKeywords = ['open', 'closed', 'hours', 'now', 'פתוח', 'סגור', 'שעות'];
    if (openingKeywords.some(kw => lowerText.includes(kw)) && intent.filters.openNow) {
      return 'check_opening_status';
    }
    
    // Check for refinement queries (short, filter-heavy, no new category)
    if (this.hasAnyFilters(intent) && text.length < 15) {
      return 'refine';
    }
    
    // Default: search_food
    return 'search_food';
  }

  /**
   * Check if query requires live data verification
   */
  private checkRequiresLiveData(text: string, intent: ParsedIntent): boolean {
    const lowerText = text.toLowerCase();
    
    // Keywords that indicate user wants live opening hours
    const liveDataKeywords = [
      'open', 'closed', 'hours', 'now', 'tonight', 'today',
      'פתוח', 'סגור', 'שעות', 'עכשיו', 'הלילה', 'היום'
    ];
    
    return liveDataKeywords.some(kw => lowerText.includes(kw)) || intent.filters.openNow === true;
  }
}

