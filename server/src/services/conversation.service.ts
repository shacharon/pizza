import { ChatOpenAI } from "@langchain/openai";
import { ConversationChain } from "langchain/chains";
import { ConversationTokenBufferMemory } from "langchain/memory";
import { PromptTemplate } from "@langchain/core/prompts";
import { DynamicTool } from "langchain/tools";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { NLUService } from './nlu.service.js';
import { nluPolicy } from './nlu.policy.js';
import { getRestaurantsProvider } from '../services/restaurants.provider.js';

// Session-based memory storage (in-memory for now, Redis later)
const sessionMemories = new Map<string, ConversationTokenBufferMemory>();

// Food conversation prompt template
const FOOD_CONVERSATION_PROMPT = PromptTemplate.fromTemplate(`
You are a friendly, knowledgeable food assistant helping users find great restaurants.

Your personality:
- Warm and conversational, like a local food expert
- Ask follow-up questions naturally to understand preferences
- Make suggestions based on context
- Keep the conversation flowing smoothly
- Be polite and engaging

Tools available:
- nlu_parse: Extract slots from text and return policy (search vs clarify).
- food_search: Search restaurants by city, and optional type/maxPrice.

Policy:
- Always call nlu_parse first with { "text": user text, "language": inferred or provided }.
- If the returned policy.hasAnchor is true and intent is 'search', call food_search with
  { "city", "type" (if any), "maxPrice" (if any), "language" }.
- If city is missing, ask ONE short question to get the city.
- Keep replies short and friendly; one question at a time.

Current conversation (chat_history):
{history}

User: {input}
Assistant:`);

function requireOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    return key;
}

function createLLM() {
    return new ChatOpenAI({
        apiKey: requireOpenAIKey(),
        model: "gpt-3.5-turbo",
        temperature: 0.7,
    });
}

function getSessionMemory(sessionId: string, llm: ChatOpenAI): ConversationTokenBufferMemory {
    let mem = sessionMemories.get(sessionId);
    if (!mem) {
        mem = new ConversationTokenBufferMemory({
            llm,
            memoryKey: "chat_history",
            returnMessages: true,
            maxTokenLimit: 1000,
        });
        sessionMemories.set(sessionId, mem);
    }
    return mem;
}

export class ConversationService {
    private llm = createLLM();
    private nlu = new NLUService();
    private provider = getRestaurantsProvider();

    private buildTools() {
        const nluTool = new DynamicTool({
            name: 'nlu_parse',
            description: 'Extract food query slots from user text. Input JSON: { "text": string, "language": "he|en|ar" }',
            func: async (input: string) => {
                try {
                    const { text, language } = JSON.parse(input || '{}');
                    console.log('[Tool:nlu_parse] input', { language, text });
                    const res = await this.nlu.extractSlots({ text, language: (language as 'he' | 'en' | 'ar') || 'he' });
                    const policy = nluPolicy.decide(res.slots, res.language, res.confidence);
                    console.log('[Tool:nlu_parse] result', { slots: res.slots, confidence: res.confidence, policy });
                    return JSON.stringify({ nlu: res, policy });
                } catch (e: any) {
                    console.error('[Tool:nlu_parse] error', e?.message);
                    return JSON.stringify({ error: e?.message || 'nlu_parse failed' });
                }
            }
        });

        const foodSearchTool = new DynamicTool({
            name: 'food_search',
            description: 'Search restaurants. Input JSON: { "city": string, "type"?: "pizza|sushi|burger|other", "maxPrice"?: number, "language"?: "he|en|ar" }',
            func: async (input: string) => {
                try {
                    const parsed = JSON.parse(input || '{}');
                    let { city, type, maxPrice, language } = parsed;
                    // Fallback: some agents pass a single string under "input"
                    if ((!city || typeof city !== 'string') && typeof parsed.input === 'string' && parsed.input.trim()) {
                        const text = parsed.input.trim();
                        const langGuess: 'he' | 'en' | 'ar' = /[\u0590-\u05FF]/.test(text) ? 'he' : (/[\u0600-\u06FF]/.test(text) ? 'ar' : 'en');
                        console.log('[Tool:food_search] running fallback NLU on raw input', { text, langGuess });
                        const res = await this.nlu.extractSlots({ text, language: language || langGuess });
                        city = res.slots.city || city;
                        type = res.slots.type || type;
                        if (res.slots.maxPrice != null && typeof res.slots.maxPrice === 'number') maxPrice = res.slots.maxPrice;
                        language = (language as any) || (res.language as any) || langGuess;
                    }
                    if (!city) {
                        console.warn('[Tool:food_search] missing city after fallback');
                        return JSON.stringify({ error: 'city is required' });
                    }
                    const dto: any = { city };
                    if (type) dto.type = type;
                    if (typeof maxPrice === 'number') dto.constraints = { maxPrice };
                    if (language) dto.language = language as any;
                    console.log('[Tool:food_search] dto', dto);
                    const result = await this.provider.search(dto);
                    const items = (result.restaurants || []).slice(0, 5)
                        .map(r => `${r.name} — ${r.address}${r.rating ? ` (★${r.rating})` : ''}`);
                    const out = {
                        summary: `Found ${result.restaurants.length} places. Top ${items.length}:`,
                        items,
                        nextPageToken: result.meta?.nextPageToken || null,
                        enrichedTopN: result.meta?.enrichedTopN || 0,
                        source: result.meta?.source || 'google',
                    };
                    console.log('[Tool:food_search] result meta', out);
                    return JSON.stringify(out);
                } catch (e: any) {
                    console.error('[Tool:food_search] error', e?.message);
                    return JSON.stringify({ error: e?.message || 'food_search failed' });
                }
            }
        });

        return [nluTool, foodSearchTool];
    }

    async chat(sessionId: string, userMessage: string, language: 'he' | 'en' | 'ar' = 'he'): Promise<string> {
        try {
            const tools = this.buildTools();
            const executor = await initializeAgentExecutorWithOptions(tools, this.llm, {
                agentType: 'openai-functions',
                verbose: true,
            });
            // attach memory
            (executor as any).memory = getSessionMemory(sessionId, this.llm);

            const response = await executor.call({ input: userMessage });
            console.log('[Agent] final output', response);
            return (response as any).output ?? "";
        } catch (e: any) {
            // Temporary verbose logging to diagnose failures
            console.error('[Conversation] error', {
                message: e?.message,
                name: e?.name,
                stack: e?.stack,
                cause: (e as any)?.cause,
            });
            const msg = language === 'he'
                ? 'סליחה, יש תקלה זמנית. נסה שוב.'
                : language === 'ar'
                    ? 'عذراً، هناك خلل مؤقت. حاول مرة أخرى.'
                    : 'Sorry, something went wrong. Please try again.';
            return msg;
        }
    }

    clearSession(sessionId: string): void {
        sessionMemories.delete(sessionId);
    }
}