import { z } from "zod";

export const OrderLineDTOZ = z.object({
    itemId: z.string(),
    qty: z.number().int().min(1),
});
export type OrderLineDTO = z.infer<typeof OrderLineDTOZ>;

export const OrderRequestDTOZ = z.object({
    vendorId: z.string(),
    items: z.array(OrderLineDTOZ).min(1),
    notes: z.string().optional(),
});
export type OrderRequestDTO = z.infer<typeof OrderRequestDTOZ>;
