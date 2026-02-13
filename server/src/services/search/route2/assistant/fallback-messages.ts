/**
 * Fallback Messages Module
 * Deterministic fallback messages with i18n dictionaries
 */

import type { AssistantLanguage } from './language-detector.js';
import type { AssistantOutput } from './assistant-llm.service.js';

export type AssistantContext =
  | { type: 'GATE_FAIL'; reason: 'NO_FOOD' | 'UNCERTAIN_FOOD'; query: string; language: AssistantLanguage }
  | { type: 'CLARIFY'; reason: 'MISSING_LOCATION' | 'MISSING_FOOD'; query: string; language: AssistantLanguage }
  | { type: 'SUMMARY'; query: string; language: AssistantLanguage; resultCount: number; top3Names: string[]; metadata?: any; dietaryNote?: any }
  | { type: 'SEARCH_FAILED'; reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR'; query: string; language: AssistantLanguage }
  | { type: 'GENERIC_QUERY_NARRATION'; query: string; language: AssistantLanguage; resultCount: number; usedCurrentLocation: boolean };

/**
 * Fallbacks (deterministic, language-correct)
 */
export function getDeterministicFallback(
  context: AssistantContext,
  requestedLanguage: Exclude<AssistantLanguage, 'other'>
): { message: string; question: string | null; suggestedAction: AssistantOutput['suggestedAction']; blocksSearch: boolean } {
  const lang = requestedLanguage;

  const t = {
    he: {
      needLocationMsg: 'כדי לחפש מסעדות לידך אני צריך את המיקום שלך.',
      needLocationQ: 'אפשר לאשר מיקום או לכתוב עיר/אזור?',
      needFoodMsg: 'כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה.',
      needFoodQ: 'איזה אוכל את/ה מחפש/ת?',
      notFoodMsg: 'זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: "פיצה בתל אביב".',
      failedMsg: 'משהו השתבש בחיפוש. אפשר לנסות שוב?',
      genericMsg: 'חיפשתי לפי המיקום הנוכחי שלך.',
      genericQ: 'איזה סוג אוכל מעניין אותך?',
      noResults: 'לא מצאתי תוצאות. נסה להרחיב רדיוס חיפוש או להסיר סינון.',
      refine: 'יש כמה אפשרויות טובות באזור. אפשר למיין לפי מרחק או דירוג.'
    },
    en: {
      needLocationMsg: 'To search for restaurants near you, I need your location.',
      needLocationQ: 'Can you enable location or enter a city/area?',
      needFoodMsg: 'To search well, I need 2 things: what food + where.',
      needFoodQ: 'What type of food are you looking for?',
      notFoodMsg: `This doesn't look like a food/restaurant search. Try: "pizza in Tel Aviv".`,
      failedMsg: 'Something went wrong with the search. Can you try again?',
      genericMsg: 'I searched near your current location.',
      genericQ: 'What type of cuisine interests you?',
      noResults: 'No results found. Try expanding search radius or removing filters.',
      refine: 'Several good options in the area. Sort by distance or rating to refine.'
    },
    ar: {
      needLocationMsg: 'للبحث عن مطاعم قريبة منك، أحتاج إلى موقعك.',
      needLocationQ: 'هل يمكنك تفعيل الموقع أو كتابة المدينة/المنطقة؟',
      needFoodMsg: 'لتحسين البحث، أحتاج شيئين: ماذا تريد أن تأكل + أين.',
      needFoodQ: 'ما نوع الطعام الذي تبحث عنه؟',
      notFoodMsg: 'هذا لا يبدو كبحث عن طعام/مطاعم. جرّب مثلًا: "بيتزا في تل أبيب".',
      failedMsg: 'حدث خطأ أثناء البحث. هل تريد المحاولة مرة أخرى؟',
      genericMsg: 'بحثت باستخدام موقعك الحالي.',
      genericQ: 'ما نوع المطبخ الذي تفضله؟',
      noResults: 'لم أجد نتائج. جرّب توسيع نطاق البحث أو إزالة بعض الفلاتر.',
      refine: 'هناك خيارات جيدة في المنطقة. جرّب الفرز حسب المسافة أو التقييم.'
    },
    ru: {
      needLocationMsg: 'Чтобы найти рестораны рядом, мне нужно ваше местоположение.',
      needLocationQ: 'Можете включить геолокацию или указать город/район?',
      needFoodMsg: 'Для хорошего поиска нужны 2 вещи: что хотите поесть + где.',
      needFoodQ: 'Какую кухню вы ищете?',
      notFoodMsg: 'Это не похоже на поиск еды/ресторанов. Например: "пицца в Тель-Авиве".',
      failedMsg: 'Произошла ошибка при поиске. Попробовать ещё раз?',
      genericMsg: 'Я искал рядом с вашим текущим местоположением.',
      genericQ: 'Какая кухня вам интересна?',
      noResults: 'Результатов нет. Попробуйте увеличить радиус или убрать фильтры.',
      refine: 'Есть хорошие варианты рядом. Отсортируйте по расстоянию или рейтингу.'
    },
    fr: {
      needLocationMsg: 'Pour chercher des restaurants près de vous, j\'ai besoin de votre position.',
      needLocationQ: 'Pouvez-vous activer la localisation ou indiquer une ville/zone ?',
      needFoodMsg: 'Pour bien chercher, il me faut 2 choses : quoi manger + où.',
      needFoodQ: 'Quel type de cuisine cherchez-vous ?',
      notFoodMsg: 'Cela ne ressemble pas à une recherche de restaurants. Essayez : "pizza à Tel Aviv".',
      failedMsg: 'Un problème est survenu pendant la recherche. Réessayer ?',
      genericMsg: 'J\'ai cherché près de votre position actuelle.',
      genericQ: 'Quel type de cuisine vous intéresse ?',
      noResults: 'Aucun résultat. Essayez d\'élargir le rayon ou de retirer des filtres.',
      refine: 'Plusieurs bonnes options. Triez par distance ou note pour affiner.'
    },
    es: {
      needLocationMsg: 'Para buscar restaurantes cerca de ti, necesito tu ubicación.',
      needLocationQ: '¿Puedes activar la ubicación o escribir una ciudad/zona?',
      needFoodMsg: 'Para buscar bien, necesito 2 cosas: qué comida + dónde.',
      needFoodQ: '¿Qué tipo de comida buscas?',
      notFoodMsg: 'Esto no parece una búsqueda de comida/restaurantes. Prueba: "pizza en Tel Aviv".',
      failedMsg: 'Algo salió mal en la búsqueda. ¿Quieres intentarlo de nuevo?',
      genericMsg: 'Busqué cerca de tu ubicación actual.',
      genericQ: '¿Qué tipo de cocina te interesa?',
      noResults: 'No hay resultados. Prueba ampliar el radio o quitar filtros.',
      refine: 'Hay buenas opciones cerca. Ordena por distancia o valoración para afinar.'
    }
  }[lang];

  if (context.type === 'CLARIFY') {
    if (context.reason === 'MISSING_LOCATION') {
      return { message: t.needLocationMsg, question: t.needLocationQ, suggestedAction: 'ASK_LOCATION', blocksSearch: true };
    }
    return { message: t.needFoodMsg, question: t.needFoodQ, suggestedAction: 'ASK_FOOD', blocksSearch: true };
  }

  if (context.type === 'GATE_FAIL') {
    return { message: t.notFoodMsg, question: null, suggestedAction: 'RETRY', blocksSearch: true };
  }

  if (context.type === 'SEARCH_FAILED') {
    return { message: t.failedMsg, question: null, suggestedAction: 'RETRY', blocksSearch: true };
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    return { message: t.genericMsg, question: t.genericQ, suggestedAction: 'REFINE', blocksSearch: false };
  }

  // SUMMARY
  const count = (context as any).resultCount || 0;
  const metadata = (context as any).metadata || {};
  if (count === 0) return { message: t.noResults, question: null, suggestedAction: 'NONE', blocksSearch: false };

  if (metadata.openNowCount !== undefined && metadata.openNowCount < count / 2) {
    // keep it short and non-generic; still ok as fallback
    return { message: t.refine, question: null, suggestedAction: 'NONE', blocksSearch: false };
  }

  return { message: t.refine, question: null, suggestedAction: 'NONE', blocksSearch: false };
}
