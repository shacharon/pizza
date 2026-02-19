/**
 * Query Sanitizer
 * Removes PII from logs by hashing and summarizing queries
 */

import crypto from 'crypto';

/**
 * Sanitize a user query for logging
 * Never logs the raw query, only length and hash
 */
export function sanitizeQuery(query: string): {
  queryLen: number;
  queryHash: string;
} {
  return {
    queryLen: query.length,
    queryHash: crypto.createHash('sha256').update(query).digest('hex').substring(0, 12)
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
