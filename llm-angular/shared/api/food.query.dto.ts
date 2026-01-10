// shared/api/food.query.dto.ts
import { z } from "zod";
import { CardDTOZ } from "./card.dto.js";

export const DietaryZ = z.enum(["gluten_free", "vegan", "vegetarian", "kosher", "halal", "none"]);
export type Dietary = z.infer<typeof DietaryZ>;

export const FulfillmentModeZ = z.enum(["delivery", "pickup", "dine_in"]);
export const GeoZ = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const FoodConstraintsZ = z.object({
    maxPrice: z.number().min(0).optional(),
    dietary: z.array(DietaryZ).optional(),
    deliveryEtaMinutes: z.number().int().min(5).max(120).optional(),
    distanceKm: z.number().min(0).max(50).optional(),
    minRating: z.number().min(0).max(5).optional(),
});

export const FoodQueryDTOZ = z.object({
    raw: z.string().min(1).optional(),
    // location
    city: z.string().min(2).optional(),
    geo: GeoZ.optional(),
    // categorization
    type: z.enum(["pizza", "sushi", "burger", "other"]).default("pizza").optional(), // still works
    cuisine: z.string().min(2).optional(),                                       // more generic
    // fulfillment & money
    fulfillmentMode: FulfillmentModeZ.default("delivery").optional(),
    currency: z.string().length(3).default("ILS").optional(),
    // scalable filters
    constraints: FoodConstraintsZ.default({}).optional(),
    // optional LLM-suggested cards (UI can render without vendor API)
    cards: z.array(CardDTOZ).optional(),
});
export type FoodQueryDTO = z.infer<typeof FoodQueryDTOZ>;

/** Backward‑compat normalizer: fold legacy top‑level filters into constraints */
export function normalizeFoodQuery(input: unknown): FoodQueryDTO {
    const draft = FoodQueryDTOZ.parse(input);
    const legacy = input as any;
    const constraints = { ...(draft.constraints ?? {}) };
    if (legacy?.maxPrice !== undefined) constraints.maxPrice = legacy.maxPrice;
    if (legacy?.dietary) constraints.dietary = legacy.dietary;
    if (legacy?.deliveryEtaMinutes) constraints.deliveryEtaMinutes = legacy.deliveryEtaMinutes;
    return { ...draft, constraints };
}
