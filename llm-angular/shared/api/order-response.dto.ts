import { z } from "zod";

export const OrderStatusDTOZ = z.enum([
    "created", "confirmed", "preparing", "delivering", "completed", "failed",
]);
export type OrderStatusDTO = z.infer<typeof OrderStatusDTOZ>;

export const OrderLineWithPriceDTOZ = z.object({
    itemId: z.string(),
    qty: z.number().int().min(1),
    price: z.number().min(0),          // keep as number to allow 29.9; switch to .int() for agorot
    name: z.string(),
});
export type OrderLineWithPriceDTO = z.infer<typeof OrderLineWithPriceDTOZ>;

export const OrderResponseDTOZ = z.object({
    orderId: z.string(),
    status: OrderStatusDTOZ,
    vendorId: z.string(),
    lines: z.array(OrderLineWithPriceDTOZ).min(1),
    totalPrice: z.number().min(0),
    etaMinutes: z.number().int().min(5),
});
export type OrderResponseDTO = z.infer<typeof OrderResponseDTOZ>;
