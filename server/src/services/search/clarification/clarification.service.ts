/**
 * Clarification Service
 * Generates clarification questions and choices when user intent is ambiguous
 */

import type { Clarification, ClarificationChoice, SearchParams } from '../types/search.types.js';
import type { GeocodingCandidate } from '../geocoding/geocoding.service.js';

export class ClarificationService {
  
  /**
   * Generate city clarification when geocoding returns multiple candidates
   */
  generateCityClarification(
    cityQuery: string,
    candidates: GeocodingCandidate[],
    language: string = 'en'
  ): Clarification {
    const isHebrew = language === 'he' || language === 'iw';
    
    const question = isHebrew
      ? `איזו "${cityQuery}" התכוונת?`
      : `Which "${cityQuery}" did you mean?`;
    
    const choices: ClarificationChoice[] = candidates.map((candidate, index) => {
      return {
        id: `city-${index}`,
        label: candidate.displayName,
        emoji: '📍',
        constraintPatch: {
          location: {
            city: candidate.name,
            coords: candidate.coordinates,
          }
        } as Partial<SearchParams>
      };
    });

    return {
      question,
      questionHe: isHebrew ? question : `איזו "${cityQuery}" התכוונת?`,
      questionEn: isHebrew ? `Which "${cityQuery}" did you mean?` : question,
      choices
    };
  }

  /**
   * Generate single-token clarification
   * When user types a single ambiguous word like "חניה" (parking) or "כשר" (kosher)
   */
  generateTokenClarification(
    token: string,
    tokenType: 'parking' | 'kosher' | 'openNow' | 'glutenFree' | 'vegan' | 'delivery',
    language: string = 'en'
  ): Clarification {
    const isHebrew = language === 'he' || language === 'iw';

    const templates = this.getTokenTemplates(tokenType, isHebrew);

    const choices: ClarificationChoice[] = [
      {
        id: 'constraint',
        label: templates.constraintLabel,
        emoji: templates.constraintEmoji,
        constraintPatch: templates.constraintPatch
      },
      {
        id: 'name',
        label: templates.nameLabel,
        emoji: '🔍',
        constraintPatch: {
          query: token
        } as Partial<SearchParams>
      }
    ];

    return {
      question: templates.question,
      questionHe: templates.questionHe,
      questionEn: templates.questionEn,
      choices
    };
  }

  /**
   * Generate constraint clarification
   * When a constraint is mentioned without a target (e.g., just "open now" without food type)
   */
  generateConstraintClarification(
    constraint: string,
    language: string = 'en'
  ): Clarification {
    const isHebrew = language === 'he' || language === 'iw';

    const question = isHebrew
      ? `מה אתה מחפש עם ${constraint}?`
      : `What are you looking for with ${constraint}?`;

    const choices: ClarificationChoice[] = [
      {
        id: 'restaurant',
        label: isHebrew ? 'מסעדה' : 'Restaurant',
        emoji: '🍽️',
        constraintPatch: {
          query: 'restaurant'
        } as Partial<SearchParams>
      },
      {
        id: 'cafe',
        label: isHebrew ? 'בית קפה' : 'Cafe',
        emoji: '☕',
        constraintPatch: {
          query: 'cafe'
        } as Partial<SearchParams>
      },
      {
        id: 'any',
        label: isHebrew ? 'כל מקום אוכל' : 'Any food place',
        emoji: '🍴',
        constraintPatch: {
          query: 'food'
        } as Partial<SearchParams>
      }
    ];

    return {
      question,
      questionHe: isHebrew ? question : `מה אתה מחפש עם ${constraint}?`,
      questionEn: isHebrew ? `What are you looking for with ${constraint}?` : question,
      choices
    };
  }

  /**
   * Get token-specific templates
   */
  private getTokenTemplates(
    tokenType: string,
    isHebrew: boolean
  ): {
    question: string;
    questionHe: string;
    questionEn: string;
    constraintLabel: string;
    constraintEmoji: string;
    nameLabel: string;
    constraintPatch: Partial<SearchParams>;
  } {
    const templates: Record<string, any> = {
      parking: {
        questionHe: 'מחפש מסעדה עם חניה?',
        questionEn: 'Looking for a restaurant with parking?',
        constraintLabel: isHebrew ? 'כן, עם חניה' : 'Yes, with parking',
        constraintEmoji: '🅿️',
        nameLabel: isHebrew ? 'לא, זה שם המסעדה' : 'No, it\'s the restaurant name',
        constraintPatch: {
          filters: { mustHave: ['parking'] }
        } as Partial<SearchParams>
      },
      kosher: {
        questionHe: 'מחפש מסעדה כשרה?',
        questionEn: 'Looking for a kosher restaurant?',
        constraintLabel: isHebrew ? 'כן, כשר' : 'Yes, kosher',
        constraintEmoji: '✡️',
        nameLabel: isHebrew ? 'לא, זה שם המסעדה' : 'No, it\'s the restaurant name',
        constraintPatch: {
          filters: { dietary: ['kosher'] }
        } as Partial<SearchParams>
      },
      openNow: {
        questionHe: 'מחפש מסעדה פתוחה עכשיו?',
        questionEn: 'Looking for a restaurant open now?',
        constraintLabel: isHebrew ? 'כן, פתוח עכשיו' : 'Yes, open now',
        constraintEmoji: '🕐',
        nameLabel: isHebrew ? 'לא, זה שם המסעדה' : 'No, it\'s the restaurant name',
        constraintPatch: {
          filters: { openNow: true }
        } as Partial<SearchParams>
      },
      glutenFree: {
        questionHe: 'מחפש מסעדה ללא גלוטן?',
        questionEn: 'Looking for gluten-free options?',
        constraintLabel: isHebrew ? 'כן, ללא גלוטן' : 'Yes, gluten-free',
        constraintEmoji: '🌾',
        nameLabel: isHebrew ? 'לא, זה שם המסעדה' : 'No, it\'s the restaurant name',
        constraintPatch: {
          filters: { dietary: ['gluten_free'] }
        } as Partial<SearchParams>
      },
      vegan: {
        questionHe: 'מחפש מסעדה טבעונית?',
        questionEn: 'Looking for vegan options?',
        constraintLabel: isHebrew ? 'כן, טבעוני' : 'Yes, vegan',
        constraintEmoji: '🌱',
        nameLabel: isHebrew ? 'לא, זה שם המסעדה' : 'No, it\'s the restaurant name',
        constraintPatch: {
          filters: { dietary: ['vegan'] }
        } as Partial<SearchParams>
      },
      delivery: {
        questionHe: 'מחפש מסעדה עם משלוח?',
        questionEn: 'Looking for delivery?',
        constraintLabel: isHebrew ? 'כן, עם משלוח' : 'Yes, with delivery',
        constraintEmoji: '🚚',
        nameLabel: isHebrew ? 'לא, זה שם המסעדה' : 'No, it\'s the restaurant name',
        constraintPatch: {
          filters: { mustHave: ['delivery'] }
        } as Partial<SearchParams>
      }
    };

    const template = templates[tokenType] || templates.parking;
    
    return {
      question: isHebrew ? template.questionHe : template.questionEn,
      questionHe: template.questionHe,
      questionEn: template.questionEn,
      constraintLabel: template.constraintLabel,
      constraintEmoji: template.constraintEmoji,
      nameLabel: template.nameLabel,
      constraintPatch: template.constraintPatch
    };
  }
}







