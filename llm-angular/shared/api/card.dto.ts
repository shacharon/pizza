import { z } from "zod";

export const CardDTOZ = z.object({
    title: z.string().min(1).max(140),
    subtitle: z.string().max(200).optional(),
    url: z.string().url(),
    source: z.string().max(80).optional(),
    imageUrl: z.string().url().optional()
});
export type CardDTO = z.infer<typeof CardDTOZ>;


