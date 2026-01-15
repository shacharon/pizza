import type { FoodQueryDTO, VendorDTO, ItemDTO } from "@api";

export interface VendorSearchResult {
    vendors: VendorDTO[];
    items: ItemDTO[];
}

export interface VendorSearch {
    search(query: FoodQueryDTO): Promise<VendorSearchResult>;
}


