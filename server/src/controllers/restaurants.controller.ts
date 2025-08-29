import type { Request, Response } from 'express';
import { FoodQueryDTOZ, type FoodQueryDTO } from '@api';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';
const provider = getRestaurantsProvider();

export async function restaurantsSearchHandler(req: Request, res: Response) {
    const parsed = FoodQueryDTOZ.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    const dto = parsed.data as FoodQueryDTO;
    const out = await provider.search(dto);
    return res.json(out);
}


