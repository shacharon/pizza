/**
 * ROUTE2 Feature Flags
 * 
 * ROUTE2 is a clean, new search pipeline (no V1/V2 dependencies)
 * Default: ENABLED (ROUTE2 is the primary path)
 */

export const ROUTE2_ENABLED = process.env.ROUTE2_ENABLED !== 'false'; // default true
