/**
 * Origin Validation Utility
 * 
 * Shared origin validation for CORS and WebSocket.
 * Logs decisions without leaking sensitive data.
 */

import { logger } from '../logger/structured-logger.js';

export interface OriginValidationResult {
  allowed: boolean;
  reason?: string;
}

export interface OriginValidationOptions {
  allowedOrigins: string[] | null;
  allowNoOrigin?: boolean;
  isProduction: boolean;
  allowWildcardInDev?: boolean;
  context: 'cors' | 'websocket';
}

/**
 * Validate origin against allowlist
 * 
 * @param origin - Origin header value (or undefined)
 * @param options - Validation options
 * @returns Validation result with allowed flag and reason
 */
export function validateOrigin(
  origin: string | undefined | null,
  options: OriginValidationOptions
): OriginValidationResult {
  const { allowedOrigins, allowNoOrigin, isProduction, allowWildcardInDev, context } = options;

  // Production: require allowlist
  if (isProduction && (!allowedOrigins || allowedOrigins.length === 0)) {
    logger.error(
      { context },
      'Origin validation: No allowlist configured in production'
    );
    return { allowed: false, reason: 'no_allowlist_configured' };
  }

  // Production: forbid wildcard
  if (isProduction && allowedOrigins?.includes('*')) {
    logger.error(
      { context },
      'Origin validation: Wildcard (*) forbidden in production'
    );
    return { allowed: false, reason: 'wildcard_forbidden_in_production' };
  }

  // No origin provided
  if (!origin || origin === 'null') {
    if (allowNoOrigin && !isProduction) {
      logger.debug({ context, origin: origin || '(none)' }, 'Origin validation: Allowed (no origin in dev)');
      return { allowed: true };
    }
    
    logger.warn(
      { context, origin: origin || '(none)', isProduction },
      'Origin validation: Rejected (missing origin)'
    );
    return { allowed: false, reason: 'missing_origin' };
  }

  // Parse origin
  let parsedOrigin: string;
  let hostname: string;
  try {
    const url = new URL(origin);
    parsedOrigin = url.origin;
    hostname = url.hostname;
  } catch {
    logger.warn(
      { context, origin: origin.substring(0, 100) }, // Truncate to prevent log injection
      'Origin validation: Rejected (invalid format)'
    );
    return { allowed: false, reason: 'invalid_format' };
  }

  // Development: allow wildcard if enabled
  if (!isProduction && allowWildcardInDev && allowedOrigins?.includes('*')) {
    logger.debug(
      { context, origin: parsedOrigin },
      'Origin validation: Allowed (wildcard in dev)'
    );
    return { allowed: true };
  }

  // Check against allowlist
  const allowed = allowedOrigins?.some((rule) => {
    // Exact match
    if (rule === parsedOrigin) return true;

    // Wildcard subdomain: *.example.com
    if (rule.startsWith('*.')) {
      const base = rule.slice(2);
      return hostname === base || hostname.endsWith(`.${base}`);
    }

    return false;
  }) ?? false;

  if (allowed) {
    logger.debug(
      { context, origin: parsedOrigin },
      'Origin validation: Allowed'
    );
    return { allowed: true };
  }

  // Rejected: log without leaking full allowlist
  logger.warn(
    {
      context,
      origin: parsedOrigin,
      allowlistCount: allowedOrigins?.length ?? 0,
      isProduction
    },
    'Origin validation: Rejected (not in allowlist)'
  );

  return { allowed: false, reason: 'not_in_allowlist' };
}

/**
 * Get safe origin summary for logging (prevent log pollution)
 */
export function getSafeOriginSummary(origins: string[] | null): string {
  if (!origins || origins.length === 0) return '(none)';
  if (origins.includes('*')) return '* (wildcard)';
  if (origins.length > 5) return `${origins.length} origins`;
  return origins.join(', ');
}
