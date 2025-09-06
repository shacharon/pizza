import { z } from 'zod';
import { createLLMProvider } from '../llm/factory.js';
import {
    LLM_COMPLETION_TIMEOUT_MS,
    LLM_FOOD_CHECK_TIMEOUT_MS,
    FALLBACK_HEBREW_CITIES,
    FALLBACK_ENGLISH_CITIES
} from '../config/index.js';

// Slot extraction schema - city is the anchor, everything else is optional
const SlotsSchema = z.object({
    city: z.string().nullable(),
    type: z.string().nullable(), // Allow any food type as a string
    maxPrice: z.number().positive().nullable(),
    dietary: z.array(z.enum(['kosher', 'halal', 'vegan', 'vegetarian', 'gluten_free'])).default([]),
    spicy: z.boolean().nullable(),
    quantity: z.number().int().positive().nullable()
});

// Add a flag to indicate if the type is a valid food
export type ExtractedSlots = z.infer<typeof SlotsSchema> & { isFood?: boolean };

export interface NLURequest {
    text: string;
    language: 'he' | 'en' | 'ar';
}

export interface NLUResult {
    slots: ExtractedSlots;
    confidence: number;
    originalText: string;
    language: string;
}

export class NLUService {
    private llm = createLLMProvider();

    async extractSlots(request: NLURequest): Promise<NLUResult> {
        const { text, language } = request;

        const systemPrompt = `You are a food search assistant. Extract structured information from user queries.

Return ONLY valid JSON matching this schema:
{
  "city": string | null,
  "type": string | null,
  "maxPrice": number | null,
  "dietary": string[],
  "spicy": boolean | null,
  "quantity": number | null
}

Rules:
- CITY is the anchor - extract any location/place name accurately
- Handle Hebrew/Arabic transliteration (תל אביב → Tel Aviv, القدס → Jerusalem)
- 'type' should be a specific food, dish, or cuisine (e.g., "shawarma", "italian", "seafood").
- Extract price from "under X", "below X", "max X", "up to X" patterns
- Dietary: kosher, halal, vegan, vegetarian, gluten_free
- Spicy: true if mentioned (חריף, spicy, hot)
- Quantity: number of orders/portions
- Return null for missing information
- Do not invent or assume information`;

        const userPrompt = `Language: ${language}
User query: "${text}"

Extract the food search parameters as JSON.`;

        try {
            const result = await this.llm?.completeJSON([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ], SlotsSchema, {
                temperature: 0,
                timeout: LLM_COMPLETION_TIMEOUT_MS
            });

            if (!result) {
                throw new Error('LLM returned undefined result');
            }

            // Verify if the extracted type is a food
            const slotsWithFoodCheck: ExtractedSlots = result;
            slotsWithFoodCheck.isFood = await this.isFoodType(result.type);

            // Calculate confidence based on extracted information
            const confidence = this.calculateConfidence(slotsWithFoodCheck, text);

            return {
                slots: slotsWithFoodCheck,
                confidence,
                originalText: text,
                language
            };

        } catch (error: any) {
            console.warn('[NLU] LLM extraction failed, using fallback', error?.message);

            // Graceful fallback: simple keyword extraction
            const fallbackSlots = this.fallbackExtraction(text, language);

            return {
                slots: fallbackSlots,
                confidence: 0.3, // Low confidence for fallback
                originalText: text,
                language
            };
        }
    }

    private async isFoodType(type: string | null): Promise<boolean> {
        if (!type) return true; // No type provided, so no need to check

        // Simple heuristic check for common non-food items to save an LLM call
        if (/\b(table|car|house|chair)\b/i.test(type)) return false;

        try {
            const result = await this.llm?.complete([
                { role: 'system', content: `Is "${type}" a type of food, dish, or cuisine? Answer with a single word: 'yes' or 'no'.` }
            ], { temperature: 0, timeout: LLM_FOOD_CHECK_TIMEOUT_MS });

            return result?.toLowerCase().trim() === 'yes';
        } catch (error) {
            console.warn('[NLU] Food type verification LLM call failed', error);
            return true; // Fail open - assume it's food if the check fails
        }
    }

    private calculateConfidence(slots: ExtractedSlots, originalText: string): number {
        let score = 0.5; // Base score

        // City (anchor) is most important
        if (slots.city?.trim()) score += 0.4;

        // Additional information increases confidence
        if (slots.type) score += 0.1;
        if (slots.maxPrice) score += 0.1;
        if (slots.dietary.length > 0) score += 0.05;
        if (slots.spicy !== null) score += 0.05;
        if (slots.quantity) score += 0.05;

        // Longer, more specific text tends to be more confident
        if (originalText.length > 20) score += 0.1;
        if (originalText.length > 50) score += 0.1;

        return Math.min(1.0, score);
    }

    private fallbackExtraction(text: string, language: string): ExtractedSlots {
        const lowerText = text.toLowerCase();

        // Simple city extraction - look for common patterns
        let city: string | null = null;

        // Hebrew cities
        for (const heCity of FALLBACK_HEBREW_CITIES) {
            if (text.includes(heCity)) {
                city = heCity;
                break;
            }
        }

        if (!city) {
            for (const enCity of FALLBACK_ENGLISH_CITIES) {
                if (lowerText.includes(enCity)) {
                    city = enCity;
                    break;
                }
            }
        }

        // Heuristic transliteration/typo corrections
        if (!city) {
            if (/tel\s?aviv|תלאביב|ת"א/.test(lowerText)) city = 'Tel Aviv';
            if (/אשלקון|אשקלון|ashkelon/.test(lowerText)) city = city || 'Ashkelon';
            if (/jerusalem|al\s?quds|القدس|ירושלימ/.test(lowerText)) city = city || 'Jerusalem';
        }

        // Simple type extraction
        let type: ExtractedSlots['type'] = null;
        if (lowerText.includes('pizza') || lowerText.includes('פיצה')) type = 'pizza';
        else if (lowerText.includes('sushi') || lowerText.includes('סושי')) type = 'sushi';
        else if (lowerText.includes('burger') || lowerText.includes('המבורגר')) type = 'burger';
        else if (lowerText.includes('shawarma') || lowerText.includes('שווארמה')) type = 'shawarma';

        // Simple price extraction
        let maxPrice: number | null = null;
        const priceMatch = text.match(/(?:under|below|max|up to|עד)\s*(\d+)/i);
        if (priceMatch?.[1]) {
            maxPrice = parseInt(priceMatch[1], 10);
        }

        return {
            city,
            type,
            maxPrice,
            dietary: [],
            spicy: null,
            quantity: null
        };
    }
}

// Export singleton instance
export const nluService = new NLUService();
