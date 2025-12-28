/**
 * Token Detector Service
 * Detects ambiguous single-token queries that require clarification
 */

import type { SessionContext } from '../types/search.types.js';

export type TokenType = 'CONSTRAINT' | 'NAME' | 'CUISINE' | 'UNKNOWN';
export type ConstraintTokenType = 'parking' | 'kosher' | 'openNow' | 'closedNow' | 'glutenFree' | 'vegan' | 'delivery';

export interface TokenDetectionResult {
  isSingleToken: boolean;
  tokenType: TokenType;
  constraintType?: ConstraintTokenType;
  requiresClarification: boolean;
  confidence: number;
}

export class TokenDetectorService {
  // Constraint keywords in multiple languages
  private readonly CONSTRAINT_TOKENS: Record<ConstraintTokenType, string[]> = {
    parking: ['חניה', 'parking', 'parkplatz', 'موقف', 'парковка'],
    kosher: ['כשר', 'kosher', 'halal', 'حلال', 'חלאל'],
    openNow: ['פתוח', 'open', 'ouvert', 'مفتوح', 'открыто', 'offen'],
    closedNow: ['סגור', 'closed', 'fermé', 'مغلق', 'закрыто', 'geschlossen'],
    glutenFree: ['ללא גלוטן', 'gluten free', 'glutenfree', 'sans gluten', 'sin gluten'],
    vegan: ['טבעוני', 'vegan', 'végétalien', 'نباتي'],
    delivery: ['משלוח', 'delivery', 'livraison', 'توصيل', 'доставка']
  };

  // Common cuisine keywords (less ambiguous, typically don't need clarification)
  private readonly CUISINE_KEYWORDS = [
    'pizza', 'פיצה', 'sushi', 'סושי', 'burger', 'המבורגר',
    'italian', 'איטלקי', 'chinese', 'סיני', 'japanese', 'יפני',
    'mexican', 'מקסיקני', 'thai', 'תאילנדי', 'indian', 'הודי'
  ];

  /**
   * Detect if query is a single ambiguous token OR contains constraint keywords
   */
  detect(query: string, context?: SessionContext): TokenDetectionResult {
    const normalizedQuery = this.normalizeQuery(query);
    
    // Check if it's a single token
    const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
    
    // IMPORTANT: Check for constraint keywords (open/closed/etc) in ALL queries
    // This must happen BEFORE single-token check to support queries like:
    // "closed italian food in gedera" or "open pizza places"
    for (const token of tokens) {
      const constraintType = this.detectConstraintToken(token);
      if (constraintType) {
        return {
          isSingleToken: tokens.length === 1,
          tokenType: 'CONSTRAINT',
          constraintType,
          requiresClarification: false,  // No clarification needed for multi-token queries with constraints
          confidence: 0.9
        };
      }
    }
    
    if (tokens.length !== 1) {
      // Multi-token queries don't need clarification
      return {
        isSingleToken: false,
        tokenType: 'UNKNOWN',
        requiresClarification: false,
        confidence: 1.0
      };
    }

    const token = tokens[0];

    // Single token - check if it's a constraint token (redundant after loop above, but kept for clarity)
    const constraintType = this.detectConstraintToken(token);
    if (constraintType) {
      // Constraint tokens ALWAYS need clarification if no context exists
      const hasContext = this.hasContextForConstraint(context, constraintType);
      
      return {
        isSingleToken: true,
        tokenType: 'CONSTRAINT',
        constraintType,
        requiresClarification: !hasContext,  // Only clarify if no context
        confidence: 0.9
      };
    }

    // Check if it's a known cuisine
    if (this.isCuisineKeyword(token)) {
      // Cuisine keywords are usually clear enough
      return {
        isSingleToken: true,
        tokenType: 'CUISINE',
        requiresClarification: false,
        confidence: 0.8
      };
    }

    // Unknown single token - could be a name or typo
    // If there's existing context (city, previous query), it's likely a refinement
    const hasContext = Boolean(context?.previousIntent);
    
    return {
      isSingleToken: true,
      tokenType: 'UNKNOWN',
      requiresClarification: !hasContext,  // Clarify if no context
      confidence: 0.5
    };
  }

  /**
   * Detect if token matches a constraint keyword
   */
  private detectConstraintToken(token: string): ConstraintTokenType | undefined {
    const normalized = token.toLowerCase();
    
    for (const [type, keywords] of Object.entries(this.CONSTRAINT_TOKENS)) {
      if (keywords.some(keyword => normalized.includes(keyword.toLowerCase()))) {
        return type as ConstraintTokenType;
      }
    }
    
    return undefined;
  }

  /**
   * Check if token is a known cuisine keyword
   */
  private isCuisineKeyword(token: string): boolean {
    const normalized = token.toLowerCase();
    return this.CUISINE_KEYWORDS.some(keyword => 
      normalized.includes(keyword.toLowerCase())
    );
  }

  /**
   * Check if session context already provides constraint information
   */
  private hasContextForConstraint(
    context: SessionContext | undefined,
    constraintType: ConstraintTokenType
  ): boolean {
    if (!context?.previousIntent) return false;

    const prev = context.previousIntent;

    // Check if previous intent has relevant context
    switch (constraintType) {
      case 'parking':
        return Boolean(prev.filters?.mustHave?.includes('parking'));
      case 'kosher':
        return Boolean(prev.filters?.dietary?.includes('kosher'));
      case 'openNow':
        return Boolean(prev.filters?.openNow === true);
      case 'closedNow':
        return Boolean(prev.filters?.openNow === false);
      case 'glutenFree':
        return Boolean(prev.filters?.dietary?.includes('gluten_free'));
      case 'vegan':
        return Boolean(prev.filters?.dietary?.includes('vegan'));
      case 'delivery':
        return Boolean(prev.filters?.mustHave?.includes('delivery'));
      default:
        return false;
    }
  }

  /**
   * Normalize query for analysis
   */
  private normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Remove punctuation but keep letters/numbers
      .replace(/\s+/g, ' ');
  }
}












