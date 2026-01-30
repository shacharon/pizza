/**
 * Job Store Interface - Storage Abstraction
 * Allows switching between InMemory and Redis implementations
 */

export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE_SUCCESS' | 'DONE_CLARIFY' | 'DONE_STOPPED' | 'DONE_FAILED';

export interface SearchJob {
  requestId: string;
  sessionId: string;
  query: string;
  status: JobStatus;
  progress?: number;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    errorType?: 'LLM_TIMEOUT' | 'GATE_ERROR' | 'SEARCH_FAILED' | 'UNKNOWN';
  };
  createdAt: number;
  updatedAt: number;
  // Phase 1 Security: Ownership tracking for WebSocket authorization
  ownerUserId?: string | null;
  ownerSessionId?: string | null;
  // Idempotency: Key for deduplication (sessionId + normalizedQuery + mode + locationHash)
  idempotencyKey?: string;
  // Candidate pool: Raw Google results for local soft-filter requery
  candidatePool?: {
    candidates: any[]; // PlaceResult[] from Google Maps
    searchContext: any; // SearchContext snapshot (for requery decision)
    fetchedAt: number; // Timestamp when pool was fetched
    route: 'NEARBY' | 'TEXTSEARCH';
  };
}

export interface ISearchJobStore {
  /**
   * Create a new job
   */
  createJob(requestId: string, params: { sessionId: string; query: string; ownerUserId?: string | null; ownerSessionId?: string | null; idempotencyKey?: string }): Promise<void> | void;

  /**
   * Set job status and progress
   */
  setStatus(requestId: string, status: JobStatus, progress?: number): Promise<void> | void;

  /**
   * Store job result
   */
  setResult(requestId: string, result: unknown): Promise<void> | void;

  /**
   * Set job error with errorType for better UX
   */
  setError(requestId: string, code: string, message: string, errorType?: 'LLM_TIMEOUT' | 'GATE_ERROR' | 'SEARCH_FAILED'): Promise<void> | void;

  /**
   * Get job status and progress
   */
  getStatus(requestId: string): Promise<{ status: JobStatus; progress?: number; error?: SearchJob['error'] } | null> | { status: JobStatus; progress?: number; error?: SearchJob['error'] } | null;

  /**
   * Get job result
   */
  getResult(requestId: string): Promise<unknown | null> | unknown | null;

  /**
   * Get full job details
   */
  getJob(requestId: string): Promise<SearchJob | null> | SearchJob | null;

  /**
   * Delete a job
   */
  deleteJob(requestId: string): Promise<void> | void;

  /**
   * Find existing job by idempotency key
   * Returns job if found with status RUNNING or DONE_SUCCESS (within fresh window)
   */
  findByIdempotencyKey(idempotencyKey: string, freshWindowMs?: number): Promise<SearchJob | null> | SearchJob | null;

  /**
   * Store candidate pool for local soft-filter requery
   * IDOR Protection: Only owner (sessionId) can store/retrieve pool
   */
  setCandidatePool(requestId: string, pool: SearchJob['candidatePool']): Promise<void> | void;

  /**
   * Get candidate pool (IDOR-protected: validates sessionId ownership)
   * Returns null if not found or if requestor is not the owner
   */
  getCandidatePool(requestId: string, sessionId: string): Promise<SearchJob['candidatePool'] | null> | SearchJob['candidatePool'] | null;

  /**
   * Get all running jobs (for shutdown cleanup)
   */
  getRunningJobs(): Promise<SearchJob[]> | SearchJob[];
}
