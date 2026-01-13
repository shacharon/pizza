import { z } from "zod";

/**
 * Full Intent Schema - Complete extraction with modifiers
 * 
 * Purpose: Deep analysis when Gate routes to FULL_LLM
 * Used when: Has modifiers, low confidence, or needs detailed extraction
 */
export const IntentFullSchema = z.object({
  language: z.enum(["he", "en", "ru", "ar", "fr", "es", "other"]),
  canonicalCategory: z.string().nullable(), // English
  locationText: z.string().nullable(), // Original language
  isRelativeLocation: z.boolean(),
  requiresUserLocation: z.boolean(),
  modifiers: z.object({
    openNow: z.boolean(),
    cheap: z.boolean(),
    glutenFree: z.boolean(),
    vegetarian: z.boolean(),
    vegan: z.boolean(),
    kosher: z.boolean(),
    delivery: z.boolean(),
    takeaway: z.boolean(),
    exclude: z.array(z.string()),
  }),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

export type IntentFullResult = z.infer<typeof IntentFullSchema>;
