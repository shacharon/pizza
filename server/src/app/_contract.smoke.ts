import type { FoodQueryDTO, OrderRequestDTO, SearchResultDTO } from "@api";
const _smoke: FoodQueryDTO = { city: "אשקלון" };
void _smoke;

const q: FoodQueryDTO = { city: "אשקלון" };
const r: SearchResultDTO = { vendors: [], items: [] };
const o: OrderRequestDTO = { vendorId: "1", items: [{ itemId: "42", qty: 1 }] };

void [q, r, o];