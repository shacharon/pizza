import type { AgentState } from './state.js';

export interface ConversationEngine {
    invoke(state: AgentState): Promise<AgentState>;
}


