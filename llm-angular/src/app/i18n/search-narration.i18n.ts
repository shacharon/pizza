/**
 * Search Narration i18n Module
 * Provides translations for all stops, explanations, and UI messages
 * 
 * Supported languages: en, he, ru, ar, fr, es
 * Fallback: English (en)
 */

// Supported language codes
export type Lang = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other';

// All message keys in the app
export type MsgKey =
  // Search page hero
  | 'hero.title'
  | 'hero.subtitle'

  // Location status
  | 'location.using'
  | 'location.getting'
  | 'location.denied'
  | 'location.unavailable'
  | 'location.enable'

  // Search bar
  | 'search.placeholder'
  | 'search.loading'

  // Recent searches
  | 'recent.title'
  | 'recent.clearAll'

  // Error states
  | 'error.title'
  | 'error.retry'

  // Mode indicators
  | 'mode.recovery'
  | 'mode.clarify'

  // Order/ranking
  | 'order.label'
  | 'order.hybrid'
  | 'order.balanced'
  | 'order.nearby'
  | 'order.quality'
  | 'order.budget'
  | 'order.cuisine'

  // Applied filters
  | 'filter.openNow'
  | 'filter.openNowTooltip'
  | 'filter.glutenFree'
  | 'filter.glutenFreeTooltip'

  // Pagination
  | 'pagination.loadMore'

  // Pending actions
  | 'actions.pendingTitle'
  | 'actions.approve'
  | 'actions.reject'

  // Assistant status (legacy)
  | 'assistant.preparing'
  | 'assistant.unavailable'

  // WebSocket status
  | 'ws.connecting'
  | 'ws.reconnecting'
  | 'ws.connected'
  | 'ws.disconnected'

  // Results states
  | 'results.searching'
  | 'results.noResults'

  // Assistant card messages (type labels)
  | 'assistant.clarify'
  | 'assistant.summary'
  | 'assistant.gateFail'
  | 'assistant.nudgeRefine'

  // Generic messages
  | 'common.close'
  | 'common.clear'
  | 'common.retry';

// Message dictionary: all languages with all keys
export const MESSAGES: Record<Lang, Record<MsgKey, string>> = {
  // English (fallback)
  en: {
    // Hero
    'hero.title': 'Search food the way you think',
    'hero.subtitle': 'Search for food naturally, in any language. Just say what you\'re in the mood for.',

    // Location
    'location.using': '📍 Using your location',
    'location.getting': '⏳ Getting location...',
    'location.denied': '🚫 Location access denied',
    'location.unavailable': '⚠️ Location unavailable',
    'location.enable': 'Enable location for better results',

    // Search
    'search.placeholder': 'What are you hungry for?',
    'search.loading': 'Loading',

    // Recent
    'recent.title': 'Recent Searches',
    'recent.clearAll': 'Clear all',

    // Errors
    'error.title': 'Oops! Something went wrong',
    'error.retry': 'Try Again',

    // Modes
    'mode.recovery': 'Recovery mode - refining search',
    'mode.clarify': 'Need more info',

    // Order
    'order.label': 'Order:',
    'order.hybrid': 'Hybrid',
    'order.balanced': 'Balanced',
    'order.nearby': 'Nearby',
    'order.quality': 'Quality',
    'order.budget': 'Budget',
    'order.cuisine': 'Cuisine',

    // Filters
    'filter.openNow': '🟢 Open now',
    'filter.openNowTooltip': 'Showing only restaurants open now',
    'filter.glutenFree': 'Gluten-free (signals)',
    'filter.glutenFreeTooltip': 'Based on text signals — not guaranteed',

    // Pagination
    'pagination.loadMore': 'Load more',

    // Actions
    'actions.pendingTitle': 'Pending Approvals',
    'actions.approve': '✓ Approve',
    'actions.reject': '✗ Reject',

    // Assistant
    'assistant.preparing': 'Preparing assistant...',
    'assistant.unavailable': 'Assistant unavailable. Results are still shown below.',
    'assistant.clarify': 'Clarification needed',
    'assistant.summary': 'Summary',
    'assistant.gateFail': 'Not food-related',
    'assistant.nudgeRefine': 'Refine search',

    // WebSocket
    'ws.connecting': 'Connecting...',
    'ws.reconnecting': 'Connection issue - reconnecting...',
    'ws.connected': 'Connected',
    'ws.disconnected': 'Disconnected',

    // Results
    'results.searching': 'Searching...',
    'results.noResults': 'No results found',

    // Common
    'common.close': 'Close',
    'common.clear': 'Clear',
    'common.retry': 'Retry',
  },

  // Hebrew (עברית)
  he: {
    // Hero
    'hero.title': 'חפשו אוכל כמו שאתם חושבים',
    'hero.subtitle': 'חיפוש אוכל באופן טבעי, בכל שפה. פשוט תגידו על מה בא לכם.',

    // Location
    'location.using': '📍 משתמש במיקום שלך',
    'location.getting': '⏳ מאתר מיקום...',
    'location.denied': '🚫 הגישה למיקום נדחתה',
    'location.unavailable': '⚠️ המיקום לא זמין',
    'location.enable': 'הפעל מיקום לתוצאות טובות יותר',

    // Search
    'search.placeholder': 'על מה בא לכם?',
    'search.loading': 'טוען',

    // Recent
    'recent.title': 'חיפושים אחרונים',
    'recent.clearAll': 'נקה הכל',

    // Errors
    'error.title': 'אופס! משהו השתבש',
    'error.retry': 'נסה שוב',

    // Modes
    'mode.recovery': 'מצב שחזור - משפר את החיפוש',
    'mode.clarify': 'צריך עוד מידע',

    // Order
    'order.label': 'סדר:',
    'order.hybrid': 'היברידי',
    'order.balanced': 'מאוזן',
    'order.nearby': 'קרוב',
    'order.quality': 'איכות',
    'order.budget': 'תקציב',
    'order.cuisine': 'מטבח',

    // Filters
    'filter.openNow': '🟢 פתוח עכשיו',
    'filter.openNowTooltip': 'מציג רק מסעדות פתוחות עכשיו',
    'filter.glutenFree': 'ללא גלוטן (רמזים)',
    'filter.glutenFreeTooltip': 'מבוסס על רמזים בטקסט — לא מובטח',

    // Pagination
    'pagination.loadMore': 'טען עוד',

    // Actions
    'actions.pendingTitle': 'אישורים ממתינים',
    'actions.approve': '✓ אשר',
    'actions.reject': '✗ דחה',

    // Assistant
    'assistant.preparing': 'מכין עוזר...',
    'assistant.unavailable': 'העוזר לא זמין. התוצאות מוצגות למטה.',
    'assistant.clarify': 'נדרש הבהרה',
    'assistant.summary': 'סיכום',
    'assistant.gateFail': 'לא קשור לאוכל',
    'assistant.nudgeRefine': 'שפר חיפוש',

    // WebSocket
    'ws.connecting': 'מתחבר...',
    'ws.reconnecting': 'בעיית חיבור - מתחבר מחדש...',
    'ws.connected': 'מחובר',
    'ws.disconnected': 'מנותק',

    // Results
    'results.searching': 'מחפש...',
    'results.noResults': 'לא נמצאו תוצאות',

    // Common
    'common.close': 'סגור',
    'common.clear': 'נקה',
    'common.retry': 'נסה שוב',
  },

  // Russian (Русский)
  ru: {
    // Hero
    'hero.title': 'Ищите еду так, как думаете',
    'hero.subtitle': 'Поиск еды естественным способом, на любом языке. Просто скажите, чего вы хотите.',

    // Location
    'location.using': '📍 Используется ваше местоположение',
    'location.getting': '⏳ Определение местоположения...',
    'location.denied': '🚫 Доступ к местоположению запрещен',
    'location.unavailable': '⚠️ Местоположение недоступно',
    'location.enable': 'Включите местоположение для лучших результатов',

    // Search
    'search.placeholder': 'Что вы хотите поесть?',
    'search.loading': 'Загрузка',

    // Recent
    'recent.title': 'Недавние поиски',
    'recent.clearAll': 'Очистить всё',

    // Errors
    'error.title': 'Упс! Что-то пошло не так',
    'error.retry': 'Попробовать снова',

    // Modes
    'mode.recovery': 'Режим восстановления - уточнение поиска',
    'mode.clarify': 'Нужна дополнительная информация',

    // Order
    'order.label': 'Порядок:',
    'order.hybrid': 'Гибридный',
    'order.balanced': 'Сбалансированный',
    'order.nearby': 'Рядом',
    'order.quality': 'Качество',
    'order.budget': 'Бюджет',
    'order.cuisine': 'Кухня',

    // Filters
    'filter.openNow': '🟢 Открыто сейчас',
    'filter.openNowTooltip': 'Показаны только открытые сейчас рестораны',
    'filter.glutenFree': 'Без глютена (подсказки)',
    'filter.glutenFreeTooltip': 'На основе текстовых подсказок — не гарантировано',

    // Pagination
    'pagination.loadMore': 'Загрузить ещё',

    // Actions
    'actions.pendingTitle': 'Ожидающие подтверждения',
    'actions.approve': '✓ Одобрить',
    'actions.reject': '✗ Отклонить',

    // Assistant
    'assistant.preparing': 'Подготовка помощника...',
    'assistant.unavailable': 'Помощник недоступен. Результаты всё равно показаны ниже.',
    'assistant.clarify': 'Требуется уточнение',
    'assistant.summary': 'Сводка',
    'assistant.gateFail': 'Не связано с едой',
    'assistant.nudgeRefine': 'Уточните поиск',

    // WebSocket
    'ws.connecting': 'Подключение...',
    'ws.reconnecting': 'Проблема с подключением - переподключение...',
    'ws.connected': 'Подключено',
    'ws.disconnected': 'Отключено',

    // Results
    'results.searching': 'Поиск...',
    'results.noResults': 'Результаты не найдены',

    // Common
    'common.close': 'Закрыть',
    'common.clear': 'Очистить',
    'common.retry': 'Повторить',
  },

  // Arabic (العربية)
  ar: {
    // Hero
    'hero.title': 'ابحث عن الطعام بطريقة تفكيرك',
    'hero.subtitle': 'ابحث عن الطعام بشكل طبيعي، بأي لغة. فقط قل ما تشتهيه.',

    // Location
    'location.using': '📍 يستخدم موقعك',
    'location.getting': '⏳ تحديد الموقع...',
    'location.denied': '🚫 تم رفض الوصول إلى الموقع',
    'location.unavailable': '⚠️ الموقع غير متاح',
    'location.enable': 'قم بتفعيل الموقع للحصول على نتائج أفضل',

    // Search
    'search.placeholder': 'ماذا تشتهي أن تأكل؟',
    'search.loading': 'جاري التحميل',

    // Recent
    'recent.title': 'عمليات البحث الأخيرة',
    'recent.clearAll': 'مسح الكل',

    // Errors
    'error.title': 'عذراً! حدث خطأ ما',
    'error.retry': 'حاول مرة أخرى',

    // Modes
    'mode.recovery': 'وضع الاسترداد - تحسين البحث',
    'mode.clarify': 'بحاجة إلى مزيد من المعلومات',

    // Order
    'order.label': 'الترتيب:',
    'order.hybrid': 'هجين',
    'order.balanced': 'متوازن',
    'order.nearby': 'قريب',
    'order.quality': 'الجودة',
    'order.budget': 'الميزانية',
    'order.cuisine': 'المطبخ',

    // Filters
    'filter.openNow': '🟢 مفتوح الآن',
    'filter.openNowTooltip': 'عرض المطاعم المفتوحة الآن فقط',
    'filter.glutenFree': 'خالي من الغلوتين (إشارات)',
    'filter.glutenFreeTooltip': 'بناءً على إشارات النص — غير مضمون',

    // Pagination
    'pagination.loadMore': 'تحميل المزيد',

    // Actions
    'actions.pendingTitle': 'موافقات معلقة',
    'actions.approve': '✓ موافقة',
    'actions.reject': '✗ رفض',

    // Assistant
    'assistant.preparing': 'تجهيز المساعد...',
    'assistant.unavailable': 'المساعد غير متاح. النتائج لا تزال معروضة أدناه.',
    'assistant.clarify': 'يلزم توضيح',
    'assistant.summary': 'ملخص',
    'assistant.gateFail': 'غير متعلق بالطعام',
    'assistant.nudgeRefine': 'صقل البحث',

    // WebSocket
    'ws.connecting': 'جاري الاتصال...',
    'ws.reconnecting': 'مشكلة في الاتصال - إعادة الاتصال...',
    'ws.connected': 'متصل',
    'ws.disconnected': 'غير متصل',

    // Results
    'results.searching': 'جاري البحث...',
    'results.noResults': 'لم يتم العثور على نتائج',

    // Common
    'common.close': 'إغلاق',
    'common.clear': 'مسح',
    'common.retry': 'إعادة المحاولة',
  },

  // French (Français)
  fr: {
    // Hero
    'hero.title': 'Recherchez de la nourriture comme vous pensez',
    'hero.subtitle': 'Recherchez de la nourriture naturellement, dans n\'importe quelle langue. Dites simplement ce dont vous avez envie.',

    // Location
    'location.using': '📍 Utilise votre position',
    'location.getting': '⏳ Obtention de la position...',
    'location.denied': '🚫 Accès à la position refusé',
    'location.unavailable': '⚠️ Position non disponible',
    'location.enable': 'Activer la localisation pour de meilleurs résultats',

    // Search
    'search.placeholder': 'Qu\'avez-vous envie de manger?',
    'search.loading': 'Chargement',

    // Recent
    'recent.title': 'Recherches récentes',
    'recent.clearAll': 'Tout effacer',

    // Errors
    'error.title': 'Oups! Quelque chose s\'est mal passé',
    'error.retry': 'Réessayer',

    // Modes
    'mode.recovery': 'Mode récupération - affinage de la recherche',
    'mode.clarify': 'Besoin de plus d\'informations',

    // Order
    'order.label': 'Ordre:',
    'order.hybrid': 'Hybride',
    'order.balanced': 'Équilibré',
    'order.nearby': 'Proximité',
    'order.quality': 'Qualité',
    'order.budget': 'Budget',
    'order.cuisine': 'Cuisine',

    // Filters
    'filter.openNow': '🟢 Ouvert maintenant',
    'filter.openNowTooltip': 'Affiche uniquement les restaurants ouverts maintenant',
    'filter.glutenFree': 'Sans gluten (indices)',
    'filter.glutenFreeTooltip': 'Basé sur des indices textuels — non garanti',

    // Pagination
    'pagination.loadMore': 'Charger plus',

    // Actions
    'actions.pendingTitle': 'Approbations en attente',
    'actions.approve': '✓ Approuver',
    'actions.reject': '✗ Rejeter',

    // Assistant
    'assistant.preparing': 'Préparation de l\'assistant...',
    'assistant.unavailable': 'Assistant non disponible. Les résultats sont toujours affichés ci-dessous.',
    'assistant.clarify': 'Clarification nécessaire',
    'assistant.summary': 'Résumé',
    'assistant.gateFail': 'Non lié à la nourriture',
    'assistant.nudgeRefine': 'Affiner la recherche',

    // WebSocket
    'ws.connecting': 'Connexion...',
    'ws.reconnecting': 'Problème de connexion - reconnexion...',
    'ws.connected': 'Connecté',
    'ws.disconnected': 'Déconnecté',

    // Results
    'results.searching': 'Recherche...',
    'results.noResults': 'Aucun résultat trouvé',

    // Common
    'common.close': 'Fermer',
    'common.clear': 'Effacer',
    'common.retry': 'Réessayer',
  },

  // Spanish (Español)
  es: {
    // Hero
    'hero.title': 'Busca comida como piensas',
    'hero.subtitle': 'Busca comida de forma natural, en cualquier idioma. Solo di lo que te apetece.',

    // Location
    'location.using': '📍 Usando tu ubicación',
    'location.getting': '⏳ Obteniendo ubicación...',
    'location.denied': '🚫 Acceso a ubicación denegado',
    'location.unavailable': '⚠️ Ubicación no disponible',
    'location.enable': 'Habilita la ubicación para mejores resultados',

    // Search
    'search.placeholder': '¿Qué te apetece comer?',
    'search.loading': 'Cargando',

    // Recent
    'recent.title': 'Búsquedas recientes',
    'recent.clearAll': 'Borrar todo',

    // Errors
    'error.title': '¡Ups! Algo salió mal',
    'error.retry': 'Intentar de nuevo',

    // Modes
    'mode.recovery': 'Modo recuperación - refinando búsqueda',
    'mode.clarify': 'Necesito más información',

    // Order
    'order.label': 'Orden:',
    'order.hybrid': 'Híbrido',
    'order.balanced': 'Equilibrado',
    'order.nearby': 'Cercano',
    'order.quality': 'Calidad',
    'order.budget': 'Presupuesto',
    'order.cuisine': 'Cocina',

    // Filters
    'filter.openNow': '🟢 Abierto ahora',
    'filter.openNowTooltip': 'Mostrando solo restaurantes abiertos ahora',
    'filter.glutenFree': 'Sin gluten (señales)',
    'filter.glutenFreeTooltip': 'Basado en señales de texto — no garantizado',

    // Pagination
    'pagination.loadMore': 'Cargar más',

    // Actions
    'actions.pendingTitle': 'Aprobaciones pendientes',
    'actions.approve': '✓ Aprobar',
    'actions.reject': '✗ Rechazar',

    // Assistant
    'assistant.preparing': 'Preparando asistente...',
    'assistant.unavailable': 'Asistente no disponible. Los resultados aún se muestran abajo.',
    'assistant.clarify': 'Se requiere aclaración',
    'assistant.summary': 'Resumen',
    'assistant.gateFail': 'No relacionado con comida',
    'assistant.nudgeRefine': 'Refinar búsqueda',

    // WebSocket
    'ws.connecting': 'Conectando...',
    'ws.reconnecting': 'Problema de conexión - reconectando...',
    'ws.connected': 'Conectado',
    'ws.disconnected': 'Desconectado',

    // Results
    'results.searching': 'Buscando...',
    'results.noResults': 'No se encontraron resultados',

    // Common
    'common.close': 'Cerrar',
    'common.clear': 'Borrar',
    'common.retry': 'Reintentar',
  },

  // Other/Unknown (fallback to English)
  other: {
    // Hero
    'hero.title': 'Search food the way you think',
    'hero.subtitle': 'Search for food naturally, in any language. Just say what you\'re in the mood for.',

    // Location
    'location.using': '📍 Using your location',
    'location.getting': '⏳ Getting location...',
    'location.denied': '🚫 Location access denied',
    'location.unavailable': '⚠️ Location unavailable',
    'location.enable': 'Enable location for better results',

    // Search
    'search.placeholder': 'What are you hungry for?',
    'search.loading': 'Loading',

    // Recent
    'recent.title': 'Recent Searches',
    'recent.clearAll': 'Clear all',

    // Errors
    'error.title': 'Oops! Something went wrong',
    'error.retry': 'Try Again',

    // Modes
    'mode.recovery': 'Recovery mode - refining search',
    'mode.clarify': 'Need more info',

    // Order
    'order.label': 'Order:',
    'order.hybrid': 'Hybrid',
    'order.balanced': 'Balanced',
    'order.nearby': 'Nearby',
    'order.quality': 'Quality',
    'order.budget': 'Budget',
    'order.cuisine': 'Cuisine',

    // Filters
    'filter.openNow': '🟢 Open now',
    'filter.openNowTooltip': 'Showing only restaurants open now',
    'filter.glutenFree': 'Gluten-free (signals)',
    'filter.glutenFreeTooltip': 'Based on text signals — not guaranteed',

    // Pagination
    'pagination.loadMore': 'Load more',

    // Actions
    'actions.pendingTitle': 'Pending Approvals',
    'actions.approve': '✓ Approve',
    'actions.reject': '✗ Reject',

    // Assistant
    'assistant.preparing': 'Preparing assistant...',
    'assistant.unavailable': 'Assistant unavailable. Results are still shown below.',
    'assistant.clarify': 'Clarification needed',
    'assistant.summary': 'Summary',
    'assistant.gateFail': 'Not food-related',
    'assistant.nudgeRefine': 'Refine search',

    // WebSocket
    'ws.connecting': 'Connecting...',
    'ws.reconnecting': 'Connection issue - reconnecting...',
    'ws.connected': 'Connected',
    'ws.disconnected': 'Disconnected',

    // Results
    'results.searching': 'Searching...',
    'results.noResults': 'No results found',

    // Common
    'common.close': 'Close',
    'common.clear': 'Clear',
    'common.retry': 'Retry',
  },
};

/**
 * Translate a message key to a given language
 * 
 * @param lang - Language code (he|en|ru|ar|fr|es|other)
 * @param key - Message key
 * @param vars - Optional variables for interpolation (e.g., {name: 'John'})
 * @returns Translated string with interpolated variables
 */
export function t(lang: Lang, key: MsgKey, vars?: Record<string, string | number>): string {
  // Normalize language: if not supported, use 'other' (which falls back to English)
  const normalizedLang = isLangSupported(lang) ? lang : 'other';

  // Get message from dictionary
  let message = MESSAGES[normalizedLang][key];

  // Fallback to English if message not found in current language
  if (!message && normalizedLang !== 'en') {
    console.warn(`[i18n] Missing translation for key "${key}" in language "${lang}", falling back to English`);
    message = MESSAGES.en[key];
  }

  // Final fallback: return key itself if not found
  if (!message) {
    console.error(`[i18n] Missing translation for key "${key}" in all languages`);
    return key;
  }

  // Apply variable interpolation (simple {var} replacement)
  if (vars) {
    Object.keys(vars).forEach(varKey => {
      const placeholder = `{${varKey}}`;
      message = message.replace(new RegExp(placeholder, 'g'), String(vars[varKey]));
    });
  }

  return message;
}

/**
 * Check if a language is supported
 */
export function isLangSupported(lang: string): lang is Lang {
  return ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'].includes(lang);
}

/**
 * Get RTL status for a language
 * Hebrew and Arabic are RTL languages
 */
export function isRTL(lang: Lang): boolean {
  return lang === 'he' || lang === 'ar';
}

/**
 * Normalize language code from backend to Lang type
 * Maps common language codes to our supported set
 */
export function normalizeLang(langCode: string | undefined): Lang {
  if (!langCode) return 'en';

  const normalized = langCode.toLowerCase().substring(0, 2);

  switch (normalized) {
    case 'he':
    case 'iw': // Old Hebrew code
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
    default:
      return 'other';
  }
}
