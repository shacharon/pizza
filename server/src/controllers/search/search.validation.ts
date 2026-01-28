/**
 * Search Request Validation
 * Validates and parses search requests
 */

import type { Request } from 'express';
import { safeParseSearchRequest } from '../../services/search/types/search-request.dto.js';
import { createSearchError } from '../../services/search/types/search-response.dto.js';

export interface ValidationResult {
  success: boolean;
  data?: any;
  error?: any;
}

/**
 * Validate search request body
 */
export function validateSearchRequest(req: Request): ValidationResult {
  const validation = safeParseSearchRequest(req.body);
  if (!validation.success || !validation.data) {
    return {
      success: false,
      error: createSearchError('Invalid request', 'VALIDATION_ERROR', validation.error)
    };
  }
  return {
    success: true,
    data: validation.data
  };
}

/**
 * Extract and validate requestId from route params
 */
export function validateRequestIdParam(req: Request): { valid: boolean; requestId?: string } {
  const requestIdParam = req.params.requestId;
  if (!requestIdParam) {
    return { valid: false };
  }
  
  // Ensure requestId is a string (not an array)
  const requestId = Array.isArray(requestIdParam) ? requestIdParam[0] : requestIdParam;
  if (!requestId) {
    return { valid: false };
  }
  
  return { valid: true, requestId };
}
