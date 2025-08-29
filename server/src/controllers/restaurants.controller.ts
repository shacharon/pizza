import type { Request, Response } from 'express';
import { getRestaurantsStub } from '../services/restaurant.service.js';

export async function restaurantsStubHandler(req: Request, res: Response) {
    try {
        const { city, language, page } = (req.body || {}) as { city?: string; language?: string; page?: number };
        const out = await getRestaurantsStub({ city: city || 'Tel Aviv', language, page });
        return res.json(out);
    } catch (e: any) {
        const msg = e?.message || 'Unexpected error';
        // eslint-disable-next-line no-console
        console.error('[restaurantsStubHandler] error', msg, e);
        return res.status(500).json({ error: msg });
    }
}


