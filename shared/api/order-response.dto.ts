export type OrderStatusDTO = "created" | "confirmed" | "preparing" | "delivering" | "completed" | "failed";

export interface OrderLineDTO {
    itemId: string;
    qty: number;
    price: number;     // מחיר ליחידה בזמן ההזמנה
    name?: string;     // אופציונלי להצגה ב-UI
}

export interface OrderResponseDTO {
    orderId: string;
    status: OrderStatusDTO;
    vendorId: string;
    lines: OrderLineDTO[];
    totalPrice: number;     // סכום כולל
    etaMinutes?: number;    // זמן משוער
    note?: string;          // הודעת מערכת/שגיאה ידידותית
}
