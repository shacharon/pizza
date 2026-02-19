/**
 * Narration Templates
 * Localized UI strings for assistant narration
 * Single responsibility: Template resolution by language
 */

import type { AssistantLanguage } from '../../../services/search/route2/assistant/assistant-llm.service.js';

export class NarrationTemplates {
  /**
   * Get localized narration template (short, 1 sentence)
   * No LLM - deterministic template
   */
  getNarrationTemplate(language: AssistantLanguage): string {
    switch (language) {
      case 'he':
        return 'מחפש עכשיו… עוד רגע תוצאות.';
      case 'en':
        return 'Searching now… results in a moment.';
      case 'ru':
        return 'Ищу сейчас… результаты через мгновение.';
      case 'ar':
        return 'البحث الآن… النتائج في لحظة.';
      case 'fr':
        return 'Recherche en cours… résultats dans un instant.';
      case 'es':
        return 'Buscando ahora… resultados en un momento.';
      default:
        return 'Searching now… results in a moment.';
    }
  }

  /**
   * Get localized timeout message
   */
  getTimeoutMessage(language: AssistantLanguage): string {
    switch (language) {
      case 'he':
        return 'עדיין עובד… בדוק תוצאות למטה.';
      case 'en':
        return 'Still working… check results below.';
      case 'ru':
        return 'Всё ещё работаю… проверьте результаты ниже.';
      case 'ar':
        return 'لا يزال يعمل… تحقق من النتائج أدناه.';
      case 'fr':
        return 'Toujours en cours… vérifiez les résultats ci-dessous.';
      case 'es':
        return 'Aún trabajando… revisa los resultados abajo.';
      default:
        return 'Still working… check results below.';
    }
  }
}
