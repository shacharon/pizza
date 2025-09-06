import { z } from 'zod';
import { createLLMProvider } from '../llm/factory.js';
// Removed: import { SlotsSchema, ExtractedSlots } from '../schemas.js';
import config from '../config/index.js';

// Local schema (keeps file self-contained and avoids missing module errors)
const SlotsSchema = z.object({
    city: z.string().nullable(),
    type: z.string().nullable(),
    maxPrice: z.number().positive().nullable(),
    dietary: z.array(z.enum(['kosher', 'halal', 'vegan', 'vegetarian', 'gluten_free'])).default([]),
    spicy: z.boolean().nullable(),
    quantity: z.number().int().positive().nullable()
});
export type ExtractedSlots = z.infer<typeof SlotsSchema> & { isFood?: boolean };

export type FoodIntent = 'FOOD' | 'NOT_FOOD' | 'AMBIGUOUS';
export type UserIntent = 'NEW_QUERY' | 'CORRECTION';

export interface NLURequest {
    text: string;
    language: 'he' | 'en' | 'ar';
}

export interface NLUResult {
    slots: ExtractedSlots;
    confidence: number;
    originalText: string;
    language: 'he' | 'en' | 'ar';
}

export class NLUService {
    private llm = createLLMProvider();

    async extractSlots(request: NLURequest): Promise<NLUResult> {
        const { text, language } = request;

        // Step 1: Use the fast Classifier agent to check intent
        const intent = await this.classifyQueryIntent(text);

        if (intent === 'NOT_FOOD') {
            const slots: ExtractedSlots = { city: null, type: text, maxPrice: null, dietary: [], spicy: null, quantity: null, isFood: false };
            return { slots, confidence: 0.9, originalText: text, language };
        }

        // Step 2: If intent is ambiguous or food, use the main slot extractor
        try {
            const result = await this.extractWithMainLLM(text, language);

            if (!result) throw new Error('Main LLM extractor returned undefined');

            const slotsWithFoodCheck: ExtractedSlots = result;

            if (intent === 'AMBIGUOUS' && slotsWithFoodCheck.type) {
                const cleanType = await this.extractCleanFoodType(slotsWithFoodCheck.type);
                slotsWithFoodCheck.type = cleanType;
                slotsWithFoodCheck.isFood = !!cleanType;
            } else {
                slotsWithFoodCheck.isFood = true;
            }

            const confidence = this.calculateConfidence(slotsWithFoodCheck, text);
            return { slots: slotsWithFoodCheck, confidence, originalText: text, language };

        } catch (error: any) {
            console.warn('[NLU] Main LLM extraction failed, using fallback', error?.message);
            const fallbackSlots = this.fallbackExtraction(text, language);
            return { slots: fallbackSlots, confidence: 0.3, originalText: text, language };
        }
    }

    private async extractWithMainLLM(text: string, language: 'he' | 'en' | 'ar'): Promise<ExtractedSlots | null> {
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
        const userPrompt = `Language: ${language}\nUser query: "${text}"\n\nExtract the food search parameters as JSON.`;

        const result = await this.llm?.completeJSON([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], SlotsSchema, {
            temperature: 0.18,
            timeout: config.LLM_COMPLETION_TIMEOUT_MS
        });
        // Do not set isFood to undefined; simply return the extracted slots
        return result ? (result as ExtractedSlots) : null;
    }

    /**
     * Agent 1: Classifier
     */
    private async classifyQueryIntent(text: string): Promise<FoodIntent> {
        if (!text.trim()) return 'AMBIGUOUS';

        try {
            const result = await this.llm?.complete([
                { role: 'system', content: `Is the user's request about food? Answer with a single word: FOOD, NOT_FOOD, or AMBIGUOUS.` },
                { role: 'user', content: text }
            ], {
                temperature: 0.18,
                timeout: config.LLM_FOOD_CHECK_TIMEOUT_MS,
                model: config.NLU_CLASSIFIER_MODEL
            });

            const classification = result?.trim().toUpperCase();
            if (classification === 'FOOD' || classification === 'NOT_FOOD') {
                return classification as FoodIntent;
            }
            return 'AMBIGUOUS';
        } catch (error) {
            console.warn('[NLU] Food classification agent failed', error);
            return 'AMBIGUOUS'; // Fail open
        }
    }

    /**
     * Agent 0: Intent Router (simple)
     */
    async routeIntent(userQuery: string, lastAssistantResponse: string): Promise<UserIntent> {
        if (!lastAssistantResponse) return 'NEW_QUERY';

        const prompt = `Based on the conversation, is the user making a new query or correcting the assistant's last response?
        
Assistant's last response: "${lastAssistantResponse}"
User's new query: "${userQuery}"

Answer with a single word: NEW_QUERY or CORRECTION.`;

        try {
            const result = await this.llm?.complete(
                [{ role: 'user', content: prompt }],
                { model: config.NLU_CLASSIFIER_MODEL, temperature: 0.18, timeout: config.LLM_FOOD_CHECK_TIMEOUT_MS }
            );
            const intent = result?.trim().toUpperCase();
            if (intent === 'CORRECTION') {
                return 'CORRECTION';
            }
            return 'NEW_QUERY';
        } catch (error) {
            console.warn('[NLU] Intent routing agent failed', error);
            return 'NEW_QUERY';
        }
    }

    /**
     * Correction Handler Agent
     * Given a user's correction, it identifies what field they are changing.
     */
    async extractCorrection(userCorrection: string, previousSlots: ExtractedSlots): Promise<Partial<ExtractedSlots>> {
        const prompt = `The user is correcting their last food search. Based on their correction, what is changing?
        
        PREVIOUS SEARCH:
        - City: ${previousSlots.city || 'Not set'}
        - Food Type: ${previousSlots.type || 'Not set'}
        - Max Price: ${previousSlots.maxPrice || 'Not set'}

        USER'S CORRECTION: "${userCorrection}"

        Respond with ONLY a JSON object indicating the change. For example:
        {"city": "new city"} or {"type": "new food type"}`;

        try {
            // Using the high-quality model for this complex extraction
            const CorrectionSchema = SlotsSchema.pick({ city: true, type: true, maxPrice: true }).partial();
            const result = await this.llm?.completeJSON(
                [{ role: 'user', content: prompt }],
                CorrectionSchema,
                { temperature: 0.18 }
            );
            // Clean undefined properties to satisfy exactOptionalPropertyTypes
            const cleaned: Partial<ExtractedSlots> = {};
            if (result) {
                if (result.city !== undefined) cleaned.city = result.city;
                if (result.type !== undefined) cleaned.type = result.type;
                if (result.maxPrice !== undefined) cleaned.maxPrice = result.maxPrice;
            }
            return cleaned;
        } catch (error) {
            console.warn('[NLU] Correction extraction agent failed', error);
            return {}; // Return no changes if it fails
        }
    }

    /**
     * Agent 2: Extractor
     */
    private async extractCleanFoodType(text: string): Promise<string | null> {
        try {
            const result = await this.llm?.complete([
                { role: 'system', content: `What is the primary food, dish, or cuisine in the user's query? Correct typos. If no food is mentioned, respond with "None".` },
                { role: 'user', content: text }
            ], {
                temperature: 0.18,
                timeout: config.LLM_COMPLETION_TIMEOUT_MS,
                model: config.NLU_EXTRACTOR_MODEL
            });

            const foodType = result?.trim();
            if (foodType && foodType.toLowerCase() !== 'none') {
                return foodType;
            }
            return null;
        } catch (error) {
            console.warn('[NLU] Food extraction agent failed', error);
            return null;
        }
    }

    // Confidence + fallback unchanged...
    private calculateConfidence(slots: ExtractedSlots, originalText: string): number {
        let score = 0.5;
        if (slots.city?.trim()) score += 0.4;
        if (slots.type) score += 0.1;
        if (slots.maxPrice) score += 0.1;
        if (slots.dietary.length > 0) score += 0.05;
        if (slots.spicy !== null) score += 0.05;
        if (slots.quantity) score += 0.05;
        if (originalText.length > 20) score += 0.1;
        if (originalText.length > 50) score += 0.1;
        return Math.min(1.0, score);
    }

    private fallbackExtraction(text: string, language: string): ExtractedSlots {
        const lowerText = text.toLowerCase();
        let city: string | null = null;
        for (const heCity of config.FALLBACK_HEBREW_CITIES) {
            if (text.includes(heCity)) { city = heCity; break; }
        }
        if (!city) {
            for (const enCity of config.FALLBACK_ENGLISH_CITIES) {
                if (lowerText.includes(enCity)) { city = enCity; break; }
            }
        }
        if (!city) {
            if (/tel\s?aviv|תלאביב|ת"א/.test(lowerText)) city = 'Tel Aviv';
            if (/אשלקון|אשקלון|ashkelon/.test(lowerText)) city = city || 'Ashkelon';
            if (/jerusalem|al\s?quds|القدس|ירושלימ/.test(lowerText)) city = city || 'Jerusalem';
        }
        let type: ExtractedSlots['type'] = null;
        if (lowerText.includes('pizza') || lowerText.includes('פיצה')) type = 'pizza';
        else if (lowerText.includes('sushi') || lowerText.includes('סושי')) type = 'sushi';
        else if (lowerText.includes('burger') || lowerText.includes('המבורגר')) type = 'burger';
        else if (lowerText.includes('shawarma') || lowerText.includes('שווארמה')) type = 'shawarma';
        let maxPrice: number | null = null;
        const priceMatch = text.match(/(?:under|below|max|up to|עד)\s*(\d+)/i);
        if (priceMatch?.[1]) maxPrice = parseInt(priceMatch[1], 10);
        return { city, type, maxPrice, dietary: [], spicy: null, quantity: null };
    }
}

export const nluService = new NLUService();
