/**
 * Query Sanitizer
 * Removes PII from logs by hashing and summarizing queries
 */

import crypto from 'crypto';

const QUERY_PREVIEW_MAX = 200;

/**
 * Length + hash always. Preview is truncated plaintext for CloudWatch search-audit
 * (food queries, not secrets). Tokens/cookies stay in logger redact.
 */
export function sanitizeQuery(query: string): {
  queryLen: number;
  queryHash: string;
  queryPreview: string;
} {
  const normalized = query.replace(/\s+/g, ' ').trim();
  const queryPreview =
    normalized.length <= QUERY_PREVIEW_MAX
      ? normalized
      : `${normalized.slice(0, QUERY_PREVIEW_MAX)}…`;
  return {
    queryLen: query.length,
    queryHash: crypto.createHash('sha256').update(query).digest('hex').substring(0, 12),
    queryPreview,
  };
}

/**
 * Redact Redis URL to hide credentials
 */
export function redactRedisUrl(url: string): {
  redisHost: string;
  redisPort: string;
  redacted: string;
} {
  try {
    const parsed = new URL(url);
    return {
      redisHost: parsed.hostname,
      redisPort: parsed.port || '6379',
      redacted: url.replace(/:[^:@]+@/, ':****@')
    };
  } catch {
    return {
      redisHost: 'unknown',
      redisPort: 'unknown',
      redacted: url.replace(/:[^:@]+@/, ':****@')
    };
  }
}
