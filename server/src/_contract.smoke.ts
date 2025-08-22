import { FoodQueryDTOZ, type FoodQueryDTO } from "@api";


// דוגמה: ולידציה של קלט משתמש/LLM/HTTP
const maybeQuery = { city: "אשקלון", maxPrice: 60 }; // הגיע מבחוץ
const result = FoodQueryDTOZ.safeParse(maybeQuery);

if (!result.success) {
  // נכשלה ולידציה – תחזיר 400 / תציג שגיאה / לוג וכו'
  console.error(result.error.flatten());
} else {
  // כאן יש אובייקט "נקי" ובטוח עם טיפוסים וה־defaults של Zod הוחלו
  const query: FoodQueryDTO = result.data;
  // query.type יהיה "pizza" אם השדה לא הגיע (בגלל default)
}
