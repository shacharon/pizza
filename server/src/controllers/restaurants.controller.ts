import type { Request, Response } from 'express';
import { getRestaurantsStub } from '../services/restaurant.service.js';
import { getRestaurantsV2 } from '../services/restaurant.v2.service.js';
import type { FoodQueryDTO } from "@api";

export async function restaurantsStubHandler(req: Request, res: Response) {
    try {
        const body = (req.body || {}) as { city?: string; language?: string; page?: number };
        const params = {
            city: (body.city || 'Tel Aviv') as string,
            ...(body.language ? { language: body.language } : {}),
            ...(typeof body.page === 'number' ? { page: body.page } : {}),
        };
        const out = await getRestaurantsStub(params);
        return res.json(out);
    } catch (e: any) {
        const msg = e?.message || 'Unexpected error';
        // eslint-disable-next-line no-console
        console.error('[restaurantsStubHandler] error', msg, e);
        return res.status(500).json({ error: msg });
    }
}

export async function restaurantsSearchHandler(req: Request, res: Response) {
    try {
        const dto = (req.body || {}) as FoodQueryDTO;
        const body = (req.body || {}) as { language?: string; page?: number };
        const mode = process.env.SEARCH_PROVIDER || 'google';
        if (mode === 'google') {
            const out = await getRestaurantsV2(dto);
            return res.json(out);
        }
        const params = {
            city: (dto.city || 'Tel Aviv') as string,
            ...(body.language ? { language: body.language } : {}),
            ...(typeof body.page === 'number' ? { page: body.page } : {}),
        };
        const out = await getRestaurantsStub(params);
        return res.json(out);
    } catch (e: any) {
        const msg = e?.message || 'Unexpected error';
        // eslint-disable-next-line no-console
        console.error('[restaurantsSearchHandler] error', msg, e);
        return res.status(500).json({ error: msg });
    }
}


