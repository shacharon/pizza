/**
 * IdempotencyKeyGenerator
 * Generates stable idempotency keys for search request deduplication
 * 
 * Key = hash(sessionId + normalizedQuery + mode + locationHash + filters)
 * Ensures "same search" deduplicates correctly across all user-provided parameters
 */

import crypto from 'crypto';

export interface IdempotencyKeyParams {
  sessionId: string;
  query: string;
  mode: 'sync' | 'async';
  userLocation?: { lat: number; lng: number } | null;
  filters?: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  } | null;
}

export class IdempotencyKeyGenerator {
  /**
   * Generate idempotency key for deduplication
   */
  generate(params: IdempotencyKeyParams): string {
    // Normalize query: lowercase, trim, collapse whitespace
    const normalizedQuery = this.normalizeQuery(params.query);

    // Hash location if present (to handle float precision issues)
    const locationHash = this.hashLocation(params.userLocation);

    // Serialize filters (normalized and sorted for consistency)
    const filtersHash = this.serializeFilters(params.filters);

    // Combine components
    const rawKey = `${params.sessionId}:${normalizedQuery}:${params.mode}:${locationHash}:${filtersHash}`;

    // Hash for consistent length and privacy
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Normalize query: lowercase, trim, collapse whitespace
   */
  normalizeQuery(query: string): string {
    return query.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Hash location to handle float precision issues
   */
  hashLocation(userLocation?: { lat: number; lng: number } | null): string {
    if (!userLocation) {
      return 'no-location';
    }
    return `${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}`;
  }

  /**
   * Serialize filters (normalized and sorted for consistency)
   */
  serializeFilters(filters?: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  } | null): string {
    if (!filters) {
      return 'no-filters';
    }

    const filterParts: string[] = [];

    if (filters.openNow !== undefined) {
      filterParts.push(`openNow:${filters.openNow}`);
    }
    if (filters.priceLevel !== undefined) {
      filterParts.push(`priceLevel:${filters.priceLevel}`);
    }
    if (filters.dietary && filters.dietary.length > 0) {
      // Sort dietary array for consistent hashing
      const sortedDietary = [...filters.dietary].sort();
      filterParts.push(`dietary:${sortedDietary.join(',')}`);
    }
    if (filters.mustHave && filters.mustHave.length > 0) {
      // Sort mustHave array for consistent hashing
      const sortedMustHave = [...filters.mustHave].sort();
      filterParts.push(`mustHave:${sortedMustHave.join(',')}`);
    }

    if (filterParts.length === 0) {
      return 'no-filters';
    }

    return filterParts.join('|');
  }
}
