/**
 * DEPRECATED: Custom JWT Verifier (replaced by jsonwebtoken library)
 * 
 * This file is kept for backward compatibility with tests only.
 * All production code should use jsonwebtoken library directly.
 * 
 * @deprecated Use jsonwebtoken library instead
 */

import crypto from 'crypto';
import { logger } from '../logger/structured-logger.js';

export interface JWTPayload {
  sub: string;           // userId
  sessionId?: string;
  sid?: string;          // Alternative session ID field
  iat?: number;          // Issued at
  exp?: number;          // Expiration
  [key: string]: any;
}

/**
 * @deprecated Use jsonwebtoken library instead
 * Verify JWT token using HMAC SHA-256
 * ONLY FOR TESTS - DO NOT USE IN PRODUCTION CODE
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
    
    // Split token into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      logger.debug({ reason: 'invalid_format' }, 'JWT: Invalid token format');
      return null;
    }

    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const signatureB64 = parts[2];

    if (!headerB64 || !payloadB64 || !signatureB64) {
      logger.debug({ reason: 'missing_parts' }, 'JWT: Token missing required parts');
      return null;
    }

    // Verify signature
    const message = `${headerB64}.${payloadB64}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('base64url');

    if (signatureB64 !== expectedSignature) {
      logger.debug({ reason: 'invalid_signature' }, 'JWT: Signature verification failed');
      return null;
    }

    // Decode payload (base64url decoding)
    const payloadJson = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload: JWTPayload = JSON.parse(payloadJson);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      logger.debug({ reason: 'expired', exp: payload.exp }, 'JWT: Token expired');
      return null;
    }

    // Require sub (user ID)
    if (!payload.sub || typeof payload.sub !== 'string') {
      logger.debug({ reason: 'missing_sub' }, 'JWT: Missing or invalid sub claim');
      return null;
    }

    return payload;
  } catch (err) {
    logger.debug({ 
      error: err instanceof Error ? err.message : 'unknown',
      reason: 'parse_error' 
    }, 'JWT: Failed to verify token');
    return null;
  }
}

/**
 * Generate a test JWT token for development
 * Usage: JWT_SECRET=dev-secret-change-in-production
 */
export function generateTestJWT(userId: string, sessionId?: string, expiresInSeconds: number = 3600): string {
  const secret = process.env.JWT_SECRET || 'dev-secret-change-in-production';
  
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const payload: JWTPayload = {
    sub: userId,
    ...(sessionId && { sessionId }),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const message = `${headerB64}.${payloadB64}`;
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('base64url');

  return `${message}.${signature}`;
}
