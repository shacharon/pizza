import type { ChatMessageDTO, FoodQueryDTO, OrderRequestDTO, OrderResponseDTO, SearchResultDTO } from "@api";

const _smoke: FoodQueryDTO = { city: "אשקלון", maxPrice: 60, dietary: ["gluten_free"] };
const q: FoodQueryDTO = { city: "אשקלון", maxPrice: 60 };
const r: SearchResultDTO = { vendors: [], items: [] };
const o: OrderRequestDTO = { vendorId: "1", items: [{ itemId: "42", qty: 2 }] };


const orr: OrderResponseDTO = {
    orderId: "abc123",
    status: "created",
    vendorId: "1",
    lines: [{ itemId: "42", qty: 2, price: 29.9, name: "Margarita" }],
    totalPrice: 59.8,
    etaMinutes: 35
};
const m: ChatMessageDTO = { role: "user", content: "שלום", timestamp: new Date().toISOString() };

void [q, r, o, orr, m];
void _smoke;
