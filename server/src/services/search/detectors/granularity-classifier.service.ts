/**
 * Granularity Classifier Service
 * Classifies search granularity (CITY/STREET/LANDMARK/AREA) to determine grouping behavior
 * Must be deterministic (no LLM calls)
 */

import type { ParsedIntent, StreetDetectionResult, SearchGranularity } from '../types/search.types.js';

export class GranularityClassifier {
  /**
   * Classify search granularity based on intent fields
   * Must be deterministic (no LLM calls)
   * 
   * @param intent - Parsed intent from LLM
   * @param streetDetection - Street detection result
   * @returns Search granularity classification
   */
  classify(intent: ParsedIntent, streetDetection: StreetDetectionResult): SearchGranularity {
    // STREET: Street detected by StreetDetectorService
    if (streetDetection.isStreet) {
      return 'STREET';
    }
    
    // LANDMARK: Place-specific search (mall, station, hospital)
    if (intent.location?.place && intent.location?.placeType === 'landmark') {
      return 'LANDMARK';
    }
    
    // CITY: City specified, no place/street
    if (intent.location?.city && !intent.location?.place) {
      return 'CITY';
    }
    
    // AREA: GPS-based or "near me" with radius
    if (intent.searchMode === 'nearbysearch' || intent.location?.radius) {
      return 'AREA';
    }
    
    // Default: treat as CITY (conservative)
    return 'CITY';
  }
}


