import { z } from "zod";

/**
 * Intent Gate Schema - Lightweight routing decision
 * 
 * Purpose: Fast (~1s) language detection, anchor extraction, and routing decision
 * Routes: CORE (fast path), FULL_LLM (needs deep analysis), ASK_CLARIFY (missing info)
 */
export const IntentGateSchema = z.object({
  language: z.enum(["he", "en", "ru", "ar", "fr", "es", "other"]),
  hasFood: z.boolean(),
  food: z.object({
    raw: z.string().nullable(),
    canonical: z.string().nullable(), // English only
  }),
  hasLocation: z.boolean(),
  location: z.object({
    raw: z.string().nullable(),
    canonical: z.string().nullable(), // Original language
    isRelative: z.boolean(), // "near me", "closest"
    requiresUserLocation: z.boolean(),
  }),
  hasModifiers: z.boolean(),
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
  route: z.enum(["CORE", "FULL_LLM", "ASK_CLARIFY"]),
  routeReason: z.string(),
});

export type IntentGateResult = z.infer<typeof IntentGateSchema>;
