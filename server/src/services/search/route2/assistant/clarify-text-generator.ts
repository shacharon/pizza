/**
 * Deterministic CLARIFY Text Generator
 * 
 * Generates localized message/question for CLARIFY scenarios
 * based on reason and assistant language (from Gate2).
 * 
 * REUSES existing translations from fallback messages (no new phrasing).
 */

export type ClarifyReason = 'MISSING_LOCATION' | 'MISSING_FOOD' | 'AMBIGUOUS';
export type AssistantLanguage = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';
export type SuggestedAction = 'ASK_LOCATION' | 'ASK_FOOD' | 'REFINE';

export interface ClarifyText {
  message: string;
  question: string;
}

/**
 * Build localized CLARIFY text deterministically
 * 
 * @param reason - Why clarification is needed
 * @param language - Assistant language (from Gate2 langCtx)
 * @returns Localized message and question
 */
export function buildClarifyText(
  reason: ClarifyReason,
  language: AssistantLanguage
): ClarifyText {
  // MISSING_LOCATION translations (reused from existing fallback)
  const MISSING_LOCATION_TEXT: Record<AssistantLanguage, ClarifyText> = {
    he: {
      message: 'כדי לחפש מסעדות קרובות אני צריך את המיקום שלך.',
      question: 'באיזו עיר אתה נמצא (או תשתף מיקום)?'
    },
    en: {
      message: 'I need your location to find places near you.',
      question: 'What city are you in (or can you share location)?'
    },
    ar: {
      message: 'أحتاج موقعך للعثور على أماכن قريبة منك.',
      question: 'في أي مدينة أنت (أو يمكنك مشاركة الموقع)?'
    },
    ru: {
      message: 'Мне نужно ваше местоположение.',
      question: 'В каком городе вы находитесь?'
    },
    fr: {
      message: 'J\'ai besoin de votre position.',
      question: 'Dans quelle ville êtes-vous?'
    },
    es: {
      message: 'Necesito tu ubicación.',
      question: '¿En qué ciudad estás?'
    }
  };

  // MISSING_FOOD translations (deterministic fallback for food clarification)
  const MISSING_FOOD_TEXT: Record<AssistantLanguage, ClarifyText> = {
    he: {
      message: 'כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה.',
      question: 'איזה סוג אוכל אתה מחפש?'
    },
    en: {
      message: 'To search well I need 2 things: what to eat + where.',
      question: 'What type of food are you looking for?'
    },
    ar: {
      message: 'للبحث بشكل جيد، أحتاج شيئين: ماذا تأكل + أين.',
      question: 'ما نوع الطعام الذي تبحث عنه?'
    },
    ru: {
      message: 'Для хорошего поиска нужно 2 вещи: что есть + где.',
      question: 'Какой тип еды вы ищете?'
    },
    fr: {
      message: 'Pour bien chercher j\'ai besoin de 2 choses : quoi manger + où.',
      question: 'Quel type de nourriture cherchez-vous?'
    },
    es: {
      message: 'Para buscar bien necesito 2 cosas: qué comer + dónde.',
      question: '¿Qué tipo de comida buscas?'
    }
  };

  // AMBIGUOUS translations (query too vague)
  const AMBIGUOUS_TEXT: Record<AssistantLanguage, ClarifyText> = {
    he: {
      message: 'השאילתה שלך לא ברורה לי.',
      question: 'תוכל לפרט יותר?'
    },
    en: {
      message: 'Your query is not clear to me.',
      question: 'Could you provide more details?'
    },
    ar: {
      message: 'استعلامك غير واضح لي.',
      question: 'هل يمكنك تقديم المزيد من التفاصيل?'
    },
    ru: {
      message: 'Ваш запрос мне не понятен.',
      question: 'Не могли бы вы уточнить?'
    },
    fr: {
      message: 'Votre requête n\'est pas claire.',
      question: 'Pouvez-vous donner plus de détails?'
    },
    es: {
      message: 'Tu consulta no me queda clara.',
      question: '¿Podrías dar más detalles?'
    }
  };

  // Select text based on reason
  let textMap: Record<AssistantLanguage, ClarifyText>;
  switch (reason) {
    case 'MISSING_LOCATION':
      textMap = MISSING_LOCATION_TEXT;
      break;
    case 'MISSING_FOOD':
      textMap = MISSING_FOOD_TEXT;
      break;
    case 'AMBIGUOUS':
      textMap = AMBIGUOUS_TEXT;
      break;
  }

  // Return localized text (fallback to English if language not found)
  return textMap[language] || textMap['en'];
}
