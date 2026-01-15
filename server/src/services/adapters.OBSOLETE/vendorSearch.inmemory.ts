import type { FoodQueryDTO, VendorDTO, ItemDTO } from "@api";
import type { VendorSearch, VendorSearchResult } from "../ports/vendorSearch.js";

const VENDORS: VendorDTO[] = [
    { id: "v_pizza_tlv_1", name: "Pizza TLV Central", distanceMinutes: 12, rating: 4.6 },
    { id: "v_pizza_tlv_2", name: "Napoli Tel Aviv", distanceMinutes: 18, rating: 4.4 },
    { id: "v_sushi_tlv_1", name: "Sushi TLV", distanceMinutes: 15, rating: 4.3 },
];

const ITEMS: ItemDTO[] = [
    { itemId: "i_margherita", vendorId: "v_pizza_tlv_1", name: "Margherita", price: 45, tags: ["vegetarian"] },
    { itemId: "i_pepperoni", vendorId: "v_pizza_tlv_1", name: "Pepperoni", price: 52, tags: [] },
    { itemId: "i_napoli", vendorId: "v_pizza_tlv_2", name: "Napoli Classic", price: 49, tags: ["vegetarian"] },
    { itemId: "i_vegan_tlv", vendorId: "v_pizza_tlv_2", name: "Vegan Special", price: 55, tags: ["vegan"] },
    { itemId: "i_sake_roll", vendorId: "v_sushi_tlv_1", name: "Salmon Roll", price: 38, tags: [] },
];

export class InMemoryVendorSearch implements VendorSearch {
    async search(query: FoodQueryDTO): Promise<VendorSearchResult> {
        const city = (query.city || "").toLowerCase();
        const type = (query as any).type as string | undefined;
        const dietary = (query as any).dietary as string[] | undefined;
        const maxPrice = (query as any).maxPrice as number | undefined;

        let vendors = VENDORS;
        if (city && !/tel\s*aviv|תל\s*אביב|tlv/i.test(city)) {
            vendors = VENDORS.slice(0, 2);
        }
        if (type === 'pizza') {
            vendors = vendors.filter(v => v.id.includes('pizza'));
        } else if (type === 'sushi') {
            vendors = vendors.filter(v => v.id.includes('sushi'));
        }

        let items = ITEMS.filter(i => vendors.some(v => v.id === i.vendorId));
        if (Array.isArray(dietary) && dietary.length) {
            items = items.filter(i => dietary.every(tag => i.tags.includes(tag)));
        }
        if (typeof maxPrice === 'number') {
            items = items.filter(i => i.price <= maxPrice);
        }

        return { vendors, items };
    }
}


