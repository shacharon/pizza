import type { LLMProvider, Message } from '../../llm/types.js';
import { createLLMProvider } from '../../llm/factory.js';
import { TranslationService } from '../places/translation/translation.service.js';
// EXPERIMENTAL: Moved to server/experimental/ folder
// import { PlacesLangGraph } from '../places/orchestrator/places.langgraph.js';
import {
    DialogueContext,
    DialogueMessage,
    DialogueResponse,
    DialogueResponseSchema,
    PlaceItem,
    Suggestion,
    Language
} from './dialogue.types.js';

/**
 * DialogueService
 * Orchestrates conversational food search with LLM-generated suggestions
 * 
 * Flow:
 * 1. User sends message
 * 2. LLM analyzes intent and generates response + suggestions
 * 3. If search needed, call PlacesLangGraph
 * 4. Return bot message, suggestions, and results
 * 
 * Uses LLM-first approach with context awareness
 */
export class DialogueService {
    private readonly llm: LLMProvider | null;
    private readonly translationService: TranslationService;
    // EXPERIMENTAL: placesGraph removed (experimental code)
    // private readonly placesGraph: PlacesLangGraph;
    private readonly sessions: Map<string, DialogueContext>;

    // Feature flag: Use advanced two-call flow for better accuracy
    private readonly useAdvancedFlow = true; // Two-call flow for better refinement handling

    constructor() {
        this.llm = createLLMProvider();
        this.translationService = new TranslationService();
        // EXPERIMENTAL: placesGraph disabled (use /api/search endpoint instead)
        // this.placesGraph = new PlacesLangGraph();
        this.sessions = new Map();
    }

    /**
     * Handle user message and generate response
     * Main entry point for dialogue interaction
     */
    async handleMessage(
        sessionId: string,
        userMessage: string,
        userLocation?: { lat: number; lng: number }
    ): Promise<{
        botMessage: string;
        suggestions: Suggestion[];
        results: PlaceItem[];
        meta?: any;
    }> {
        console.log('[DialogueService] handleMessage', { sessionId, userMessage });

        // 1. Get or create context
        let context = this.sessions.get(sessionId);
        if (!context) {
            context = this.createContext(sessionId);
            this.sessions.set(sessionId, context);
        }

        // 2. Add user message to history
        context.messages.push({
            role: 'user',
            content: userMessage,
            timestamp: Date.now()
        });

        // 3. LLM analyzes intent and generates response
        let llmResponse: DialogueResponse & { isRefinement?: boolean };
        try {
            if (this.useAdvancedFlow) {
                llmResponse = await this.generateResponseTwoCall(context, userMessage);
            } else {
                llmResponse = await this.generateResponseSingleCall(context, userMessage);
            }
            console.log('[DialogueService] LLM response', {
                shouldSearch: llmResponse.shouldSearch,
                filters: llmResponse.filters,
                suggestionsCount: llmResponse.suggestions.length,
                isRefinement: llmResponse.isRefinement
            });
        } catch (error) {
            console.error('[DialogueService] LLM generation failed', error);
            // Fallback response
            llmResponse = this.createFallbackResponse(context);
        }

        // 4. If search needed, call Places API
        let results: PlaceItem[] = context.currentResults;
        let meta: any = undefined;

        if (llmResponse.shouldSearch) {
            try {
                // Determine query to use based on intent
                let queryToUse = userMessage;

                if (llmResponse.isRefinement && context.baseQuery) {
                    // REFINEMENT: Use previous base query
                    queryToUse = context.baseQuery;
                    console.log('[DialogueService] Refinement detected, using base query:', queryToUse);
                } else if (!llmResponse.isRefinement) {
                    // NEW SEARCH: Update base query
                    context.baseQuery = userMessage;
                    console.log('[DialogueService] New search, updating base query:', userMessage);
                }

                const searchResult = await this.executeSearch(
                    context,
                    queryToUse,
                    llmResponse.filters,
                    userLocation
                );
                results = searchResult.places;
                meta = searchResult.meta;
                context.currentResults = results;

                // Update applied filters
                if (llmResponse.filters && llmResponse.filters.length > 0) {
                    context.appliedFilters = [
                        ...context.appliedFilters,
                        ...llmResponse.filters
                    ];
                }

                console.log('[DialogueService] Search complete', {
                    resultsCount: results.length,
                    filters: context.appliedFilters
                });

                // Fix message if LLM was pessimistic but we got results
                if (results.length > 0) {
                    const pessimisticPhrases = [
                        "couldn't find",
                        "didn't find",
                        "no results",
                        "nothing found",
                        "try searching"
                    ];

                    const isPessimistic = pessimisticPhrases.some(phrase =>
                        llmResponse.text.toLowerCase().includes(phrase)
                    );

                    if (isPessimistic) {
                        // Generate optimistic message based on context
                        const foodType = llmResponse.filters?.[0] || 'food';
                        const location = this.extractLocationFromMessage(userMessage);

                        llmResponse.text = location
                            ? `Found ${results.length} ${foodType} spots in ${location}! 🍕`
                            : `Found ${results.length} great ${foodType} places! 🍕`;

                        console.log('[DialogueService] Fixed pessimistic message', {
                            newMessage: llmResponse.text
                        });
                    }
                }
            } catch (error) {
                console.error('[DialogueService] Search failed', error);

                // Clear results on error (don't show stale data)
                results = [];
                context.currentResults = [];

                // Update message to reflect error
                llmResponse.text = "Sorry, I had trouble searching. Could you try rephrasing your request?";

                console.log('[DialogueService] Cleared results due to search error');
            }
        }

        // 5. Add bot message to history
        context.messages.push({
            role: 'assistant',
            content: llmResponse.text,
            timestamp: Date.now()
        });

        // 6. Save context
        this.sessions.set(sessionId, context);

        return {
            botMessage: llmResponse.text,
            suggestions: llmResponse.suggestions,
            results,
            meta
        };
    }

    /**
     * Generate LLM response with suggestions (Single-call MVP approach)
     * Uses completeJSON for structured output
     */
    private async generateResponseSingleCall(
        context: DialogueContext,
        userMessage: string
    ): Promise<DialogueResponse> {
        if (!this.llm) {
            throw new Error('LLM not available');
        }

        // Build context summary for LLM
        const recentMessages = context.messages.slice(-6); // Last 3 exchanges
        const conversationSummary = recentMessages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');

        const systemPrompt = `You are a friendly food search assistant.

CONTEXT:
- User message: "${userMessage}"
- Applied filters: ${context.appliedFilters.length > 0 ? context.appliedFilters.join(', ') : 'none'}
- Current results: ${context.currentResults.length} places
- Conversation:
${conversationSummary}

WISDOM OF CROWDS (predict what users need):
- "date" → suggest: parking, wine, romantic, outdoor
- "quick lunch" → suggest: budget, fast, takeout
- "family" → suggest: kids menu, family-friendly, parking
- "business" → suggest: quiet, WiFi, professional

CONTEXT AWARENESS (CRITICAL):
- If user asks about filters WITHOUT specifying food (e.g., "what's open now?", "which has parking?"):
  → This is a REFINEMENT of previous search
  → Keep the same food type from previous message
  → Set filters to include the previous filters + new filter
  → Example: Previous was "pizza", user asks "open now" → filters: ["pizza", "opennow"]

- If user specifies NEW food type:
  → This is a NEW search
  → Replace filters with new food type

YOUR TASK:
1. Write friendly message (2 sentences max)
2. Create 4-6 suggestion buttons (see format below)
3. Decide if new search needed (true/false)
4. Extract filters (REMEMBER: keep previous filters if this is a refinement!)

CRITICAL: Return ONLY valid JSON. Follow this EXACT format:

{
  "text": "Found 15 pizza spots in Tel Aviv! 🍕 Any specific vibe?",
  "suggestions": [
    {"id":"parking","emoji":"🅿️","label":"Parking","action":"filter","value":"parking"},
    {"id":"romantic","emoji":"🌹","label":"Romantic","action":"filter","value":"romantic"},
    {"id":"budget","emoji":"💰","label":"Budget","action":"filter","value":"cheap"},
    {"id":"outdoor","emoji":"🌟","label":"Outdoor","action":"filter","value":"outdoor"}
  ],
  "shouldSearch": true,
  "filters": ["pizza"]
}

RULES:
- suggestions MUST be array of objects (not strings!)
- Each suggestion needs: id, emoji, label, action, value
- shouldSearch MUST be boolean (true or false)
- filters MUST be array of strings
- If refining previous search, INCLUDE previous filters!

Return ONLY the JSON. No markdown, no extra text.`;

        const userPrompt = `User message: "${userMessage}"

Analyze this message and generate your response.`;

        const messages: Message[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        const response = await this.llm.completeJSON(
            messages,
            DialogueResponseSchema,
            { temperature: 0.7 }
        );

        return DialogueResponseSchema.parse(response) as DialogueResponse;
    }

    /**
     * Execute search using PlacesLangGraph
     * Reuses existing translation and places logic
     * Handles empty queries by using context
     */
    private async executeSearch(
        context: DialogueContext,
        query: string,
        filters?: string[],
        userLocation?: { lat: number; lng: number }
    ): Promise<{ places: PlaceItem[]; meta: any }> {
        // Fix empty query by using context
        let effectiveQuery = query.trim();

        if (!effectiveQuery || effectiveQuery === '') {
            // Fallback 1: Use first filter as query
            if (filters && filters.length > 0 && filters[0]) {
                effectiveQuery = filters[0];
                console.log('[DialogueService] Empty query, using filter:', effectiveQuery);
            }
            // Fallback 2: Use previous search query from last message
            else if (context.messages.length > 0) {
                const lastUserMessage = context.messages
                    .filter(m => m.role === 'user')
                    .pop();
                if (lastUserMessage && lastUserMessage.content) {
                    effectiveQuery = lastUserMessage.content;
                    console.log('[DialogueService] Empty query, using previous message:', effectiveQuery);
                }
            }
            // Fallback 3: Use applied filters
            if (!effectiveQuery && context.appliedFilters.length > 0 && context.appliedFilters[0]) {
                effectiveQuery = context.appliedFilters[0];
                console.log('[DialogueService] Empty query, using applied filter:', effectiveQuery);
            }
            // Fallback 4: Generic search
            if (!effectiveQuery) {
                effectiveQuery = 'food';
                console.log('[DialogueService] Empty query, using generic: food');
            }
        }

        // Append refinement filters to query (e.g., "opennow", "parking")
        if (filters && filters.length > 0) {
            // Extract refinement keywords (skip food types and locations)
            const refinementKeywords = filters.filter(f => {
                const lower = f.toLowerCase();
                // Skip if it looks like food or location
                return !['המבורגר', 'המבורגרים', 'פיצה', 'סושי', 'burger', 'pizza', 'sushi'].includes(lower) &&
                    !['gedera', 'גדרה', 'tel aviv', 'תל אביב', 'haifa', 'חיפה'].includes(lower);
            });

            if (refinementKeywords.length > 0) {
                effectiveQuery += ' ' + refinementKeywords.join(' ');
                console.log('[DialogueService] Appended refinement filters to query:', refinementKeywords);
            }
        }

        console.log('[DialogueService] executeSearch', {
            originalQuery: query,
            effectiveQuery,
            filters,
            hasLocation: !!userLocation
        });

        // EXPERIMENTAL: PlacesLangGraph is disabled (experimental feature)
        // Use /api/search endpoint instead
        throw new Error('DialogueService search is experimental and disabled. Please use POST /api/search endpoint instead.');
    }

    /**
     * Create new conversation context
     */
    private createContext(sessionId: string): DialogueContext {
        return {
            sessionId,
            messages: [],
            appliedFilters: [],
            currentResults: [],
            language: 'en' // Default, will be detected by translation service
            // detectedInputLanguage will be set on first message
        };
    }

    /**
     * Fallback response when LLM fails
     */
    private createFallbackResponse(context: DialogueContext): DialogueResponse {
        const isFirstMessage = context.messages.length <= 1;

        return {
            text: isFirstMessage
                ? "I'd love to help you find a great place to eat! What are you in the mood for?"
                : "I'm here to help! Could you tell me more about what you're looking for?",
            suggestions: [
                { id: 'pizza', emoji: '🍕', label: 'Pizza', action: 'filter', value: 'pizza' },
                { id: 'burger', emoji: '🍔', label: 'Burger', action: 'filter', value: 'burger' },
                { id: 'sushi', emoji: '🍣', label: 'Sushi', action: 'filter', value: 'sushi' },
                { id: 'vegan', emoji: '🌱', label: 'Vegan', action: 'filter', value: 'vegan' }
            ],
            shouldSearch: false
        };
    }

    /**
     * Clear session (for testing/debugging)
     */
    clearSession(sessionId: string): void {
        this.sessions.delete(sessionId);
        console.log('[DialogueService] Session cleared', { sessionId });
    }

    /**
     * Get session count (for monitoring)
     */
    getSessionCount(): number {
        return this.sessions.size;
    }

    /**
     * Extract location from user message (simple heuristic)
     */
    private extractLocationFromMessage(message: string): string | null {
        const patterns = [
            /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, // "in Tel Aviv"
            /\bat\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, // "at Gedera"
            /\bnear\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i, // "near Haifa"
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }

        return null;
    }

    /**
     * Generate LLM response with suggestions (Two-call advanced approach)
     * Call 1: Analyze intent (simple, focused on search decision)
     * Call 2: Generate UI response (message + suggestions)
     * 
     * This approach is more reliable for refinement queries like "open now"
     */
    private async generateResponseTwoCall(
        context: DialogueContext,
        userMessage: string
    ): Promise<DialogueResponse & { isRefinement?: boolean }> {
        if (!this.llm) {
            throw new Error('LLM not available');
        }

        // Build conversation summary
        const recentMessages = context.messages.slice(-4); // Last 2 exchanges
        const conversationHistory = recentMessages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // OPTIMIZATION: Detect language once and cache (Step 1.1 + 1.3)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        if (!context.detectedInputLanguage) {
            // Simple heuristic: check if message contains Hebrew characters
            const hasHebrew = /[\u0590-\u05FF]/.test(userMessage);
            context.detectedInputLanguage = hasHebrew ? 'he' : 'en';
            console.log('[DialogueService] Detected input language:', context.detectedInputLanguage);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // OPTIMIZATION: Run Call 1 + Call 2 in PARALLEL (Step 1.2)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        const analysisPrompt = `Analyze this food search conversation:

CONVERSATION:
${conversationHistory}

CURRENT USER MESSAGE: "${userMessage}"

CONTEXT:
- Applied filters: ${context.appliedFilters.length > 0 ? context.appliedFilters.join(', ') : 'none'}
- Current results: ${context.currentResults.length} places

YOUR TASK:
Determine the user's intent. Answer these questions:

1. INTENT TYPE:
   A) NEW SEARCH - User wants different food or location
   B) REFINEMENT - User wants to filter/narrow existing results (e.g., "open now", "with parking")
   C) QUESTION - User is asking about results (e.g., "which is best?", "tell me more")
   D) CHAT - User is just chatting (e.g., "thanks", "ok")

2. SHOULD WE SEARCH GOOGLE?
   - NEW SEARCH → YES (need new results)
   - REFINEMENT → YES (need to re-query with filters)
   - QUESTION → NO (just answer from existing results)
   - CHAT → NO (no search needed)

3. WHAT FILTERS TO USE?
   - If NEW SEARCH: extract food type and location
   - If REFINEMENT: keep previous filters + add new ones
4. DETECTED LANGUAGE: ${context.detectedInputLanguage}

Answer in this format:
Intent: [A/B/C/D]
Reason: [brief explanation]
shouldSearch: [true/false]
filters: [list of filters, e.g., "המבורגר", "opennow"]
language: [detected language code]`;

        const analysisMessages: Message[] = [
            { role: 'system', content: 'You are an expert at understanding user intent in food search conversations.' },
            { role: 'user', content: analysisPrompt }
        ];

        const formatPrompt = `Generate a user-friendly response for a food search conversation:

USER MESSAGE: "${userMessage}"
CONVERSATION CONTEXT: ${conversationHistory}

YOUR TASK:
Generate a friendly bot response with helpful suggestions.

WISDOM OF CROWDS (suggest relevant actions):
- "date" or "romantic" → parking, wine, quiet, outdoor
- "quick" or "lunch" → budget, fast service, takeout
- "family" or "kids" → kids menu, family-friendly, spacious
- "business" or "work" → quiet, WiFi, professional
- "open now" → delivery, takeout, call
- General search → parking, price range, cuisine type

RULES:
1. Message: 1-2 friendly sentences
2. Suggestions: 4-6 relevant action buttons
3. Each suggestion needs: id, emoji, label, action, value

VALID ACTION TYPES (MUST use one of these):
- "filter" - Apply a filter (e.g., parking, vegan, romantic)
- "refine" - Refine search (e.g., cheaper, nearby)
- "info" - Get more info (e.g., call, website, hours)
- "map" - Show on map

DO NOT use: "search", "query", or any other action type!

Return ONLY valid JSON:
{
  "text": "Let me check which burger spots are open! 🍔",
  "suggestions": [
    {"id":"delivery","emoji":"🚗","label":"Delivery","action":"filter","value":"delivery"},
    {"id":"takeout","emoji":"📦","label":"Takeout","action":"filter","value":"takeout"},
    {"id":"call","emoji":"📞","label":"Call ahead","action":"info","value":"phone"},
    {"id":"map","emoji":"🗺️","label":"Show on map","action":"map"}
  ],
  "shouldSearch": true,
  "filters": ["המבורגר", "opennow"]
}`;

        const formatMessages: Message[] = [
            { role: 'system', content: 'You generate structured JSON responses for food search UI.' },
            { role: 'user', content: formatPrompt }
        ];

        // Run both LLM calls in PARALLEL
        const [analysis, response] = await Promise.all([
            this.llm.complete(analysisMessages, { temperature: 0.3 }),
            this.llm.completeJSON(formatMessages, DialogueResponseSchema, { temperature: 0.7 })
        ]);

        console.log('[DialogueService] Call 1 - Intent Analysis:', analysis.substring(0, 300));

        const parsed = DialogueResponseSchema.parse(response) as DialogueResponse;

        // Parse intent from Call 1 analysis
        const isRefinement = analysis.includes('Intent: B') ||
            analysis.toLowerCase().includes('refinement');

        console.log('[DialogueService] Call 2 - UI Response:', {
            shouldSearch: parsed.shouldSearch,
            filters: parsed.filters,
            suggestionsCount: parsed.suggestions.length,
            isRefinement
        });

        return {
            ...parsed,
            isRefinement
        };
    }
}

