/**
 * Clarification Service
 * Generates clarification questions and choices when user intent is ambiguous
 * Phase 4: Fully i18n compliant
 */

import type { Clarification, ClarificationChoice, SearchParams } from '../types/search.types.js';
import type { GeocodingCandidate } from '../geocoding/geocoding.service.js';
import { getI18n } from '../../i18n/index.js';
import { normalizeLang } from '../../i18n/index.js';

export class ClarificationService {
  private i18n = getI18n();  // Phase 4: i18n support
  
  /**
   * Phase 4: Generate city clarification (i18n-driven)
   */
  generateCityClarification(
    cityQuery: string,
    candidates: GeocodingCandidate[],
    language: string = 'en'
  ): Clarification {
    const lang = normalizeLang(language);
    const question = this.i18n.t('clarification.whichCity', lang, { city: cityQuery });
    
    const choices: ClarificationChoice[] = candidates.map((candidate, index) => {
      return {
        id: `city-${index}`,
        label: candidate.displayName,
        emoji: '📍',
        constraintPatch: {
          location: candidate.coordinates
        } as Partial<SearchParams>
      };
    });

    return {
      question,
      questionHe: this.i18n.t('clarification.whichCity', 'he', { city: cityQuery }),
      questionEn: this.i18n.t('clarification.whichCity', 'en', { city: cityQuery }),
      choices
    };
  }

  /**
   * Phase 4: Generate single-token clarification (i18n-driven)
   * When user types a single ambiguous word like "חניה" (parking) or "כשר" (kosher)
   */
  generateTokenClarification(
    token: string,
    tokenType: 'parking' | 'kosher' | 'openNow' | 'glutenFree' | 'vegan' | 'delivery',
    language: string = 'en'
  ): Clarification {
    const lang = normalizeLang(language);
    const tokenKey = `clarification.token.${tokenType}`;

    const choices: ClarificationChoice[] = [
      {
        id: 'constraint',
        label: this.i18n.t(`${tokenKey}.constraintLabel`, lang),
        emoji: '✓',
        constraintPatch: this.getConstraintPatchForToken(tokenType)
      },
      {
        id: 'name',
        label: this.i18n.t(`${tokenKey}.nameLabel`, lang),
        emoji: '🔍',
        constraintPatch: {
          query: token
        } as Partial<SearchParams>
      }
    ];

    return {
      question: this.i18n.t(`${tokenKey}.question`, lang),
      questionHe: this.i18n.t(`${tokenKey}.question`, 'he'),
      questionEn: this.i18n.t(`${tokenKey}.question`, 'en'),
      choices
    };
  }
  
  /**
   * Phase 4: Get constraint patch for token type
   */
  private getConstraintPatchForToken(tokenType: string): Partial<SearchParams> {
    switch (tokenType) {
      case 'parking':
        return { filters: { mustHave: ['parking'] } } as Partial<SearchParams>;
      case 'kosher':
        return { filters: { dietary: ['kosher'] } } as Partial<SearchParams>;
      case 'openNow':
        return { filters: { openNow: true } } as Partial<SearchParams>;
      case 'glutenFree':
        return { filters: { dietary: ['gluten_free'] } } as Partial<SearchParams>;
      case 'vegan':
        return { filters: { dietary: ['vegan'] } } as Partial<SearchParams>;
      case 'delivery':
        return { filters: { mustHave: ['delivery'] } } as Partial<SearchParams>;
      default:
        return {};
    }
  }

  /**
   * Phase 4: Generate constraint clarification (i18n-driven)
   * When a constraint is mentioned without a target (e.g., just "open now" without food type)
   */
  generateConstraintClarification(
    constraint: string,
    language: string = 'en'
  ): Clarification {
    const lang = normalizeLang(language);
    const question = this.i18n.t('clarification.whatLookingFor', lang, { constraint });

    // Fixed choices for constraint clarification (labels would need i18n keys if expanded)
    const choices: ClarificationChoice[] = [
      {
        id: 'restaurant',
        label: 'Restaurant',  // Could be i18n if needed
        emoji: '🍽️',
        constraintPatch: {
          query: 'restaurant'
        } as Partial<SearchParams>
      },
      {
        id: 'cafe',
        label: 'Cafe',
        emoji: '☕',
        constraintPatch: {
          query: 'cafe'
        } as Partial<SearchParams>
      },
      {
        id: 'any',
        label: 'Any food place',
        emoji: '🍴',
        constraintPatch: {
          query: 'food'
        } as Partial<SearchParams>
      }
    ];

    return {
      question,
      questionHe: this.i18n.t('clarification.whatLookingFor', 'he', { constraint }),
      questionEn: this.i18n.t('clarification.whatLookingFor', 'en', { constraint }),
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








