export type Language = 'he' | 'en' | 'ar';

export interface ToolResult {
    name: string;
    payload: unknown;
    error?: string;
}

export interface AgentState {
    sessionId: string;
    input: string;
    language: Language;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    toolResults: ToolResult[];
    finalResponse?: string;
    traceId?: string;
}


