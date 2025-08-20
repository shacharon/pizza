// חוזה ה-API בלבד. זה ה"Wire format" בין FE↔BE.
// אין כאן לוגיקת דומיין או שדות UI-ספציפיים.

export type DietaryTag = "gluten_free" | "vegan" | "kosher";

export interface FoodQueryDTO {
    city?: string;            // למשל: "אשקלון"
    maxPrice?: number;        // למשל: 60 (₪)
    dietary?: DietaryTag[];   // למשל: ["gluten_free"]
}
