import { Router } from 'express';
import { placesSearchHandler } from '../controllers/places/places.controller.js';

export const placesRouter = Router();

// New isolated Places route (LLM-first flow)
placesRouter.post('/places/search', placesSearchHandler);


