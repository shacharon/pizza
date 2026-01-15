/**
 * Gate Adapter
 * 
 * Wraps the existing IntentGateService and maps IntentGateResult to GateResult
 * 
 * Key responsibilities:
 * - Call existing IntentGateService
 * - Map IntentGateResult -> GateResult
 * - Derive region from language (he→'il', en→'us', fr→'fr', etc.)
 * - Log stage timing
 * 
 * Phase: Structural Scaffold (no business logic changes)
 */

import { IntentGateService } from '../../../intent/intent-gate.service.js';
import type { IntentGateResult } from '../../../intent/intent-gate.types.js';
import type { GateResult, PipelineContext } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Map language code to ISO country/region code
 * Used for Google Places API region parameter
 * 
 * Derivation policy: Language → Region (NOT from city extraction)
 */
function deriveRegionFromLanguage(language: string): string | null {
  const regionMap: Record<string, string> = {
    he: 'il', // Hebrew -> Israel
    en: 'us', // English -> US (default)
    fr: 'fr', // French -> France
    ar: 'ae', // Arabic -> UAE (default)
    ru: 'ru', // Russian -> Russia
    es: 'es', // Spanish -> Spain
  };
  
  return regionMap[language] || null;
}

/**
 * Map IntentGateResult to GateResult
 * Adds pipeline-specific fields (region)
 */
function mapToGateResult(gateResult: IntentGateResult): GateResult {
  // Derive region from language (not from city)
  const region = deriveRegionFromLanguage(gateResult.language);
  
  return {
    language: gateResult.language,
    hasFood: gateResult.hasFood,
    food: {
      raw: gateResult.food.raw,
      canonical: gateResult.food.canonical,
    },
    hasLocation: gateResult.hasLocation,
    location: {
      raw: gateResult.location.raw,
      canonical: gateResult.location.canonical,
      isRelative: gateResult.location.isRelative,
      requiresUserLocation: gateResult.location.requiresUserLocation,
    },
    hasModifiers: gateResult.hasModifiers,
    modifiers: {
      openNow: gateResult.modifiers.openNow,
      cheap: gateResult.modifiers.cheap,
      glutenFree: gateResult.modifiers.glutenFree,
      vegetarian: gateResult.modifiers.vegetarian,
      vegan: gateResult.modifiers.vegan,
      kosher: gateResult.modifiers.kosher,
      delivery: gateResult.modifiers.delivery,
      takeaway: gateResult.modifiers.takeaway,
      exclude: gateResult.modifiers.exclude,
    },
    confidence: gateResult.confidence,
    route: gateResult.route,
    routeReason: gateResult.routeReason,
    region, // Pipeline-specific field
  };
}

/**
 * Gate Adapter
 * Wraps IntentGateService for use in V2 pipeline
 */
export class GateAdapter {
  constructor(private readonly gateService: IntentGateService) {}
  
  /**
   * Execute GATE stage
   * 
   * @param query User query text
   * @param context Pipeline context
   * @returns GateResult with routing decision and region
   */
  async execute(query: string, context: PipelineContext): Promise<GateResult> {
    const { requestId, traceId, sessionId } = context;
    const startTime = Date.now();
    
    // Log stage start
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      stage: 'gate',
      event: 'stage_started'
    }, 'stage_started');
    
    try {
      // Call existing IntentGateService
      const gateResult = await this.gateService.analyze(query, {
        requestId,
        traceId,
        sessionId
      });
      
      // Map to GateResult
      const result = mapToGateResult(gateResult);
      
      const durationMs = Date.now() - startTime;
      
      // Log stage completion
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        stage: 'gate',
        event: 'stage_completed',
        durationMs,
        route: result.route,
        confidence: result.confidence,
        region: result.region,
        hasFood: result.hasFood,
        hasLocation: result.hasLocation,
        hasModifiers: result.hasModifiers
      }, 'stage_completed');
      
      return result;
      
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      logger.error({
        requestId,
        pipelineVersion: 'v2',
        stage: 'gate',
        event: 'stage_failed',
        durationMs,
        error: error instanceof Error ? error.message : 'unknown'
      }, 'stage_failed');
      
      throw error;
    }
  }
}
