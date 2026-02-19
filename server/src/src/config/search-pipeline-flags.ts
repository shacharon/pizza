/**
 * Search Pipeline V2 Feature Flags
 * 
 * Controls the new pipeline architecture (GATE -> INTENT_LITE -> ROUTE_MAP)
 * Default: false (V1 flow remains active)
 */

/** Enable the new V2 search pipeline (default: false) */
export const SEARCH_PIPELINE_V2 = process.env.SEARCH_PIPELINE_V2 === 'true';

/** Export all flags as a single object for convenience */
export const searchPipelineFlags = {
  SEARCH_PIPELINE_V2,
};
