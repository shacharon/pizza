/**
 * Diagnostics Type
 * Performance and debug metadata (dev/debug mode only)
 * Phase 4: Added language diagnostics
 */

export interface Diagnostics {
  timings: {
    intentMs: number;       // LLM Pass A: intent parsing
    geocodeMs: number;      // Location resolution
    providerMs: number;     // Google Places API call
    rankingMs: number;      // Ranking + filtering
    assistantMs: number;    // LLM Pass B: assistant narration
    totalMs: number;        // End-to-end request time
  };
  
  counts: {
    results: number;        // Total results returned
    chips: number;          // Total chips generated
    exact?: number;         // On-street matches (street queries only)
    nearby?: number;        // Nearby matches (street queries only)
    weakMatches?: number;   // Phase 3: Results with score < weakMatchThreshold
  };
  
  top: {
    placeIds: string[];     // IDs of top 3 results (for debugging)
    scores?: number[];      // Phase 3: Top 3 scores (0-100)
    reasons?: string[][];   // Phase 3: Top 3 match reasons
  };
  
  flags: {
    usedLLMIntent: boolean;         // Did LLM Pass A succeed?
    usedLLMAssistant: boolean;      // Did LLM Pass B succeed?
    usedTranslation: boolean;       // Did we translate the query?
    liveDataRequested: boolean;     // Did user ask for hours/open status?
    hasWeakMatches?: boolean;       // Phase 3: True if any weak matches detected
  };
  
  // Phase 4: Language diagnostics (optional, dev/debug only)
  language?: {
    input: string;              // Request language (from request.language)
    resolved: string;           // ParsedIntent.language (authoritative)
    assistantOutput?: string;   // Detected assistant message language
    mismatchDetected: boolean;  // True if assistant validation failed
  };
}

