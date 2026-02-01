/**
 * Pipeline Error Taxonomy
 * PROD Hardening: Standardized error classification for Route2 pipeline
 * 
 * Used for:
 * - HTTP error responses
 * - WebSocket error messages
 * - Observability/monitoring
 * - Client-side error handling
 */

/**
 * Pipeline Error Kinds (deterministic classification)
 */
export enum PipelineErrorKind {
  // Gate/Intent failures
  GATE_INVALID_INPUT = 'GATE_INVALID_INPUT',
  GATE_LLM_TIMEOUT = 'GATE_LLM_TIMEOUT',
  GATE_LLM_ERROR = 'GATE_LLM_ERROR',
  
  // Intent failures
  INTENT_LLM_TIMEOUT = 'INTENT_LLM_TIMEOUT',
  INTENT_LLM_ERROR = 'INTENT_LLM_ERROR',
  
  // Google API failures
  GOOGLE_TIMEOUT = 'GOOGLE_TIMEOUT',
  GOOGLE_QUOTA_EXCEEDED = 'GOOGLE_QUOTA_EXCEEDED',
  GOOGLE_NETWORK_ERROR = 'GOOGLE_NETWORK_ERROR',
  GOOGLE_DNS_FAIL = 'GOOGLE_DNS_FAIL',
  GOOGLE_API_ERROR = 'GOOGLE_API_ERROR',
  
  // Near-me location failures
  NEARME_NO_LOCATION = 'NEARME_NO_LOCATION',
  NEARME_INVALID_LOCATION = 'NEARME_INVALID_LOCATION',
  
  // Pipeline timeouts
  PIPELINE_TIMEOUT = 'PIPELINE_TIMEOUT',
  
  // Provider failures
  LLM_PROVIDER_UNAVAILABLE = 'LLM_PROVIDER_UNAVAILABLE',
  OPENAI_API_KEY_MISSING = 'OPENAI_API_KEY_MISSING',
  GOOGLE_API_KEY_MISSING = 'GOOGLE_API_KEY_MISSING',
  
  // Internal errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

/**
 * Map error to standardized kind
 */
export function classifyPipelineError(error: unknown, stage?: string): {
  kind: PipelineErrorKind;
  code: string;
  message: string;
} {
  if (!error) {
    return {
      kind: PipelineErrorKind.INTERNAL_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Unknown error occurred'
    };
  }

  const err = error as any;
  const errorMessage = err.message || String(error);

  // Timeout errors
  if (err.name === 'TimeoutError' || errorMessage.includes('timeout')) {
    if (stage === 'gate2' || stage === 'gate') {
      return {
        kind: PipelineErrorKind.GATE_LLM_TIMEOUT,
        code: 'GATE_LLM_TIMEOUT',
        message: 'Gate analysis timed out'
      };
    }
    if (stage === 'intent') {
      return {
        kind: PipelineErrorKind.INTENT_LLM_TIMEOUT,
        code: 'INTENT_LLM_TIMEOUT',
        message: 'Intent routing timed out'
      };
    }
    if (stage === 'google' || stage === 'google_maps') {
      return {
        kind: PipelineErrorKind.GOOGLE_TIMEOUT,
        code: 'GOOGLE_TIMEOUT',
        message: 'Google API request timed out'
      };
    }
    if (stage === 'route2_pipeline' || errorMessage.includes('route2_pipeline')) {
      return {
        kind: PipelineErrorKind.PIPELINE_TIMEOUT,
        code: 'PIPELINE_TIMEOUT',
        message: 'Pipeline exceeded maximum execution time'
      };
    }
    return {
      kind: PipelineErrorKind.PIPELINE_TIMEOUT,
      code: 'TIMEOUT',
      message: 'Request timed out'
    };
  }

  // Google API errors (from fetch-with-timeout)
  if (err.errorKind) {
    switch (err.errorKind) {
      case 'DNS_FAIL':
        return {
          kind: PipelineErrorKind.GOOGLE_DNS_FAIL,
          code: 'GOOGLE_DNS_FAIL',
          message: 'Failed to resolve Google API hostname'
        };
      case 'TIMEOUT':
        return {
          kind: PipelineErrorKind.GOOGLE_TIMEOUT,
          code: 'GOOGLE_TIMEOUT',
          message: 'Google API request timed out'
        };
      case 'NETWORK_ERROR':
        return {
          kind: PipelineErrorKind.GOOGLE_NETWORK_ERROR,
          code: 'GOOGLE_NETWORK_ERROR',
          message: 'Network error connecting to Google API'
        };
      default:
        return {
          kind: PipelineErrorKind.GOOGLE_API_ERROR,
          code: 'GOOGLE_API_ERROR',
          message: 'Google API error'
        };
    }
  }

  // Google quota/rate limit
  if (errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      kind: PipelineErrorKind.GOOGLE_QUOTA_EXCEEDED,
      code: 'GOOGLE_QUOTA_EXCEEDED',
      message: 'Google API quota exceeded'
    };
  }

  // Near-me location errors
  if (errorMessage.includes('location required') || errorMessage.includes('no location')) {
    return {
      kind: PipelineErrorKind.NEARME_NO_LOCATION,
      code: 'NEARME_NO_LOCATION',
      message: 'Location required for nearby search'
    };
  }

  // API key errors
  if (errorMessage.includes('OPENAI_API_KEY')) {
    return {
      kind: PipelineErrorKind.OPENAI_API_KEY_MISSING,
      code: 'OPENAI_API_KEY_MISSING',
      message: 'OpenAI API key not configured'
    };
  }
  if (errorMessage.includes('GOOGLE_API_KEY')) {
    return {
      kind: PipelineErrorKind.GOOGLE_API_KEY_MISSING,
      code: 'GOOGLE_API_KEY_MISSING',
      message: 'Google API key not configured'
    };
  }

  // LLM errors
  if (stage === 'gate2' || stage === 'gate') {
    return {
      kind: PipelineErrorKind.GATE_LLM_ERROR,
      code: 'GATE_LLM_ERROR',
      message: 'Gate analysis failed'
    };
  }
  if (stage === 'intent') {
    return {
      kind: PipelineErrorKind.INTENT_LLM_ERROR,
      code: 'INTENT_LLM_ERROR',
      message: 'Intent routing failed'
    };
  }

  // Parse/validation errors
  if (errorMessage.includes('parse') || errorMessage.includes('JSON')) {
    return {
      kind: PipelineErrorKind.PARSE_ERROR,
      code: 'PARSE_ERROR',
      message: 'Failed to parse response'
    };
  }
  if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    return {
      kind: PipelineErrorKind.VALIDATION_ERROR,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed'
    };
  }

  // Default: internal error
  return {
    kind: PipelineErrorKind.INTERNAL_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'An internal error occurred'
  };
}

/**
 * Check if error is retryable
 */
export function isRetryableError(kind: PipelineErrorKind): boolean {
  const retryable = new Set([
    PipelineErrorKind.GOOGLE_TIMEOUT,
    PipelineErrorKind.GOOGLE_NETWORK_ERROR,
    PipelineErrorKind.GATE_LLM_TIMEOUT,
    PipelineErrorKind.INTENT_LLM_TIMEOUT,
    PipelineErrorKind.LLM_PROVIDER_UNAVAILABLE
  ]);
  
  return retryable.has(kind);
}

/**
 * Sanitize error message for client consumption
 * Prevents provider error details from leaking to UI
 * 
 * @param kind Error kind (already classified)
 * @param rawMessage Raw error message (logged but NOT sent to client)
 * @returns User-safe error message
 */
export function sanitizeErrorMessage(kind: PipelineErrorKind, rawMessage: string): string {
  // For INTERNAL_ERROR and unclassified provider errors, use generic message
  // Raw error message is logged but NOT exposed to client
  if (kind === PipelineErrorKind.INTERNAL_ERROR ||
      kind === PipelineErrorKind.PARSE_ERROR ||
      kind === PipelineErrorKind.VALIDATION_ERROR ||
      kind === PipelineErrorKind.GATE_LLM_ERROR ||
      kind === PipelineErrorKind.INTENT_LLM_ERROR ||
      kind === PipelineErrorKind.GOOGLE_API_ERROR ||
      kind === PipelineErrorKind.LLM_PROVIDER_UNAVAILABLE) {
    return 'An internal error occurred';
  }
  
  // For specific classified errors, return the safe classified message
  // This uses the kind's standard message, not the raw error message
  const errorMap: Record<PipelineErrorKind, string> = {
    [PipelineErrorKind.GATE_LLM_TIMEOUT]: 'Gate analysis timed out',
    [PipelineErrorKind.INTENT_LLM_TIMEOUT]: 'Intent routing timed out',
    [PipelineErrorKind.GOOGLE_TIMEOUT]: 'Google API request timed out',
    [PipelineErrorKind.GOOGLE_QUOTA_EXCEEDED]: 'Google API quota exceeded',
    [PipelineErrorKind.GOOGLE_NETWORK_ERROR]: 'Network error connecting to Google API',
    [PipelineErrorKind.GOOGLE_DNS_FAIL]: 'Failed to resolve Google API hostname',
    [PipelineErrorKind.NEARME_NO_LOCATION]: 'Location required for nearby search',
    [PipelineErrorKind.NEARME_INVALID_LOCATION]: 'Invalid location provided',
    [PipelineErrorKind.PIPELINE_TIMEOUT]: 'Pipeline exceeded maximum execution time',
    [PipelineErrorKind.OPENAI_API_KEY_MISSING]: 'OpenAI API key not configured',
    [PipelineErrorKind.GOOGLE_API_KEY_MISSING]: 'Google API key not configured',
    [PipelineErrorKind.GATE_INVALID_INPUT]: 'Invalid input for gate analysis',
    // Internal errors (already handled above)
    [PipelineErrorKind.INTERNAL_ERROR]: 'An internal error occurred',
    [PipelineErrorKind.PARSE_ERROR]: 'An internal error occurred',
    [PipelineErrorKind.VALIDATION_ERROR]: 'An internal error occurred',
    [PipelineErrorKind.GATE_LLM_ERROR]: 'An internal error occurred',
    [PipelineErrorKind.INTENT_LLM_ERROR]: 'An internal error occurred',
    [PipelineErrorKind.GOOGLE_API_ERROR]: 'An internal error occurred',
    [PipelineErrorKind.LLM_PROVIDER_UNAVAILABLE]: 'An internal error occurred'
  };
  
  return errorMap[kind] || 'An internal error occurred';
}
