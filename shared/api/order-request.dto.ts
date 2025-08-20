export interface OrderItemDTO {
    itemId: string;
    qty: number;
    notes?: string;
}

export interface OrderRequestDTO {
    vendorId: string;
    items: OrderItemDTO[];
    address?: string;
    paymentMethod?: "cash" | "card";
}
