/**
 * Photos Proxy Controller
 * P0 Security: Proxies Google Places photo requests to hide API keys
 * 
 * Endpoint: GET /api/v1/photos/:photoReference
 * Returns: Proxied photo from Google Places API
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../lib/logger/structured-logger.js';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout.js';

const router = Router();

/**
 * GET /photos/*
 * Proxy photo requests to Google Places API
 * Photo reference format: places/{placeId}/photos/{photoId}
 */
router.get('/*', async (req: Request, res: Response) => {
  const photoReference = req.params[0]; // Captures everything after /photos/
  const requestId = req.traceId || 'unknown';
  
  // Validate photo reference format
  if (!photoReference || !photoReference.startsWith('places/')) {
    logger.warn({
      requestId,
      photoReference,
      msg: '[PhotoProxy] Invalid photo reference format'
    });
    return res.status(400).json({ error: 'Invalid photo reference' });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      msg: '[PhotoProxy] GOOGLE_API_KEY not configured'
    });
    return res.status(500).json({ error: 'Photo service unavailable' });
  }

  try {
    // Build Google Places photo URL with API key
    const maxWidthPx = parseInt(req.query.maxWidthPx as string) || 800;
    const maxHeightPx = parseInt(req.query.maxHeightPx as string);
    
    const params = new URLSearchParams({
      key: apiKey,
      maxWidthPx: maxWidthPx.toString()
    });
    
    if (maxHeightPx) {
      params.set('maxHeightPx', maxHeightPx.toString());
    }
    
    const googleUrl = `https://places.googleapis.com/v1/${photoReference}/media?${params.toString()}`;

    logger.info({
      requestId,
      photoReference,
      maxWidthPx,
      maxHeightPx: maxHeightPx || 'auto',
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
      logger.error({
        requestId,
        photoReference,
        status: response.status,
        msg: '[PhotoProxy] Google API error'
      });
      return res.status(response.status).json({ error: 'Failed to fetch photo' });
    }

    // Get content type and buffer
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    // Set cache headers (photos are immutable)
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 24 hours
    res.setHeader('Content-Length', buffer.byteLength);

    // Send photo
    res.send(Buffer.from(buffer));

    logger.info({
      requestId,
      photoReference,
      contentType,
      sizeBytes: buffer.byteLength,
      msg: '[PhotoProxy] Photo served successfully'
    });

  } catch (error) {
    logger.error({
      requestId,
      photoReference,
      error: error instanceof Error ? error.message : 'unknown',
      msg: '[PhotoProxy] Failed to fetch photo'
    });
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

export default router;
