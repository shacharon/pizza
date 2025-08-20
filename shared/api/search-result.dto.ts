// תיאור מסעדה ב-API
export interface VendorDTO {
    id: string;
    name: string;
    city: string;
    rating?: number;
    deliveryETA?: number; // בדקות
}

// תיאור פריט תפריט ב-API
export interface MenuItemDTO {
    id: string;
    vendorId: string;
    name: string;
    price: number;
    tags?: string[]; // gluten_free, spicy וכו'
}

// תשובת חיפוש
export interface SearchResultDTO {
    vendors: VendorDTO[];
    items: MenuItemDTO[];
}
