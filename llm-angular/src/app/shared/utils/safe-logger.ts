/**
 * Safe Logger Utility
 * Sanitizes sensitive data from logs
 * 
 * Security Rules:
 * - NEVER log Authorization Bearer tokens
 * - NEVER log x-session-id values
 * - Strip headers object from logged data
 */

const SENSITIVE_HEADERS = ['authorization', 'x-session-id'];
const SENSITIVE_KEYS = ['token', 'password', 'secret', 'apiKey', 'bearer'];

/**
 * Sanitize object by removing sensitive fields
 */
function sanitizeObject(obj: any, depth = 0): any {
  if (depth > 4) return '[MAX_DEPTH]'; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;

  // Primitive types
  if (typeof obj !== 'object') return obj;

  // Arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  // Objects
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive terms AND value is a string (likely a secret)
    // Don't redact booleans, numbers, or null (e.g., tokenPresent: true is OK)
    const isSensitive = SENSITIVE_KEYS.some(term => lowerKey.includes(term.toLowerCase()))
      && typeof value === 'string';

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (lowerKey === 'headers') {
      // Sanitize headers object
      if (value && typeof value === 'object') {
        const sanitizedHeaders: any = {};
        for (const [headerKey, headerValue] of Object.entries(value as any)) {
          const lowerHeader = headerKey.toLowerCase();
          if (SENSITIVE_HEADERS.includes(lowerHeader)) {
            sanitizedHeaders[headerKey] = '[REDACTED]';
          } else {
            sanitizedHeaders[headerKey] = headerValue;
          }
        }
        sanitized[key] = sanitizedHeaders;
      }
    } else {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeObject(value, depth + 1);
    }
  }

  return sanitized;
}

/**
 * Safe console.log that strips sensitive data
 */
export function safeLog(context: string, message: string, data?: any): void {
  if (data !== undefined) {
    const sanitized = sanitizeObject(data);
    console.log(`[${context}] ${message}`, sanitized);
  } else {
    console.log(`[${context}] ${message}`);
  }
}

/**
 * Safe console.debug that strips sensitive data
 */
export function safeDebug(context: string, message: string, data?: any): void {
  if (data !== undefined) {
    const sanitized = sanitizeObject(data);
    console.debug(`[${context}] ${message}`, sanitized);
  } else {
    console.debug(`[${context}] ${message}`);
  }
}

/**
 * Safe console.error that strips sensitive data
 */
export function safeError(context: string, message: string, data?: any): void {
  if (data !== undefined) {
    const sanitized = sanitizeObject(data);
    console.error(`[${context}] ${message}`, sanitized);
  } else {
    console.error(`[${context}] ${message}`);
  }
}

/**
 * Safe console.warn that strips sensitive data
 */
export function safeWarn(context: string, message: string, data?: any): void {
  if (data !== undefined) {
    const sanitized = sanitizeObject(data);
    console.warn(`[${context}] ${message}`, sanitized);
  } else {
    console.warn(`[${context}] ${message}`);
  }
}
