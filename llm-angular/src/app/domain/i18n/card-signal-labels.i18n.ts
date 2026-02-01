/**
 * Card Signal Labels i18n Module
 * Comprehensive translations for all card signals
 * 
 * Supported languages: en, he, fr, es, ru, ar, it, ja
 * 
 * Used for:
 * - Card badges (OPEN_NOW, CLOSED_NOW, PRICE, NEARBY, etc.)
 * - Intent match labels (breakfast, lunch, dinner, etc.)
 * - Distance labels (very_close, nearby, etc.)
 */

import { CardSignalType } from '../types/search.types';

export type SignalLang = 'he' | 'en' | 'fr' | 'es' | 'ru' | 'ar' | 'it' | 'ja';

/**
 * Card Signal Labels (priority-based badges)
 */
export const CARD_SIGNAL_LABELS: Record<CardSignalType, Record<SignalLang, string>> = {
  OPEN_NOW: {
    he: 'פתוח עכשיו',
    en: 'Open now',
    fr: 'Ouvert maintenant',
    es: 'Abierto ahora',
    ru: 'Открыто сейчас',
    ar: 'مفتوح الآن',
    it: 'Aperto ora',
    ja: '営業中'
  },
  
  CLOSED_NOW: {
    he: 'סגור עכשיו',
    en: 'Closed now',
    fr: 'Fermé',
    es: 'Cerrado',
    ru: 'Закрыто',
    ar: 'مغلق',
    it: 'Chiuso',
    ja: '閉店'
  },
  
  PRICE_CHEAP: {
    he: 'זול',
    en: 'Cheap',
    fr: 'Bon marché',
    es: 'Económico',
    ru: 'Недорого',
    ar: 'رخيص',
    it: 'Economico',
    ja: '安い'
  },
  
  PRICE_MID: {
    he: 'בינוני',
    en: 'Mid-price',
    fr: 'Prix moyen',
    es: 'Precio medio',
    ru: 'Средняя цена',
    ar: 'سعر متوسط',
    it: 'Prezzo medio',
    ja: '中価格'
  },
  
  PRICE_EXPENSIVE: {
    he: 'יקר',
    en: 'Expensive',
    fr: 'Cher',
    es: 'Caro',
    ru: 'Дорого',
    ar: 'غالي',
    it: 'Costoso',
    ja: '高い'
  },
  
  NEARBY: {
    he: 'קרוב',
    en: 'Nearby',
    fr: 'Proche',
    es: 'Cercano',
    ru: 'Рядом',
    ar: 'قريب',
    it: 'Vicino',
    ja: '近い'
  },
  
  INTENT_MATCH: {
    he: 'מתאים',
    en: 'Good match',
    fr: 'Bonne option',
    es: 'Buena opción',
    ru: 'Подходит',
    ar: 'تطابق جيد',
    it: 'Buona opzione',
    ja: '最適'
  },
  
  POPULAR: {
    he: 'פופולרי',
    en: 'Popular',
    fr: 'Populaire',
    es: 'Popular',
    ru: 'Популярно',
    ar: 'شائع',
    it: 'Popolare',
    ja: '人気'
  }
};

/**
 * Get signal label for card badge
 */
export function getSignalLabel(signalType: CardSignalType, language: SignalLang = 'en'): string {
  const labels = CARD_SIGNAL_LABELS[signalType];
  return labels?.[language] || labels?.en || signalType;
}

/**
 * Normalize language code to SignalLang
 */
export function normalizeSignalLang(langCode: string | undefined): SignalLang {
  if (!langCode) return 'en';

  const normalized = langCode.toLowerCase().substring(0, 2);

  switch (normalized) {
    case 'he':
    case 'iw':
      return 'he';
    case 'en':
      return 'en';
    case 'ru':
      return 'ru';
    case 'ar':
      return 'ar';
    case 'fr':
      return 'fr';
    case 'es':
      return 'es';
    case 'it':
      return 'it';
    case 'ja':
      return 'ja';
    default:
      return 'en';
  }
}
