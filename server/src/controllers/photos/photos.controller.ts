/**
 * Photos Proxy Controller
 * P0 Security: Proxies Google Places photo requests to hide API keys
 * 
 * Endpoint: GET /api/v1/photos/:photoReference
 * Returns: Proxied photo from Google Places API
 * 
 * Security features:
 * - Rate limiting: 60 req/min per IP
 * - Input validation with Zod
 * - No API key exposure
 * - Cache headers (24h)
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger/structured-logger.js';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout.js';
import { createRateLimiter } from '../../middleware/rate-limit.middleware.js';
import { createHash } from 'node:crypto';

const router = Router();

// Rate limiter: 60 requests per minute per IP
const photoRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyPrefix: 'photo'
});

// Apply rate limiter to all photo routes
router.use(photoRateLimiter);

/**
 * Validation schema for photo proxy request
 */
const photoRequestSchema = z.object({
  photoReference: z.string()
    .min(10)
    .max(500)
    .regex(/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/, 'Invalid photo reference format'),
  maxWidthPx: z.number()
    .int()
    .min(100)
    .max(1600)
    .default(800),
  maxHeightPx: z.number()
    .int()
    .min(100)
    .max(1600)
    .optional()
});

/**
 * GET /photos/places/:placeId/photos/:photoId
 * Proxy photo requests to Google Places API
 * Photo reference format: places/{placeId}/photos/{photoId}
 */
router.get('/places/:placeId/photos/:photoId', async (req: Request, res: Response) => {
  const requestId = req.traceId || 'unknown';
  const ip = req.socket.remoteAddress || 'unknown';
  
  try {
    // Build photo reference from path parameters
    const { placeId, photoId } = req.params;
    const photoReference = `places/${placeId}/photos/${photoId}`;
    const maxWidthPx = parseInt(req.query.maxWidthPx as string) || 800;
    const maxHeightPx = req.query.maxHeightPx ? parseInt(req.query.maxHeightPx as string) : undefined;

    // Validate with Zod
    const validation = photoRequestSchema.safeParse({
      photoReference,
      maxWidthPx,
      maxHeightPx
    });

    if (!validation.success) {
      logger.warn({
        requestId,
        ip,
        photoReference: photoReference?.substring(0, 50),
        errors: validation.error.issues,
        msg: '[PhotoProxy] Validation failed'
      });
      
      return res.status(400).json({
        error: 'Invalid request',
        code: 'VALIDATION_ERROR',
        traceId: requestId,
        details: validation.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message
        }))
      });
    }

    const { photoReference: validatedRef, maxWidthPx: validatedWidth, maxHeightPx: validatedHeight } = validation.data;

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      logger.error({
        requestId,
        msg: '[PhotoProxy] GOOGLE_API_KEY not configured'
      });
      return res.status(500).json({
        error: 'Photo service unavailable',
        code: 'SERVICE_UNAVAILABLE',
        traceId: requestId
      });
    }

    // Hash photo reference for safe logging (don't log full reference)
    const photoRefHash = createHash('sha256')
      .update(validatedRef)
      .digest('hex')
      .substring(0, 12);

    // Build Google Places photo URL with API key
    const params = new URLSearchParams({
      key: apiKey,
      maxWidthPx: validatedWidth.toString()
    });
    
    if (validatedHeight) {
      params.set('maxHeightPx', validatedHeight.toString());
    }
    
    const googleUrl = `https://places.googleapis.com/v1/${validatedRef}/media?${params.toString()}`;

    logger.info({
      requestId,
      ip,
      photoRefHash,
      maxWidthPx: validatedWidth,
      maxHeightPx: validatedHeight || 'auto',
      msg: '[PhotoProxy] Fetching photo from Google'
    });

    // Fetch photo from Google
    const response = await fetchWithTimeout(googleUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/*'
      }
    }, {
      timeoutMs: 10000,
      requestId,
      stage: 'photo_proxy',
      provider: 'google_places'
    });

    if (!response.ok) {
      const statusCode = response.status;
      
      logger.error({
        requestId,
        ip,
        photoRefHash,
        status: statusCode,
        msg: '[PhotoProxy] Google API error'
      });

      // Map Google API errors to client errors
      if (statusCode === 404) {
        return res.status(404).json({
          error: 'Photo not found',
          code: 'NOT_FOUND',
          traceId: requestId
        });
      } else if (statusCode >= 500) {
        return res.status(502).json({
          error: 'Upstream service error',
          code: 'UPSTREAM_ERROR',
          traceId: requestId
        });
      } else {
        return res.status(statusCode).json({
          error: 'Failed to fetch photo',
          code: 'FETCH_ERROR',
          traceId: requestId
        });
      }
    }

    // Get content type and buffer
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    // Validate content type is an image
    if (!contentType.startsWith('image/')) {
      logger.error({
        requestId,
        ip,
        photoRefHash,
        contentType,
        msg: '[PhotoProxy] Invalid content type from Google'
      });
      
      return res.status(502).json({
        error: 'Invalid response from upstream',
        code: 'INVALID_RESPONSE',
        traceId: requestId
      });
    }

    // CRITICAL: CORS headers for cross-origin image loading
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // CRITICAL: Override Helmet's default to allow cross-origin image loading
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    
    // Set cache headers (photos are immutable)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 24 hours
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('X-Trace-Id', requestId);

    // Send photo
    res.send(Buffer.from(buffer));

    logger.info({
      requestId,
      ip,
      photoRefHash,
      contentType,
      sizeBytes: buffer.byteLength,
      msg: '[PhotoProxy] Photo served successfully'
    });

  } catch (error) {
    logger.error({
      requestId,
      ip,
      error: error instanceof Error ? error.message : 'unknown',
      msg: '[PhotoProxy] Failed to fetch photo'
    });
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      traceId: requestId
    });
  }
});

export default router;
