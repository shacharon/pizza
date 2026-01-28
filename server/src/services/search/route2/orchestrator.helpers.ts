/**
 * Route2 Orchestrator Pure Helpers
 * Stateless helper functions for orchestrator
 */

import type { Route2Context } from './types.js';
import type { SearchRequest } from '../types/search-request.dto.js';

/**
 * Check if debug stop is requested at a specific stage
 */
export function shouldDebugStop(ctx: Route2Context, stopAfter: string): boolean {
  return ctx.debug?.stopAfter === stopAfter;
}

/**
 * Convert language to narrator-supported language
 * HARD-CODED: All assistant messages must be English only
 */
export function toNarratorLanguage(lang: unknown): 'he' | 'en' | 'other' {
  return 'en';
}

/**
 * Resolve session ID from request or context
 */
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return request.sessionId || ctx.sessionId || 'route2-session';
}
