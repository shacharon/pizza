/**
 * Google Execute Stage - V2 Pipeline
 * 
 * Executes Google Places search using PlacesProviderService
 * 
 * Purpose:
 * - Build search parameters from intent and plan
 * - Call PlacesProviderService.search() directly
 * - Return RestaurantResult[] array
 * 
 * Phase: V2 Pipeline Real Implementation
 */

import type { IntentLiteResult, SearchPlan, GateResult, PipelineContext, Coordinates } from '../types.js';
import type { RestaurantResult, SearchParams } from '../../types/search.types.js';
import { PlacesProviderService } from '../../capabilities/places-provider.service.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Default coordinates for fallback (Tel Aviv city center)
 * Used when no user location is available
 */
const DEFAULT_COORDS: Coordinates = {
  lat: 32.0853,
  lng: 34.7818
};

/**
 * Build dietary filters array from virtual flags
 */
function buildDietaryFilters(virtual?: IntentLiteResult['virtual']): string[] {
  if (!virtual) return [];
  
  const dietary: string[] = [];
  if (virtual.kosher) dietary.push('kosher');
  if (virtual.vegan) dietary.push('vegan');
  if (virtual.vegetarian) dietary.push('vegetarian');
  if (virtual.glutenFree) dietary.push('gluten_free');
  
  return dietary;
}

/**
 * Execute Google Places search stage
 * 
 * @param intentLiteResult Intent extraction result
 * @param searchPlan Routing plan with mode and radius
 * @param gateResult Gate analysis result (for language/region)
 * @param context Pipeline context (for userLocation)
 * @returns RestaurantResult[] from Google Places
 */
export async function executeGoogleExecuteStage(
  intentLiteResult: IntentLiteResult,
  searchPlan: SearchPlan,
  gateResult: GateResult,
  context: PipelineContext
): Promise<RestaurantResult[]> {
  const { requestId } = context;
  const startTime = Date.now();
  
  logger.info({
    requestId,
    pipelineVersion: 'v2',
    stage: 'google_execute',
    event: 'stage_started',
    mode: searchPlan.mode
  }, 'stage_started');
  
  try {
    // Build query
    const base = intentLiteResult.food.canonical;
    const query = intentLiteResult.location.text 
      ? `${base} ${intentLiteResult.location.text}`
      : base;
    
    // Get location (user coords or default)
    const location = context.request.userLocation || DEFAULT_COORDS;
    
    // Map language
    const language = gateResult.language === 'he' ? 'he' : 'en';
    
    // Build filters
    const filters: SearchParams['filters'] = {
      ...(intentLiteResult.virtual?.openNow !== undefined && {
        openNow: intentLiteResult.virtual.openNow
      }),
      ...(intentLiteResult.virtual?.cheap && { priceLevel: 1 }),
      dietary: buildDietaryFilters(intentLiteResult.virtual),
      mustHave: []
    };
    
    // Build SearchParams
    const searchParams: SearchParams = {
      query,
      location,
      radius: searchPlan.radius,
      language,
      region: gateResult.regionCode,
      mode: searchPlan.mode,
      filters
    };
    
    logger.debug({
      requestId,
      searchParams: {
        query: searchParams.query,
        mode: searchParams.mode,
        radius: searchParams.radius,
        language: searchParams.language,
        region: searchParams.region,
        hasUserLocation: !!context.request.userLocation
      }
    }, '[GoogleExecute] Calling PlacesProviderService');
    
    // Call PlacesProviderService
    const placesProvider = new PlacesProviderService();
    const results = await placesProvider.search(searchParams);
    
    const durationMs = Date.now() - startTime;
    
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      stage: 'google_execute',
      event: 'stage_completed',
      durationMs,
      resultCount: results.length,
      mode: searchPlan.mode
    }, 'stage_completed');
    
    return results;
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logger.error({
      requestId,
      pipelineVersion: 'v2',
      stage: 'google_execute',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, 'stage_failed');
    
    throw error;
  }
}
