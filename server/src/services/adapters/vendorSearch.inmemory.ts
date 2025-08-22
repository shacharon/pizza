import type { FoodQueryDTO, VendorDTO, ItemDTO } from "@api";
import type { VendorSearch, VendorSearchResult } from "../ports/vendorSearch.js";

export class InMemoryVendorSearch implements VendorSearch {
    async search(_query: FoodQueryDTO): Promise<VendorSearchResult> {
        const vendors: VendorDTO[] = [];
        const items: ItemDTO[] = [];
        return { vendors, items };
    }
}


