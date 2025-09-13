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
    quantity: z.number().int().positive().nullable(),
    address: z.string().nullable(),
    radiusKm: z.number().positive().nullable(),
    aroundMe: z.boolean().nullable()
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

        // Special-case: user might be providing only a city (e.g., after we asked for city)
        if (intent === 'NOT_FOOD') {
            const cityGuess = this.fallbackExtraction(text, language);
            if (cityGuess.city) {
                // Treat as city anchor rather than non-food; keep type null here (will be merged from memory upstream)
                const slots: ExtractedSlots = { ...cityGuess, isFood: true };
                const confidence = this.calculateConfidence(slots, text);
                return { slots, confidence, originalText: text, language };
            }
            // Otherwise truly not food
            const slots: ExtractedSlots = { city: null, type: null, maxPrice: null, dietary: [], spicy: null, quantity: null, address: null, radiusKm: null, aroundMe: null, isFood: false } as any;
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
  "quantity": number | null,
  "address": string | null,
  "radiusKm": number | null,
  "aroundMe": boolean | null
}

Rules:
- CITY or ADDRESS can be the anchor. If the user provides a specific address (street+number or venue name), return it in "address". When user says 'around me' set aroundMe=true. If a radius is mentioned (e.g., 'within 3 km', 'in 2 kilometers'), extract radiusKm as a number.
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
    async classifyQueryIntent(text: string): Promise<FoodIntent> {
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
        } catch (error: any) {
            // Downgrade noise on deliberate/transport aborts
            const name = error?.name || '';
            const msg: string = error?.message || '';
            if (!/abort/i.test(name) && !/abort/i.test(msg)) {
                console.warn('[NLU] Food classification agent failed', error);
            }
            return 'AMBIGUOUS'; // Fail open
        }
    }

    /**
     * Follow-up question generator (LLM, tiny prompt)
     * Produces ONE short leading question in the user's language, or empty string.
     */
    async generateFollowUpMessage(params: {
        language: 'he' | 'en' | 'ar';
        slots: ExtractedSlots;
        resultCount: number;
    }): Promise<string> {
        const { language, slots, resultCount } = params;
        try {
            const system = `You are a concise food assistant. Output ONE short leading question only (no preface). Max 14 words.`;
            // Minimal context to avoid long prompts; encourage practical narrowing
            const user = `Lang:${language}
City:${slots.city ?? 'null'} Type:${slots.type ?? 'null'} Price:${slots.maxPrice ?? 'null'} Results:${resultCount}
Rules:
- If city is null: ask for city or offer "near me".
- If results > 15: suggest narrowing: kosher? budget? rating? delivery? specific area?
- If results == 0: suggest change: nearby city or different cuisine or higher budget.
- Keep tone professional, practical. ONE question only in user's language.`;
            const out = await this.llm?.complete([
                { role: 'system', content: system },
                { role: 'user', content: user }
            ], { temperature: 0.35, timeout: 8_000 });
            return (out || '').trim();
        } catch {
            return '';
        }
    }

    /**
     * Evidence-only conversational reply
     * Builds a short natural response referencing ONLY provided restaurants.
     * Falls back to a deterministic template on timeout or when LLM is disabled.
     */
    async generateEvidenceReply(params: {
        language: 'he' | 'en' | 'ar';
        slots: Partial<ExtractedSlots>;
        restaurants: Array<{ name: string; address?: string | null; rating?: number | null }>;
        userQuery: string;
    }): Promise<string> {
        const { language, slots, restaurants, userQuery } = params;

        // Fallback template (no LLM or no restaurants)
        const template = () => {
            const top = restaurants.slice(0, 3);
            if (language === 'he') {
                if (top.length === 0) return 'לא מצאתי תוצאות כרגע. נרצה להרחיב את הרדיוס או לשנות סינון?';
                const lines = top.map(r => `• ${r.name}${r.address ? ` — ${r.address}` : ''}${r.rating ? ` (${r.rating.toFixed(1)}⭐)` : ''}`);
                const introParts: string[] = ['מצאתי כמה אפשרויות'];
                if (slots?.type) introParts.push(`ל${slots.type}`);
                if (slots?.dietary && (slots.dietary as any[])?.length > 0) introParts.push((slots.dietary as any[]).join(' ו'));
                if (slots?.city) introParts.push(`ב${slots.city}`);
                const intro = introParts.join(' ') + ':';
                return `${intro}\n${lines.join('\n')}\nרוצה שאסנן לפי דירוג 4.2⭐ ומעלה או להשאיר הכל?`;
            }
            // English fallback
            if (top.length === 0) return 'No results yet. Want to widen the radius or change filters?';
            const linesEn = top.map(r => `• ${r.name}${r.address ? ` — ${r.address}` : ''}${r.rating ? ` (${r.rating.toFixed(1)}⭐)` : ''}`);
            return `Found a few options:${'\n'}${linesEn.join('\n')}${'\n'}Filter by 4.2⭐+ or show all?`;
        };

        // If LLM is not configured, use template
        if (!this.llm) return template();

        try {
            const evidence = restaurants.slice(0, 6).map((r, i) => ({ id: `r${i + 1}`, name: r.name, address: r.address || undefined, rating: r.rating ?? undefined }));
            const system = `You are a concise, friendly food assistant. Write a short natural reply in ${language}.
Rules:
- Reference ONLY the evidence items by their names; do not invent venues or facts.
- 2 short lines max + ONE follow-up question.
- Tone: helpful, practical; minimal emoji.
`;
            const user = `User query: ${userQuery}
Slots: ${JSON.stringify({ type: slots?.type || null, dietary: slots?.dietary || [], city: (slots as any)?.city || null })}
Evidence restaurants (use only these names):
${JSON.stringify(evidence)}

Compose:
1) One-line intro tailored to slots (type/dietary/city if present).
2) Bullet list of 2–3 places with 5–9 words each (name + tiny reason).
3) One follow-up question (e.g., delivery/dine-in, budget, rating).
`;
            const out = await this.llm.complete([
                { role: 'system', content: system },
                { role: 'user', content: user }
            ], { temperature: 0.65, timeout: 9000 });
            return (out || '').trim() || template();
        } catch {
            return template();
        }
    }

    /**
     * Warm, single-sentence clarification question tailored to context.
     */
    async generateClarifyMessage(params: {
        language: 'he' | 'en' | 'ar';
        slots: Partial<ExtractedSlots>;
        kind: 'missing_location' | 'missing_city' | 'first_turn';
        topic?: 'type' | 'dietary' | 'toppings' | 'budget' | 'delivery' | 'openNow' | 'location';
    }): Promise<string> {
        const { language, slots, kind, topic } = params;

        const fallback = () => {
            if (language === 'he') {
                if (kind === 'first_turn') {
                    const type = (slots as any)?.type ? `ל${(slots as any).type} ` : '';
                    return `מחפש ${type}סביבך (2 ק״מ) או להקליד עיר/כתובת?`;
                }
                if (kind === 'missing_location') {
                    return 'מחפש סביבך (2 ק״מ) או להקליד עיר/כתובת?';
                }
                return 'לאיזה אזור לכוון? אפשר עיר או כתובת (למשל "מרינה אשקלון").';
            }
            // English fallback
            if (kind === 'first_turn') {
                const type = (slots as any)?.type ? `${(slots as any).type} ` : '';
                return `Should I search ${type}2 km around you, or use a city/address?`;
            }
            if (kind === 'missing_location') {
                return 'Want me to search 2 km around you or use a city/address?';
            }
            return 'Which area should I target? You can type a city or address.';
        };

        if (!this.llm) return fallback();

        try {
            const system = `You are a warm, concise assistant. Output ONE friendly follow-up line in ${language}. Max 16 words. No lists.`;
            const user = `Context: kind=${kind}, topic=${topic || 'auto'}, slots=${JSON.stringify({ type: (slots as any)?.type || null, dietary: (slots as any)?.dietary || [], city: (slots as any)?.city || null, maxPrice: (slots as any)?.maxPrice ?? null, toppings: (slots as any)?.toppings || [] })}
Goal: Ask a natural question to gently move the conversation forward on the indicated topic if provided. Avoid sounding robotic. One sentence only.`;
            const out = await this.llm.complete([
                { role: 'system', content: system },
                { role: 'user', content: user }
            ], { temperature: 0.6, timeout: 3000 });
            return (out || '').trim() || fallback();
        } catch {
            return fallback();
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
        } catch (error: any) {
            const name = error?.name || '';
            const msg: string = error?.message || '';
            if (!/abort/i.test(name) && !/abort/i.test(msg)) {
                console.warn('[NLU] Intent routing agent failed', error);
            }
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
    async extractCleanFoodType(text: string): Promise<string | null> {
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
        } catch (error: any) {
            const name = error?.name || '';
            const msg: string = error?.message || '';
            if (!/abort/i.test(name) && !/abort/i.test(msg)) {
                console.warn('[NLU] Food extraction agent failed', error);
            }
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
        return { city, type, maxPrice, dietary: [], spicy: null, quantity: null, address: null, radiusKm: null, aroundMe: null } as any;
    }
}

export const nluService = new NLUService();
