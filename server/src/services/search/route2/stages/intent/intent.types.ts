/**
 * INTENT Stage Types
 * Router-only stage - no extraction
 *
 * Validation rules for landmarkText:
 * - If route = LANDMARK → landmarkText must NOT be null
 * - If reason = "explicit_distance_from_me" → landmarkText must be null
 * - If route ≠ LANDMARK → landmarkText must be null
 */

import { z } from 'zod';

const base = z.object({
  route: z.enum(['TEXTSEARCH', 'NEARBY', 'LANDMARK']),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  regionCandidate: z.string().regex(/^[A-Z]{2}$/),
  regionConfidence: z.number().min(0).max(1),
  regionReason: z.string().min(1),
  cityText: z.string().min(1).nullable().optional(),
  landmarkText: z.string().min(1).nullable().optional(),
  radiusMeters: z.number().int().min(1).max(50000).nullable().optional()
}).strict();

export const IntentLLMSchema = base.superRefine((data, ctx) => {
  const landmark = data.landmarkText;
  if (data.route === 'LANDMARK') {
    if (landmark == null || landmark === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'route=LANDMARK requires landmarkText to be non-null',
        path: ['landmarkText']
      });
    }
  } else {
    if (landmark != null && landmark !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'landmarkText must be null when route is not LANDMARK',
        path: ['landmarkText']
      });
    }
  }
  if (data.reason === 'explicit_distance_from_me' && landmark != null && landmark !== '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'reason=explicit_distance_from_me requires landmarkText to be null',
      path: ['landmarkText']
    });
  }
});

export type IntentLLM = z.infer<typeof base>;
