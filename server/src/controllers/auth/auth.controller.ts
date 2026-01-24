/**
 * Auth Controller
 * Handles JWT token generation for client authentication
 * 
 * Endpoints:
 * - POST /api/v1/auth/token - Generate JWT token with sessionId
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';

const router = Router();
const config = getConfig();

/**
 * Request schema for token generation
 * sessionId is optional - if not provided, one will be generated
 */
const TokenRequestSchema = z.object({
  sessionId: z.string().optional()
});

/**
 * Generate a session ID in format: sess_<uuid>
 */
function generateSessionId(): string {
  const uuid = crypto.randomUUID();
  return `sess_${uuid}`;
}

/**
 * POST /api/v1/auth/token
 * Generate JWT token with sessionId
 * 
 * Request body (optional):
 * - sessionId?: string - existing session ID to include in token
 * 
 * Response:
 * - token: string - JWT token (HS256)
 * - sessionId: string - session ID included in the token
 * 
 * Security:
 * - Public endpoint (no auth required for initial token)
 * - Rate limited via global rate limiting
 * - JWT signed with JWT_SECRET from env
 */
router.post('/token', async (req: Request, res: Response) => {
  const traceId = req.traceId || 'unknown';
  
  try {
    // Validate request body
    const parseResult = TokenRequestSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      logger.warn({
        traceId,
        errors: parseResult.error.issues
      }, '[Auth] Invalid token request');
      
      return res.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        details: parseResult.error.issues,
        traceId
      });
    }
    
    // Use provided sessionId or generate a new one
    const sessionId = parseResult.data.sessionId || generateSessionId();
    
    // Generate JWT token
    const payload = { sessionId };
    const token = jwt.sign(payload, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '30d' // 30 days expiration
    });
    
    logger.info({
      traceId,
      sessionId,
      wasProvided: Boolean(parseResult.data.sessionId)
    }, '[Auth] JWT token generated');
    
    return res.status(200).json({
      token,
      sessionId,
      traceId
    });
    
  } catch (error) {
    logger.error({
      traceId,
      error: error instanceof Error ? error.message : 'unknown',
      stack: error instanceof Error ? error.stack : undefined
    }, '[Auth] Token generation failed');
    
    return res.status(500).json({
      error: 'Internal server error',
      code: 'TOKEN_GENERATION_FAILED',
      traceId
    });
  }
});

export default router;
