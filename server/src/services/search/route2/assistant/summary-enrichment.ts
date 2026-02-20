/**
 * Summary enrichment helper: build top[] and analysisMode from sorted results.
 * NO new sorting – callers pass results in final order.
 */

// Local types aligned with assistant.types (avoids module resolution in strict builds)
export interface TopCandidate {
  name: string;
  addressShort?: string;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  distanceMeters?: number;
  etaMinutes?: number;
  openNow?: boolean;
  closingTimeText?: string;
}
export type SummaryAnalysisMode = 'SCARCITY' | 'COMPARISON' | 'SATURATED';

export interface SummaryEnrichmentInput {
  name?: string | null;
  address?: string | null;
  rating?: number | null;
  userRatingsTotal?: number | null;
  priceLevel?: number | null;
  distanceMeters?: number | null;
  etaMinutes?: number | null;
  openNow?: boolean | 'UNKNOWN' | null;
  closingTimeText?: string | null;
}

export interface SummaryEnrichmentResult {
  top: TopCandidate[];
  analysisMode: SummaryAnalysisMode;
}

/**
 * Build top (max 4, first in order, skip missing name) and analysisMode from resultCount.
 * Maps only fields present on each result into TopCandidate.
 */
export function buildSummaryEnrichment(
  results: SummaryEnrichmentInput[],
  resultCount: number
): SummaryEnrichmentResult {
  const top: TopCandidate[] = results
    .filter((r) => r.name != null && String(r.name).trim() !== '')
    .slice(0, 4)
    .map((r) => {
      const c: TopCandidate = { name: r.name! };
      if (r.address != null && typeof r.address === 'string') c.addressShort = r.address;
      if (r.rating != null) c.rating = r.rating;
      if (r.userRatingsTotal != null) c.userRatingsTotal = r.userRatingsTotal;
      if (r.priceLevel != null) c.priceLevel = Math.min(4, Math.max(1, r.priceLevel)) as 1 | 2 | 3 | 4;
      if (r.distanceMeters != null) c.distanceMeters = r.distanceMeters;
      if (r.etaMinutes != null) c.etaMinutes = r.etaMinutes;
      if (r.openNow !== undefined && r.openNow !== 'UNKNOWN') c.openNow = r.openNow === true;
      if (r.closingTimeText != null) c.closingTimeText = r.closingTimeText;
      return c;
    });

  const analysisMode: SummaryAnalysisMode =
    resultCount < 5 ? 'SCARCITY' : resultCount >= 15 ? 'SATURATED' : 'COMPARISON';

  return { top, analysisMode };
}
