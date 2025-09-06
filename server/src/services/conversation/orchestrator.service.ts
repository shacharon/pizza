import config from '../../config/index.js';
import type { AgentState, Language } from './state.js';
import type { ConversationEngine } from './engine.interface.js';
import { LangGraphEngine } from './langgraph.engine.js';
// Memory will be pluggable later (in-memory or Redis). For now, we keep
// a lightweight placeholder via plain arrays on the state object.

export class ConversationOrchestrator {
    private engine: ConversationEngine;

    constructor() {
        // Select engine by config; default to langgraph for new architecture
        this.engine = new LangGraphEngine();
        if (config.CONVERSATION_ENGINE === 'legacy') {
            // Placeholder: legacy engine selection could be added here if needed
            this.engine = new LangGraphEngine();
        }
        if (config.CONVERSATION_ENGINE === 'simple') {
            // Placeholder: simple NLU engine could be added here later
            this.engine = new LangGraphEngine();
        }
    }

    async chat(sessionId: string, userMessage: string, language: Language = 'he'): Promise<string> {
        const chatHistory = [] as AgentState['chatHistory'];

        const initialState: AgentState = {
            sessionId,
            input: userMessage,
            language,
            chatHistory,
            toolResults: [],
        };

        const finalState = await this.engine.invoke(initialState);
        return finalState.finalResponse || '';
    }

    clearSession(sessionId: string): void {
        // no-op for now; memory backend will be added later
    }
}


