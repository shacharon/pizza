/**
 * Restaurants Controller
 * GET /restaurants/:id — fetch single restaurant details by placeId (or canonical id) for details page.
 */

import { Router, type Request, type Response } from 'express';
import { getPlaceDetailsByPlaceId } from '../../services/restaurant-details/place-details.service.js';
import { sanitizePhotoUrls } from '../../utils/security.utils.js';

const router = Router();

const SAFE_PLACE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * GET /restaurants/:id
 * id = placeId (or canonical id from card DTO). Returns 404 if place not found.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const raw = req.params.id;
  const id = (typeof raw === 'string' ? raw : raw?.[0] ?? '').trim();
  if (!id || !SAFE_PLACE_ID_REGEX.test(id)) {
    return res.status(400).json({ code: 'INVALID_ID', message: 'Invalid restaurant id' });
  }

  const place = await getPlaceDetailsByPlaceId(id);
  if (!place) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Restaurant not found', id });
  }

  const sanitized = sanitizePhotoUrls([place]);
  const dto = sanitized[0];
  return res.json(dto);
});

export default router;
