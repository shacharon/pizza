export type ChatRoleDTO = "user" | "assistant" | "system" | "tool";

export interface ChatMessageDTO {
    id?: string;           // אופציונלי לזיהוי בצד ה-UI
    role: ChatRoleDTO;
    content: string;       // טקסט ההודעה
    timestamp?: string;    // ISO string
    meta?: Record<string, unknown>; // הרחבות קלות (לא דומיין)
}
