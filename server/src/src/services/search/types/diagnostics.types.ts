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
  // NEW: Updated for Language Normalization
  language?: {
    requestLanguage: string;     // Detected from query text (he|en|fr|ar|ru|etc.)
    uiLanguage: string;          // UI display language (he|en)
    googleLanguage: string;      // Sent to Google Places API (he|en)
    region?: string;             // Country code from geocoding (e.g., 'fr', 'il', 'us')
    canonicalCategory?: string;  // English canonical category
    originalQuery: string;       // Original user query text
  };
  
  // Phase 7: Search granularity (for debugging grouping behavior)
  granularity?: import('./search.types.js').SearchGranularity;
  
  // Phase 1: Candidate pool ranking debug info
  candidatePoolSize?: number;        // How many candidates we fetched from Google
  googleResultsCount?: number;       // Actual number of results from Google
  scoredCandidatesCount?: number;    // How many candidates we scored
  topScores?: Array<{                // Top 5 scores (DEV only)
    placeId: string;
    score?: number;
    rank?: number;
  }>;
  
  // Phase 3: Intent comparison (parallel LLM extraction validation)
  intentComparison?: {
    usedDirectIntent: boolean;       // Whether direct LLM extraction was used
    matched: boolean;                 // Whether mapped and direct intents matched
    differences: number;              // Number of differences found
    confidenceDelta: number;          // Confidence difference (direct - mapped)
    metrics: {
      foodAnchorMatch: boolean;
      locationAnchorMatch: boolean;
      nearMeMatch: boolean;
      preferencesMatch: boolean;
    };
  };
}

