/**
 * Signal Labels (i18n-ready)
 * Centralized copy for card signals in Hebrew and English
 * 
 * RULES:
 * - Short (max 2-3 words)
 * - Neutral tone
 * - No emojis
 * - No percentages or scores
 * 
 * Future: Wire to i18n service for dynamic language switching
 */

import { CardSignalType } from '../types/search.types';

export type SupportedLanguage = 'he' | 'en' | 'fr' | 'es' | 'ru' | 'ar' | 'it' | 'ja';

/**
 * Signal label map by language
 * Structure: { signalType: { language: label } }
 */
export const SIGNAL_LABELS: Record<CardSignalType, Record<SupportedLanguage, string>> = {
  // Priority 1: Open/Closed
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
  
  // Priority 2: Price
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
  
  // Priority 3: Distance
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
  
  // Priority 4: Intent match
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
  
  // Priority 5: Popularity
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
 * Extended signal labels for common intent patterns
 * Used when matchReason is available
 */
export const INTENT_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  // Meal times
  breakfast: {
    he: 'טוב לארוחת בוקר',
    en: 'Good for breakfast',
    fr: 'Bon pour petit-déjeuner',
    es: 'Bueno para desayuno',
    ru: 'Подходит для завтрака',
    ar: 'مناسب للإفطار',
    it: 'Buono per colazione',
    ja: '朝食に最適'
  },
  
  lunch: {
    he: 'טוב לארוחת צהריים',
    en: 'Good for lunch',
    fr: 'Bon pour déjeuner',
    es: 'Bueno para almuerzo',
    ru: 'Подходит для обеда',
    ar: 'مناسب للغداء',
    it: 'Buono per pranzo',
    ja: '昼食に最適'
  },
  
  dinner: {
    he: 'טוב לארוחת ערב',
    en: 'Good for dinner',
    fr: 'Bon pour dîner',
    es: 'Bueno para cena',
    ru: 'Подходит для ужина',
    ar: 'مناسب للعشاء',
    it: 'Buono per cena',
    ja: '夕食に最適'
  },
  
  brunch: {
    he: 'טוב לברנץ\'',
    en: 'Good for brunch',
    fr: 'Bon pour brunch',
    es: 'Bueno para brunch',
    ru: 'Подходит для бранча',
    ar: 'مناسب للبرانش',
    it: 'Buono per brunch',
    ja: 'ブランチに最適'
  },
  
  // Occasions
  date: {
    he: 'רומנטי',
    en: 'Romantic',
    fr: 'Romantique',
    es: 'Romántico',
    ru: 'Романтично',
    ar: 'رومانسي',
    it: 'Romantico',
    ja: 'ロマンチック'
  },
  
  family: {
    he: 'משפחתי',
    en: 'Family-friendly',
    fr: 'Familial',
    es: 'Familiar',
    ru: 'Семейный',
    ar: 'عائلي',
    it: 'Per famiglie',
    ja: '家族向け'
  },
  
  group: {
    he: 'טוב לקבוצות',
    en: 'Good for groups',
    fr: 'Bon pour groupes',
    es: 'Bueno para grupos',
    ru: 'Для групп',
    ar: 'مناسب للمجموعات',
    it: 'Buono per gruppi',
    ja: 'グループ向け'
  },
  
  business: {
    he: 'עסקי',
    en: 'Business dining',
    fr: 'Affaires',
    es: 'De negocios',
    ru: 'Деловой',
    ar: 'عمل',
    it: 'Business',
    ja: 'ビジネス'
  },
  
  // Atmosphere
  casual: {
    he: 'נינוח',
    en: 'Casual',
    fr: 'Décontracté',
    es: 'Casual',
    ru: 'Повседневный',
    ar: 'غير رسمي',
    it: 'Informale',
    ja: 'カジュアル'
  },
  
  fancy: {
    he: 'מפואר',
    en: 'Fine dining',
    fr: 'Gastronomique',
    es: 'Elegante',
    ru: 'Изысканный',
    ar: 'راقي',
    it: 'Raffinato',
    ja: '高級'
  },
  
  cozy: {
    he: 'אינטימי',
    en: 'Cozy',
    fr: 'Confortable',
    es: 'Acogedor',
    ru: 'Уютный',
    ar: 'مريح',
    it: 'Accogliente',
    ja: '居心地の良い'
  },
  
  trendy: {
    he: 'טרנדי',
    en: 'Trendy',
    fr: 'Branché',
    es: 'De moda',
    ru: 'Модный',
    ar: 'عصري',
    it: 'Alla moda',
    ja: 'トレンディ'
  },
  
  // Service
  takeout: {
    he: 'טייק אווי',
    en: 'Takeout',
    fr: 'À emporter',
    es: 'Para llevar',
    ru: 'Навынос',
    ar: 'سفري',
    it: 'Da asporto',
    ja: 'テイクアウト'
  },
  
  delivery: {
    he: 'משלוחים',
    en: 'Delivery',
    fr: 'Livraison',
    es: 'A domicilio',
    ru: 'Доставка',
    ar: 'توصيل',
    it: 'Consegna',
    ja: '配達'
  },
  
  outdoor: {
    he: 'ישיבה בחוץ',
    en: 'Outdoor seating',
    fr: 'Terrasse',
    es: 'Terraza',
    ru: 'Открытая веранда',
    ar: 'جلسات خارجية',
    it: 'Posti all\'aperto',
    ja: '屋外席'
  },
  
  // Quality
  highly_rated: {
    he: 'מדורג גבוה',
    en: 'Highly rated',
    fr: 'Très bien noté',
    es: 'Muy valorado',
    ru: 'Высокий рейтинг',
    ar: 'تقييم عالي',
    it: 'Altamente valutato',
    ja: '高評価'
  },
  
  popular: {
    he: 'פופולרי',
    en: 'Popular',
    fr: 'Populaire',
    es: 'Popular',
    ru: 'Популярный',
    ar: 'مشهور',
    it: 'Popolare',
    ja: '人気'
  },
  
  hidden_gem: {
    he: 'אבן חן מוסתרת',
    en: 'Hidden gem',
    fr: 'Perle cachée',
    es: 'Joya escondida',
    ru: 'Скрытая жемчужина',
    ar: 'جوهرة مخفية',
    it: 'Gemma nascosta',
    ja: '隠れた名店'
  }
};

/**
 * Distance labels (for future use)
 * Currently using NEARBY only, but prepared for distance ranges
 */
export const DISTANCE_LABELS: Record<string, Record<SupportedLanguage, string>> = {
  very_close: {
    he: 'קרוב מאוד',
    en: 'Very close',
    fr: 'Très proche',
    es: 'Muy cerca',
    ru: 'Очень близко',
    ar: 'قريب جداً',
    it: 'Molto vicino',
    ja: '非常に近い'
  },
  
  nearby: {
    he: 'קרוב',
    en: 'Nearby',
    fr: 'Proche',
    es: 'Cerca',
    ru: 'Рядом',
    ar: 'قريب',
    it: 'Vicino',
    ja: '近く'
  },
  
  walkable: {
    he: 'הליכה קצרה',
    en: 'Short walk',
    fr: 'Courte marche',
    es: 'Corta caminata',
    ru: 'Короткая прогулка',
    ar: 'مسافة قصيرة سيراً',
    it: 'Breve passeggiata',
    ja: '徒歩圏内'
  },
  
  moderate: {
    he: 'מרחק בינוני',
    en: 'Moderate distance',
    fr: 'Distance modérée',
    es: 'Distancia moderada',
    ru: 'Среднее расстояние',
    ar: 'مسافة متوسطة',
    it: 'Distanza moderata',
    ja: '中距離'
  },
  
  far: {
    he: 'רחוק',
    en: 'Far',
    fr: 'Loin',
    es: 'Lejos',
    ru: 'Далеко',
    ar: 'بعيد',
    it: 'Lontano',
    ja: '遠い'
  }
};

/**
 * Get label for signal type in specified language
 * Falls back to English if language not found
 * 
 * @param signalType - Signal type to get label for
 * @param language - Language code (he/en)
 * @returns Localized label
 */
export function getSignalLabel(
  signalType: CardSignalType,
  language: SupportedLanguage = 'he'
): string {
  const labels = SIGNAL_LABELS[signalType];
  return labels?.[language] || labels?.en || signalType;
}

/**
 * Get intent match label in specified language
 * Returns generic "Good match" if specific intent not found
 * 
 * @param intentKey - Intent key (e.g., "breakfast", "family")
 * @param language - Language code (he/en)
 * @returns Localized intent label
 */
export function getIntentLabel(
  intentKey: string,
  language: SupportedLanguage = 'he'
): string {
  const labels = INTENT_LABELS[intentKey.toLowerCase()];
  if (labels) {
    return labels[language] || labels.en;
  }
  
  // Fallback to generic match label
  return SIGNAL_LABELS.INTENT_MATCH[language];
}

/**
 * Get distance label in specified language
 * 
 * @param distanceKey - Distance key (e.g., "nearby", "far")
 * @param language - Language code (he/en)
 * @returns Localized distance label
 */
export function getDistanceLabel(
  distanceKey: string,
  language: SupportedLanguage = 'he'
): string {
  const labels = DISTANCE_LABELS[distanceKey.toLowerCase()];
  if (labels) {
    return labels[language] || labels.en;
  }
  
  // Fallback to nearby
  return DISTANCE_LABELS['nearby'][language];
}

/**
 * Detect language from text (simple heuristic)
 * Returns 'he' if Hebrew characters detected, 'en' otherwise
 * 
 * @param text - Text to detect language from
 * @returns Language code (he/en)
 */
export function detectLanguage(text: string): SupportedLanguage {
  const hasHebrew = /[\u0590-\u05FF]/.test(text);
  return hasHebrew ? 'he' : 'en';
}
