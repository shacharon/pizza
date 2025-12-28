/**
 * Street Detector Service
 * Detects if a search query is street-specific using both LLM intent and pattern matching
 * Language Normalization: Uses canonical.locationText for language-agnostic detection
 */

import type { ParsedIntent, StreetDetectionResult } from '../types/search.types.js';

// Known landmarks/streets (language-agnostic list)
const KNOWN_LANDMARKS = new Set([
  // French landmarks
  'champs-élysées', 'champs elysees', 'tour eiffel', 'arc de triomphe',
  
  // Israel landmarks/streets
  'allenby', 'אלנבי', 'dizengoff', 'דיזנגוף', 'rothschild', 'רוטשילד',
  'ben yehuda', 'בן יהודה', 'king george', 'המלך ג\'ורג\'',
  
  // Add more as needed
]);

export class StreetDetectorService {
  /**
   * Detect if query is street-specific
   * NEW: Uses canonical.locationText for language-agnostic detection
   * 
   * @param intent - Parsed intent from LLM
   * @param originalQuery - Original user query text
   * @returns Detection result with method used
   */
  detect(intent: ParsedIntent, originalQuery: string): StreetDetectionResult {
    // Method 1: Check canonical.locationText (NEW: language-agnostic approach)
    const canonicalDetected = this.checkCanonicalLocation(intent);
    if (canonicalDetected.isStreet) {
      console.log(`[StreetDetector] Canonical detected street/landmark: ${canonicalDetected.streetName}`);
      return { ...canonicalDetected, detectionMethod: 'LLM' };
    }
    
    // Method 2: Check LLM-extracted place type (legacy)
    const llmDetected = this.checkLLMIntent(intent);
    if (llmDetected.isStreet) {
      console.log(`[StreetDetector] LLM detected street: ${llmDetected.streetName}`);
      return { ...llmDetected, detectionMethod: 'LLM' };
    }
    
    // Method 3: Pattern matching fallback
    const patternDetected = this.checkPattern(originalQuery, intent.location?.place);
    if (patternDetected.isStreet) {
      console.log(`[StreetDetector] Pattern detected street: ${patternDetected.streetName}`);
      return { ...patternDetected, detectionMethod: 'PATTERN' };
    }
    
    console.log(`[StreetDetector] No street detected`);
    return { isStreet: false, detectionMethod: 'NONE' };
  }
  
  /**
   * NEW: Check canonical.locationText for street/landmark detection
   * This is language-agnostic and relies on the LLM's extraction
   */
  private checkCanonicalLocation(intent: ParsedIntent): Omit<StreetDetectionResult, 'detectionMethod'> {
    const locationText = intent.canonical?.locationText;
    
    if (!locationText) {
      return { isStreet: false };
    }
    
    const normalized = locationText.toLowerCase();
    
    // Approach 1: Check if locationText contains multiple locations (street + city)
    // E.g., "Champs-Élysées Paris", "Allenby Tel Aviv", "דיזנגוף תל אביב"
    const hasMultipleLocations = locationText.split(/\s+/).length >= 3;
    
    // Approach 2: Check against known landmarks (language-agnostic)
    const matchedLandmark = Array.from(KNOWN_LANDMARKS).find(landmark => 
      normalized.includes(landmark)
    );
    
    if (matchedLandmark || hasMultipleLocations) {
      return {
        isStreet: true,
        streetName: locationText
      };
    }
    
    return { isStreet: false };
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
   * NEW: Added French prepositions (sur, à, près de, dans)
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
      { pattern: /\bon\s+(\w+)/i, language: 'en' },  // "on Main Street"
      
      // French (NEW: Added preposition patterns)
      { pattern: /\brue\s+(\w+)/i, language: 'fr' },
      { pattern: /\bavenue\s+(\w+)/i, language: 'fr' },
      { pattern: /\bsur\s+les\s+([\wÀ-ÿ\s-]+)/i, language: 'fr' },  // "sur les Champs-Élysées"
      { pattern: /\bsur\s+([\wÀ-ÿ\s-]+)/i, language: 'fr' },  // "sur Boulevard"
      { pattern: /\bà\s+([\wÀ-ÿ\s-]+)/i, language: 'fr' },  // "à Montmartre"
      { pattern: /\bprès\s+de\s+([\wÀ-ÿ\s-]+)/i, language: 'fr' },  // "près de la Tour Eiffel"
      { pattern: /\bdans\s+([\wÀ-ÿ\s-]+)/i, language: 'fr' },  // "dans Le Marais"
      
      // Spanish
      { pattern: /\bcalle\s+(\w+)/i, language: 'es' },
      { pattern: /\bavenida\s+(\w+)/i, language: 'es' },
      { pattern: /\ben\s+([\w\s]+)/i, language: 'es' },  // "en la calle"
      
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













