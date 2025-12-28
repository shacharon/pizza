/**
 * Street Detector Service
 * Detects if a search query is street-specific using both LLM intent and pattern matching
 */

import type { ParsedIntent, StreetDetectionResult } from '../types/search.types.js';

export class StreetDetectorService {
  /**
   * Detect if query is street-specific
   * Uses both LLM intent analysis + pattern matching fallback
   * 
   * @param intent - Parsed intent from LLM
   * @param originalQuery - Original user query text
   * @returns Detection result with method used
   */
  detect(intent: ParsedIntent, originalQuery: string): StreetDetectionResult {
    // Method 1: Check LLM-extracted place type (primary)
    const llmDetected = this.checkLLMIntent(intent);
    if (llmDetected.isStreet) {
      console.log(`[StreetDetector] LLM detected street: ${llmDetected.streetName}`);
      return { ...llmDetected, detectionMethod: 'LLM' };
    }
    
    // Method 2: Pattern matching fallback
    const patternDetected = this.checkPattern(originalQuery, intent.location?.place);
    if (patternDetected.isStreet) {
      console.log(`[StreetDetector] Pattern detected street: ${patternDetected.streetName}`);
      return { ...patternDetected, detectionMethod: 'PATTERN' };
    }
    
    console.log(`[StreetDetector] No street detected`);
    return { isStreet: false, detectionMethod: 'NONE' };
  }
  
  /**
   * Check if LLM extracted a street-level place
   * Heuristic: place is set but city is not (implies more specific than city)
   */
  private checkLLMIntent(intent: ParsedIntent): Omit<StreetDetectionResult, 'detectionMethod'> {
    const place = intent.location?.place;
    const city = intent.location?.city;
    
    // If place is set but city is not, assume it's a street
    if (place && !city) {
      return {
        isStreet: true,
        streetName: place
      };
    }
    
    return { isStreet: false };
  }
  
  /**
   * Pattern matching for street indicators in multiple languages
   * Fallback method when LLM doesn't provide clear intent
   */
  private checkPattern(query: string, place?: string): Omit<StreetDetectionResult, 'detectionMethod'> {
    const normalizedQuery = query.toLowerCase();
    
    const streetPatterns = [
      // Hebrew
      { pattern: /רחוב\s+([\u0590-\u05FF\s]+)/u, language: 'he' },
      { pattern: /רח[׳']?\s+([\u0590-\u05FF\s]+)/u, language: 'he' },  // Abbreviated
      
      // English
      { pattern: /\b(\w+\s+)?street\b/i, language: 'en' },
      { pattern: /\b(\w+\s+)?st\.?\b/i, language: 'en' },
      
      // French
      { pattern: /\brue\s+(\w+)/i, language: 'fr' },
      { pattern: /\bavenue\s+(\w+)/i, language: 'fr' },
      
      // Spanish
      { pattern: /\bcalle\s+(\w+)/i, language: 'es' },
      { pattern: /\bavenida\s+(\w+)/i, language: 'es' },
      
      // Arabic
      { pattern: /شارع\s+([\u0600-\u06FF\s]+)/u, language: 'ar' },
    ];
    
    for (const { pattern } of streetPatterns) {
      const match = normalizedQuery.match(pattern);
      if (match) {
        // Extract street name from match or use place from LLM
        const streetName = place || match[1]?.trim() || match[0].trim();
        return { 
          isStreet: true, 
          streetName 
        };
      }
    }
    
    return { isStreet: false };
  }
  
  /**
   * Check if a street name contains common indicators
   * Used for validation
   */
  private isLikelyStreetName(name: string): boolean {
    const streetIndicators = [
      'רחוב', 'רח\'', 'street', 'st.', 'st', 'rue', 'calle', 'avenida', 'avenue', 'شارع'
    ];
    
    const normalized = name.toLowerCase();
    return streetIndicators.some(indicator => normalized.includes(indicator));
  }
}











