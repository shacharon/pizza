import { z } from 'zod';

// Canonical schema for the LLM output (aligned to user's spec)
export const CoordsSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

export const TargetSchema = z.object({
    kind: z.enum(['city', 'place', 'coords', 'me']),
    city: z.string().min(1).max(120).optional(),
    place: z.string().min(1).max(200).optional(),
    coords: CoordsSchema.optional(),
});

export const FiltersSchema = z.object({
    type: z.string().optional(),
    keyword: z.string().optional(),
    price: z.object({ min: z.number().min(0).max(4).default(0), max: z.number().min(0).max(4).default(4) }).optional(),
    opennow: z.boolean().optional(),
    radius: z.number().min(1).max(30000).optional(),
    rankby: z.enum(['prominence', 'distance']).optional(),
    language: z.enum(['he', 'en']).optional(),
    region: z.string().optional(),
});

export const OutputSchema = z.object({
    fields: z.array(z.string()).default([
        'place_id', 'name', 'formatted_address', 'geometry', 'opening_hours', 'rating', 'user_ratings_total', 'price_level', 'website', 'photos'
    ]),
    page_size: z.number().int().min(1).max(50).default(20),
});

export const SearchSchema = z.object({
    mode: z.enum(['textsearch', 'nearbysearch', 'findplace']),
    query: z.string().optional(),
    target: TargetSchema,
    filters: FiltersSchema.optional(),
});

export const PlacesIntentSchema = z.object({
    intent: z.literal('find_food'),
    provider: z.literal('google_places'),
    search: SearchSchema,
    output: OutputSchema.optional(),
});

export type PlacesIntent = z.infer<typeof PlacesIntentSchema>;


