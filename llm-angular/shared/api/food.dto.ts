// shared/api/cxxx.dto.ts
import { z } from "zod";
import { DietaryZ, GeoZ, FulfillmentModeZ } from "./food.query.dto.js";

export const VendorZ = z.object({
    id: z.string(),
    name: z.string(),
    city: z.string().optional(),
    location: GeoZ.optional(),
    rating: z.number().min(0).max(5).optional(),
});

export const MenuItemZ = z.object({
    id: z.string(),
    vendorId: z.string(),
    title: z.string(),
    price: z.number().min(0),
    currency: z.string().length(3).default("ILS"),
    category: z.string().optional(),     // “pizza”, “salad”, “roll”, etc.
    cuisine: z.string().optional(),      // “italian”, “japanese”, …
    dietaryTags: z.array(DietaryZ).default([]),
    etaMinutes: z.number().int().min(0).optional(),
});

export const food = z.object({
    schemaVersion: z.literal("0.2").default("0.2"),
    queryEcho: z.string().optional(),
    fulfillmentMode: FulfillmentModeZ.optional(),
    vendors: z.array(VendorZ).default([]),
    items: z.array(MenuItemZ).default([]),
    notes: z.array(z.string()).default([]),
});
export type CXXX = z.infer<typeof food>;
