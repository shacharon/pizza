import type { FoodQueryDTO } from "./food.query.dto.js";
import type { VendorDTO } from "./search-result.dto.js";
import type { ItemDTO } from "./search-result.dto.js";

export type ChatAction =
    | { action: "clarify"; data: { question: string; missing?: string[] } }
    | { action: "results"; data: { vendors: VendorDTO[]; items: ItemDTO[]; query: FoodQueryDTO } }
    | { action: "confirm"; data: { quoteId: string; total: number; etaMinutes: number } }
    | { action: "refuse"; data: { message: string } };


