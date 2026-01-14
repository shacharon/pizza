/**
 * IntentService: Parses natural language queries into structured intents with confidence scoring
 * Wraps PlacesIntentService and adds confidence calculation
 * 
 * Phase 8: Enhanced with intent caching
 * Language Normalization: Separates requestLanguage, uiLanguage, and googleLanguage
 */

import type {
  IIntentService,
  ParsedIntent,
  IntentParseResult,
  SessionContext,
  SearchMode,
  LanguageContext,
} from '../types/search.types.js';
import { PlacesIntentService } from '../../places/intent/places-intent.service.js';
import type { PlacesIntent } from '../../places/intent/places-intent.schema.js';
import { SearchConfig, type ConfidenceWeights } from '../config/search.config.js';
import { GeocodingService } from '../geocoding/geocoding.service.js';
import { caches } from '../../../lib/cache/cache-manager.js';
import { CacheConfig, buildIntentCacheKey } from '../config/cache.config.js';
import { tryFastIntent } from './fast-intent.js';
import { LanguageDetector } from '../utils/language-detector.js';
import { logger } from '../../../lib/logger/structured-logger.js';

export class IntentService implements IIntentService {
  private placesIntentService: PlacesIntentService;
  private geocodingService?: GeocodingService;
  private confidenceWeights: ConfidenceWeights;

  constructor(
    confidenceWeights?: Partial<ConfidenceWeights>,
    geocodingService?: GeocodingService
  ) {
    this.placesIntentService = new PlacesIntentService();
    if (geocodingService !== undefined) {
      this.geocodingService = geocodingService;
    }
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
   * Intent Performance Policy: Fast Path → Cache → LLM fallback
   * Language Normalization: Detects requestLanguage and creates LanguageContext
   */
  async parse(text: string, context?: SessionContext): Promise<IntentParseResult> {
    const parseStart = Date.now();
    
    // Step 1: Detect request language and create LanguageContext
    const requestLanguage = LanguageDetector.detect(text);
    const googleLanguage = LanguageDetector.toGoogleLanguage(requestLanguage);
    const uiLanguage = LanguageDetector.toUILanguage(requestLanguage);
    
    const languageContext: LanguageContext = {
      requestLanguage,
      googleLanguage,
      uiLanguage
    };
    
    // Structured logging for language detection
    logger.info({
      requestLanguage,
      googleLanguage,
      uiLanguage
    }, 'Language detected');
    
    logger.debug({ requestLanguage, uiLanguage, googleLanguage }, '[IntentService] Language context');
    
    // PHASE 1: Try Fast Path (no LLM)
    if (CacheConfig.intentParsing.fastPathEnabled) {
      const fastResult = tryFastIntent(text, googleLanguage, context);
      if (fastResult.ok) {
        const fastTime = Date.now() - parseStart;
        logger.info({ query: text, durationMs: fastTime, reason: fastResult.reason }, '[IntentService] FAST PATH HIT');
        
        // Convert PlacesIntent to ParsedIntent
        const intent = this.convertToParseIntent(fastResult.intent, text, languageContext);
        intent.originalQuery = text;
        intent.confidenceLevel = 'high';
        intent.intent = 'search_food';
        
        // Extract canonical from PlacesIntent if available
        if ((fastResult.intent as any).canonical) {
          intent.canonical = (fastResult.intent as any).canonical;
        } else {
          intent.canonical = {
            category: intent.query,
            ...(intent.location?.city !== undefined && { locationText: intent.location.city })
          };
        }
        
        return { intent, confidence: fastResult.confidence };
      }
      logger.debug({ reason: fastResult.reason }, '[IntentService] Fast path miss');
    }
    
    // PHASE 2: Check intent cache
    if (CacheConfig.intentParsing.enabled) {
      const cacheKey = buildIntentCacheKey(text, googleLanguage, context ? {
        ...(context.previousIntent?.language !== undefined && { language: context.previousIntent.language }),
        ...(context.previousIntent !== undefined && { lastIntent: context.previousIntent }),
        ...(context.previousIntent?.location?.city !== undefined && { currentCity: context.previousIntent.location.city })
      } : undefined);
      const cached = caches.intentParsing.get(cacheKey);
      
      if (cached) {
        const cacheTime = Date.now() - parseStart;
        logger.info({ query: text, durationMs: cacheTime }, '[IntentService] Intent cache HIT');
        
        // Update language context (might have changed)
        cached.intent.languageContext = languageContext;
        
        return cached;
      }
      logger.debug({ query: text }, '[IntentService] Intent cache MISS');
    }
    
    // PHASE 3: LLM fallback
    const llmStart = Date.now();
    const placesIntent = await this.placesIntentService.resolve(text, googleLanguage);
    const llmTime = Date.now() - llmStart;
    logger.info({ durationMs: llmTime }, '[IntentService] LLM call completed');

    // Convert to ParsedIntent format
    const intent = this.convertToParseIntent(placesIntent, text, languageContext);

    // Location Canonicalization: Geocode city, place, or locationText to extract region
    // Strategy: Trust but verify - canonicalize locations to get coordinates and country code
    if (this.geocodingService && intent.location) {
      const loc = intent.location;
      
      // Skip if region already set (avoid redundant geocoding)
      if (!loc.region) {
        // Priority order: city > place > locationText (canonical or raw)
        const geocodeQuery = 
          loc.city?.trim() ||
          loc.place?.trim() ||
          intent.canonical?.locationText?.trim() ||
          null;
        
        if (geocodeQuery) {
          const sessionId = context?.sessionId;
          
          // Check session cache first (avoid redundant API calls)
          let validationResult = null;
          if (sessionId && this.sessionService) {
            validationResult = await this.sessionService.getValidatedCity(sessionId, geocodeQuery);
            if (validationResult) {
              logger.debug({ geocodeQuery }, '[IntentService] Location cache hit');
              
              // Apply cached data
              if (validationResult.status === 'VERIFIED') {
                if (validationResult.coordinates) {
                  loc.coords = validationResult.coordinates;
                }
                if ((validationResult as any).region) {
                  loc.region = (validationResult as any).region;
                }
              }
              
              // Legacy: set cityValidation for cities
              if (loc.city) {
                loc.cityValidation = validationResult.status;
              }
            }
          }
          
          // If not in cache, call geocoding API
          if (!validationResult) {
            logger.debug({ geocodeQuery }, '[IntentService] Geocoding location for region');
            
            try {
              // Use general geocode() for broader coverage (handles cities, places, streets)
              const geocodeResult = await this.geocodingService.geocode(geocodeQuery);
              
              if (geocodeResult.status === 'VERIFIED') {
                // Extract region (country code)
                if (geocodeResult.countryCode) {
                  loc.region = geocodeResult.countryCode.toLowerCase();
                  
                  // Structured logging
                  logger.info({
                    query: geocodeQuery,
                    region: loc.region,
                    displayName: geocodeResult.displayName
                  }, 'Location canonicalized with region');
                  
                  logger.debug({ region: loc.region }, '[IntentService] Region set');
                }
                
                // Update coordinates (ALWAYS use canonical coords from geocoding)
                if (geocodeResult.coordinates) {
                  loc.coords = geocodeResult.coordinates;
                }
                
                // Legacy: set cityValidation for cities
                if (loc.city) {
                  loc.cityValidation = 'VERIFIED';
                }
                
                logger.info({ displayName: geocodeResult.displayName }, '[IntentService] Location verified');
                
                // Store in session cache for future queries
                if (sessionId && this.sessionService && geocodeResult.displayName) {
                  await this.sessionService.storeValidatedCity(sessionId, geocodeQuery, {
                    displayName: geocodeResult.displayName,
                    coordinates: geocodeResult.coordinates || { lat: 0, lng: 0 },
                    status: 'VERIFIED',
                    region: loc.region, // Store region in cache
                  } as any);
                }
              } else {
                logger.warn({ geocodeQuery }, '[IntentService] Location geocoding failed');
                
                // Legacy: set cityValidation for cities
                if (loc.city) {
                  loc.cityValidation = 'FAILED';
                }
              }
            } catch (error: any) {
              logger.error({ error: error.message }, '[IntentService] Geocoding error');
              // Graceful degradation: proceed without region
              logger.warn('[IntentService] Geocoding API unavailable, proceeding without region');
            }
          }
        } else {
          logger.debug('[IntentService] No location to geocode for region extraction');
        }
      } else {
        logger.debug({ region: loc.region }, '[IntentService] Region already set, skipping geocoding');
      }
    }

    // Language-Aware Strategy: Use original language when it matches region
    // This gives more authentic local results (matching Google Maps behavior)
    if (intent.location?.region && requestLanguage !== 'en') {
      const region = intent.location.region;
      let useOriginalLanguage = false;
      
      // French query in France → use French (currently not supported, fallback to 'en')
      if (requestLanguage === 'fr' && region === 'fr') {
        useOriginalLanguage = true;
        intent.languageContext.googleLanguage = 'en'; // TODO: Add 'fr' to GoogleLanguage type
        
        logger.info({
          requestLanguage,
          region,
          strategy: 'use_original_language'
        }, 'Using French language for French query in France');
        
        logger.debug('[IntentService] Using French language for French query in France');
      }
      // Hebrew query in Israel → use Hebrew
      else if (requestLanguage === 'he' && region === 'il') {
        useOriginalLanguage = true;
        intent.languageContext.googleLanguage = 'he';
        
        logger.info({
          requestLanguage,
          region,
          strategy: 'use_original_language'
        }, 'Using Hebrew language for Hebrew query in Israel');
        
        logger.debug('[IntentService] Using Hebrew language for Hebrew query in Israel');
      }
      
      // If using original language, flag it so orchestrator can use original query
      if (useOriginalLanguage) {
        (intent as any).useOriginalLanguage = true;
      }
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(intent, context);
    
    // NEW: Populate semantic header for AI assistant
    intent.originalQuery = text;
    intent.confidenceLevel = this.mapConfidenceLevel(confidence);
    intent.intent = this.determineIntentType(text, intent);
    intent.requiresLiveData = this.checkRequiresLiveData(text, intent);
    
    // NEW: Extract canonical from LLM response (or fallback to query fields)
    if ((placesIntent as any).canonical) {
      intent.canonical = (placesIntent as any).canonical;
    } else {
      const category = intent.query;
      const locationText = intent.location?.city || intent.location?.place;
      intent.canonical = {
        ...(category !== undefined && { category }),
        ...(locationText !== undefined && { locationText }),
      };
    }

    const result = { intent, confidence };
    
    // Phase 8: Cache the result
    if (CacheConfig.intentParsing.enabled) {
      const cacheKey = buildIntentCacheKey(text, googleLanguage, context ? {
        ...(context.previousIntent?.language !== undefined && { language: context.previousIntent.language }),
        ...(context.previousIntent !== undefined && { lastIntent: context.previousIntent }),
        ...(context.previousIntent?.location?.city !== undefined && { currentCity: context.previousIntent.location.city })
      } : undefined);
      caches.intentParsing.set(cacheKey, result, CacheConfig.intentParsing.ttl);
    }

    // Instrumentation: Performance metrics
    const totalTime = Date.now() - parseStart;
    const usedFastPath = totalTime < 100; // Fast path is typically <50ms
    const usedCache = false; // Would be set earlier if cache hit
    const usedLLM = !usedFastPath && !usedCache;
    
    logger.info({ 
      usedFastPath, 
      usedCache, 
      usedLLM, 
      totalMs: totalTime, 
      confidence: confidence.toFixed(2) 
    }, '[IntentService] Intent parsing complete');

    return result;
  }

  /**
   * Convert PlacesIntent to ParsedIntent format
   * NEW: Uses LanguageContext instead of individual language fields
   */
  private convertToParseIntent(
    placesIntent: PlacesIntent, 
    originalText: string,
    languageContext: LanguageContext
  ): ParsedIntent {
    const search = placesIntent.search;
    const target = search.target;
    const filters = search.filters ?? {};

    const intent: ParsedIntent = {
      query: search.query ?? originalText,
      searchMode: search.mode as SearchMode,
      filters: {
        ...(filters.opennow === true && { openNow: true }),  // Only include if explicitly true (filter out null/undefined)
      },
      languageContext,  // NEW: Use LanguageContext
      originalQuery: originalText,  // REQUIRED field
      
      // DEPRECATED (kept for backward compatibility):
      language: languageContext.googleLanguage,
      regionLanguage: languageContext.requestLanguage,
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
  // PHASE 3: Direct SearchIntent Extraction (LLM-based)
  // ============================================================================

  /**
   * Parse query directly into SearchIntent using LLM (Phase 3)
   * 
   * This is the future path - bypasses legacy ParsedIntent and mapper.
   * Once validated, this will replace the parse() method.
   * 
   * @param query - User's search query
   * @param context - Optional session context
   * @param llm - LLM provider (required for this method)
   * @returns SearchIntent with confidence
   * @throws Error if LLM is not available or extraction fails
   */
  async parseSearchIntent(
    query: string,
    context?: SessionContext,
    llm?: import('../../../llm/types.js').LLMProvider | null
  ): Promise<{ intent: import('../types/intent.dto.js').SearchIntent; confidence: number }> {
    const startTime = Date.now();
    
    if (!llm) {
      throw new Error('LLM provider required for direct SearchIntent extraction');
    }
    
    try {
      // Import the extractor
      const { extractSearchIntentFromLLM, createClarifyIntent } = await import('../llm/search-intent-extractor.js');
      
      // Extract intent using LLM
      const intent = await extractSearchIntentFromLLM(query, llm, 
        context?.sessionId ? { sessionId: context.sessionId } : undefined
      );
      
      const duration = Date.now() - startTime;
      
      logger.info({
        sessionId: context?.sessionId,
        duration,
        confidence: intent.confidence,
        foodPresent: intent.foodAnchor.present,
        locationPresent: intent.locationAnchor.present
      }, '[IntentService] Direct SearchIntent extracted');
      
      return {
        intent,
        confidence: intent.confidence
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error({
        sessionId: context?.sessionId,
        duration,
        error: error instanceof Error ? error.message : 'unknown'
      }, '[IntentService] Direct SearchIntent extraction failed');
      
      // Fallback: create minimal CLARIFY intent
      const { createClarifyIntent } = await import('../llm/search-intent-extractor.js');
      const fallbackIntent = createClarifyIntent(query);
      
      return {
        intent: fallbackIntent,
        confidence: 0.1
      };
    }
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

