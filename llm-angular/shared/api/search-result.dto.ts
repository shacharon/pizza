import { z } from "zod";
import { FoodQueryDTOZ } from "./food.query.dto.js";


export const VendorDTOZ = z.object({
    id: z.string(),
    name: z.string(),
    distanceMinutes: z.number().int().min(0),
    rating: z.number().min(0).max(5).optional(),
});
export type VendorDTO = z.infer<typeof VendorDTOZ>;

export const ItemDTOZ = z.object({
    itemId: z.string(),
    vendorId: z.string(),
    name: z.string(),
    price: z.number().min(0),   // if you want integers only: .int()
    tags: z.array(z.string()).default([]),
});
export type ItemDTO = z.infer<typeof ItemDTOZ>;

export const SearchResultDTOZ = z.object({
    query: FoodQueryDTOZ.optional(),         // ← matches your test { vendors:[], items:[] }
    vendors: z.array(VendorDTOZ).default([]),
    items: z.array(ItemDTOZ).default([]),
});
export type SearchResultDTO = z.infer<typeof SearchResultDTOZ>;
