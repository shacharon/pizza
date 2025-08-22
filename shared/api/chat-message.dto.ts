import { z } from "zod";

export const RoleZ = z.enum(["system", "user", "assistant", "tool"]);
export type Role = z.infer<typeof RoleZ>;

export const ChatMessageDTOZ = z.object({
    id: z.string().optional(),
    role: RoleZ,
    content: z.string(),            // ← matches your test
    timestamp: z.string().optional(), // ISO string
    // Optional legacy fields for flexibility:
    text: z.string().optional(),
    createdAt: z.string().optional(),
    toolName: z.string().optional(),
});
export type ChatMessageDTO = z.infer<typeof ChatMessageDTOZ>;
