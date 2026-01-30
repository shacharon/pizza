/**
 * Job Progress Milestones
 * Deterministic progress markers for search pipeline stages
 * 
 * INVARIANT: Progress is monotonic (always increases, never decreases)
 * Implementation: progress = max(currentProgress, newProgress)
 */

export const JOB_MILESTONES = {
  /** Job created and accepted */
  JOB_CREATED: 10,
  
  /** Gate stage completed (language detection, confidence check) */
  GATE_DONE: 25,
  
  /** Intent stage completed (routing decision made) */
  INTENT_DONE: 40,
  
  /** Google Places API call completed */
  GOOGLE_DONE: 60,
  
  /** Post-filtering and constraints applied */
  POST_CONSTRAINTS_DONE: 75,
  
  /** Ranking completed */
  RANKING_DONE: 90,
  
  /** Terminal state (success/failure/clarify) */
  TERMINAL: 100
} as const;

export type JobMilestone = typeof JOB_MILESTONES[keyof typeof JOB_MILESTONES];
