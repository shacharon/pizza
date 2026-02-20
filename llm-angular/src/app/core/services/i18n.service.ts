/**
 * I18n Service
 * Central i18n dictionary for UI labels with 9 language support
 * Single source of truth driven by uiLanguage
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { LanguageService } from './language.service';

export type SupportedUiLang = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it' | 'am';

/**
 * I18n dictionary keys
 */
export interface I18nKeys {
  // Restaurant card - Status
  'card.status.open': string;
  'card.status.closed': string;
  'card.status.temporarily_closed': string;
  'card.status.hours_unverified': string;

  // Restaurant card - Actions
  'card.action.navigate': string;
  'card.action.call': string;
  'card.action.get_directions': string;
  'card.action.location_not_available': string;
  'card.action.call_restaurant': string;
  'card.action.phone_not_available': string;

  // Restaurant card - Provider actions (generic)
  'card.action.order_on': string;      // "Order on {provider}"
  'card.action.search_on': string;     // "Search on {provider}"
  'card.action.order': string;         // "Order"
  'card.action.on': string;            // "on"
  'card.action.loading': string;       // "Loading..."
  
  // Restaurant card - Wolt actions (legacy - kept for compatibility)
  'card.action.order_wolt': string;
  'card.action.order_wolt_title': string;
  'card.action.checking_wolt': string;
  'card.action.checking_wolt_title': string;
  'card.action.search_wolt': string;
  'card.action.search_wolt_title': string;

  // Restaurant card - Dietary badges
  'card.dietary.gluten_free': string;
  'card.dietary.gluten_free_maybe': string;
  'card.dietary.gluten_free_disclaimer': string;

  // Restaurant card - Feature chips (line 4)
  'card.chip.gf': string;
  'card.chip.kosher': string;
  'card.chip.vegetarian': string;

  // Restaurant card - Near you badge
  'card.badge.near_you': string;

  // Restaurant card - Reviews label (e.g. "749 reviews")
  'card.reviews': string;
  'card.reviews_label': string;  // Standalone word e.g. "reviews" for "(749 reviews)"

  // Restaurant card - Open until
  'card.hours.open_until': string;
  'card.hours.until': string;  // Short "until" for inline display
  'card.hours.closes': string;  // Short "closes" for inline display

  // Restaurant card - Single-line status + hours
  'card.hours.open_now_until': string;  // "Open now · until {time}"
  'card.hours.closing_soon': string;    // "Closing soon · {time}"
  'card.hours.closed_opens_at': string;  // "Closed · opens at {time}"
  'card.hours.opens_at': string;         // "opens at {time}" only (no Open/Closed word)
  'card.hours.closed_hours': string;     // "Closed · hours: {range}"

  // Restaurant card - Distance units
  'card.distance.meters_short': string;
  'card.distance.km_short': string;
  'card.distance.minutes_short': string;

  // Restaurant card - Distance intent-based formatting
  'card.distance.walk_time': string;        // "~{minutes} min walk"
  'card.distance.rounded_km': string;       // "~{km} km"
  'card.distance.meters': string;           // "{meters} m"
  'card.distance.very_close': string;       // <1km
  'card.distance.short_walk': string;       // 1-3km
  'card.distance.few_minutes_drive': string; // 3-7km

  // Reason label
  'reason.best_match': string;
  'reason.open_now': string;
  'reason.closest_option': string;

  // Filter chips
  'filter.open_now': string;
  'filter.open_now_description': string;
  'filter.gluten_free': string;
  'filter.gluten_free_description': string;

  // Location prompt
  'location.enable_prompt': string;

  // Results pagination
  'results.loadMore': string;
}

/**
 * I18n dictionary: 9 languages
 */
const TRANSLATIONS: Record<SupportedUiLang, I18nKeys> = {
  // English
  en: {
    'card.status.open': 'Open',
    'card.status.closed': 'Closed',
    'card.status.temporarily_closed': 'Temporarily closed',
    'card.status.hours_unverified': 'Hours unverified',
    'card.action.navigate': 'Navigate',
    'card.action.call': 'Call',
    'card.action.get_directions': 'Get directions',
    'card.action.location_not_available': 'Location not available',
    'card.action.call_restaurant': 'Call restaurant',
    'card.action.phone_not_available': 'Phone number not available',
    'card.action.order_on': 'Order on {provider}',
    'card.action.search_on': 'Search on {provider}',
    'card.action.order': 'Order',
    'card.action.on': 'on',
    'card.action.loading': 'Loading…',
    'card.action.order_wolt': 'Order on Wolt',
    'card.action.order_wolt_title': 'Order delivery from this restaurant via Wolt',
    'card.action.checking_wolt': 'Checking Wolt…',
    'card.action.checking_wolt_title': 'Checking if this restaurant is available on Wolt',
    'card.action.search_wolt': 'Search on Wolt',
    'card.action.search_wolt_title': 'Search for this restaurant on Wolt',
    'card.dietary.gluten_free': 'GF',
    'card.dietary.gluten_free_maybe': 'Maybe GF',
    'card.dietary.gluten_free_disclaimer': 'Based on text signals — not guaranteed',
    'card.chip.gf': 'GF',
    'card.chip.kosher': 'Kosher',
    'card.chip.vegetarian': 'Vegetarian',
    'card.badge.near_you': 'Near you',
    'card.reviews': '{count} reviews',
    'card.reviews_label': 'reviews',
    'card.hours.open_until': 'Open until {time}',
    'card.hours.until': 'until',
    'card.hours.closes': 'closes',
    'card.hours.open_now_until': 'Open now · until {time}',
    'card.hours.closing_soon': 'Closing soon · {time}',
    'card.hours.closed_opens_at': 'Closed · opens at {time}',
    'card.hours.opens_at': 'opens at {time}',
    'card.hours.closed_hours': 'Closed · hours: {range}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'card.distance.walk_time': '~{minutes} min walk',
    'card.distance.rounded_km': '~{km} km',
    'card.distance.meters': '{meters} m',
    'card.distance.very_close': 'Very close',
    'card.distance.short_walk': 'Short walk',
    'card.distance.few_minutes_drive': 'Few minutes drive',
    'reason.best_match': 'Best match',
    'reason.open_now': 'Open now',
    'reason.closest_option': 'Closest option',
    'filter.open_now': '🟢 Open now',
    'filter.open_now_description': 'Showing only restaurants open now',
    'filter.gluten_free': 'Gluten-free (signals)',
    'filter.gluten_free_description': 'Based on text signals — not guaranteed',
    'location.enable_prompt': 'Enable location for better results',
    'results.loadMore': 'Load more'
  },

  // Hebrew
  he: {
    'card.status.open': 'פתוח',
    'card.status.closed': 'סגור',
    'card.status.temporarily_closed': 'סגור זמנית',
    'card.status.hours_unverified': 'שעות לא מאומתות',
    'card.action.navigate': 'נווט',
    'card.action.call': 'התקשר',
    'card.action.get_directions': 'קבל הוראות הגעה',
    'card.action.location_not_available': 'מיקום לא זמין',
    'card.action.call_restaurant': 'התקשר למסעדה',
    'card.action.phone_not_available': 'מספר טלפון לא זמין',
    'card.action.order_on': 'הזמן ב-{provider}',
    'card.action.search_on': 'חפש ב-{provider}',
    'card.action.order': 'הזמן',
    'card.action.on': 'ב-',
    'card.action.loading': 'טוען…',
    'card.action.order_wolt': 'הזמן ב-Wolt',
    'card.action.order_wolt_title': 'הזמן משלוח מהמסעדה דרך Wolt',
    'card.action.checking_wolt': 'בודק ב-Wolt…',
    'card.action.checking_wolt_title': 'בודק אם המסעדה זמינה ב-Wolt',
    'card.action.search_wolt': 'חפש ב-Wolt',
    'card.action.search_wolt_title': 'חפש את המסעדה ב-Wolt',
    'card.dietary.gluten_free': 'ללא גלוטן',
    'card.dietary.gluten_free_maybe': 'אולי ללא גלוטן',
    'card.dietary.gluten_free_disclaimer': 'מבוסס על רמזים בטקסט — לא מובטח',
    'card.chip.gf': 'ללא גלוטן',
    'card.chip.kosher': 'כשר',
    'card.chip.vegetarian': 'צמחוני',
    'card.badge.near_you': 'קרוב אליך',
    'card.reviews': '{count} ביקורות',
    'card.reviews_label': 'ביקורות',
    'card.hours.open_until': 'פתוח עד {time}',
    'card.hours.until': 'עד',
    'card.hours.closes': 'נסגר',
    'card.hours.open_now_until': 'פתוח עכשיו · עד {time}',
    'card.hours.closing_soon': 'נסגר בקרוב · {time}',
    'card.hours.closed_opens_at': 'סגור · נפתח ב־{time}',
    'card.hours.opens_at': 'נפתח ב־{time}',
    'card.hours.closed_hours': 'סגור · שעות: {range}',
    'card.distance.meters_short': 'מ׳',
    'card.distance.km_short': 'ק״מ',
    'card.distance.minutes_short': 'דק׳',
    'card.distance.walk_time': 'כ־{minutes} דק׳ הליכה',
    'card.distance.rounded_km': '~{km} ק״מ',
    'card.distance.meters': '{meters} מ׳',
    'card.distance.very_close': 'קרוב מאוד',
    'card.distance.short_walk': 'הליכה קצרה',
    'card.distance.few_minutes_drive': 'כמה דקות נסיעה',
    'reason.best_match': 'התאמה הטובה ביותר',
    'reason.open_now': 'פתוח עכשיו',
    'reason.closest_option': 'האופציה הקרובה ביותר',
    'filter.open_now': '🟢 פתוח עכשיו',
    'filter.open_now_description': 'מציג רק מסעדות פתוחות עכשיו',
    'filter.gluten_free': 'ללא גלוטן (רמזים)',
    'filter.gluten_free_description': 'מבוסס על רמזים בטקסט — לא מובטח',
    'location.enable_prompt': 'הפעל מיקום לתוצאות טובות יותר',
    'results.loadMore': 'עוד'
  },

  // Russian
  ru: {
    'card.status.open': 'Открыто',
    'card.status.closed': 'Закрыто',
    'card.status.temporarily_closed': 'Временно закрыто',
    'card.status.hours_unverified': 'Часы не подтверждены',
    'card.action.navigate': 'Навигация',
    'card.action.call': 'Позвонить',
    'card.action.get_directions': 'Получить маршрут',
    'card.action.location_not_available': 'Местоположение недоступно',
    'card.action.call_restaurant': 'Позвонить в ресторан',
    'card.action.phone_not_available': 'Номер телефона недоступен',
    'card.action.order_on': 'Заказать на {provider}',
    'card.action.search_on': 'Искать на {provider}',
    'card.action.order': 'Заказать',
    'card.action.on': 'на',
    'card.action.loading': 'Загрузка…',
    'card.action.order_wolt': 'Заказать на Wolt',
    'card.action.order_wolt_title': 'Заказать доставку из этого ресторана через Wolt',
    'card.action.checking_wolt': 'Проверка Wolt…',
    'card.action.checking_wolt_title': 'Проверка доступности ресторана на Wolt',
    'card.action.search_wolt': 'Искать на Wolt',
    'card.action.search_wolt_title': 'Искать этот ресторан на Wolt',
    'card.dietary.gluten_free': 'БГ',
    'card.dietary.gluten_free_maybe': 'Возможно БГ',
    'card.dietary.gluten_free_disclaimer': 'На основе текстовых сигналов — не гарантируется',
    'card.chip.gf': 'БГ',
    'card.chip.kosher': 'Кошер',
    'card.chip.vegetarian': 'Вегетарианское',
    'card.badge.near_you': 'Рядом',
    'card.reviews': '{count} отзывов',
    'card.reviews_label': 'отзывов',
    'card.hours.open_until': 'Открыто до {time}',
    'card.hours.until': 'до',
    'card.hours.closes': 'закрывается',
    'card.hours.open_now_until': 'Открыто сейчас · до {time}',
    'card.hours.closing_soon': 'Скоро закроется · {time}',
    'card.hours.closed_opens_at': 'Закрыто · откроется в {time}',
    'card.hours.opens_at': 'откроется в {time}',
    'card.hours.closed_hours': 'Закрыто · часы: {range}',
    'card.distance.meters_short': 'м',
    'card.distance.km_short': 'км',
    'card.distance.minutes_short': 'мин',
    'card.distance.walk_time': '~{minutes} мин пешком',
    'card.distance.rounded_km': '~{km} км',
    'card.distance.meters': '{meters} м',
    'card.distance.very_close': 'Очень близко',
    'card.distance.short_walk': 'Короткая прогулка',
    'card.distance.few_minutes_drive': 'Несколько минут езды',
    'reason.best_match': 'Лучшее совпадение',
    'reason.open_now': 'Открыто сейчас',
    'reason.closest_option': 'Ближайший вариант',
    'filter.open_now': '🟢 Открыто сейчас',
    'filter.open_now_description': 'Показаны только открытые рестораны',
    'filter.gluten_free': 'Без глютена (сигналы)',
    'filter.gluten_free_description': 'На основе текстовых сигналов — не гарантируется',
    'location.enable_prompt': 'Включить местоположение для лучших результатов',
    'results.loadMore': 'Показать ещё'
  },

  // Arabic
  ar: {
    'card.status.open': 'مفتوح',
    'card.status.closed': 'مغلق',
    'card.status.temporarily_closed': 'مغلق مؤقتاً',
    'card.status.hours_unverified': 'الساعات غير مؤكدة',
    'card.action.navigate': 'التنقل',
    'card.action.call': 'اتصل',
    'card.action.get_directions': 'احصل على الاتجاهات',
    'card.action.location_not_available': 'الموقع غير متاح',
    'card.action.call_restaurant': 'اتصل بالمطعم',
    'card.action.phone_not_available': 'رقم الهاتف غير متاح',
    'card.action.order_on': 'اطلب على {provider}',
    'card.action.search_on': 'ابحث على {provider}',
    'card.action.order': 'اطلب',
    'card.action.on': 'على',
    'card.action.loading': 'جارٍ التحميل…',
    'card.action.order_wolt': 'اطلب على Wolt',
    'card.action.order_wolt_title': 'اطلب توصيل من هذا المطعم عبر Wolt',
    'card.action.checking_wolt': 'جاري التحقق من Wolt…',
    'card.action.checking_wolt_title': 'جاري التحقق من توفر المطعم على Wolt',
    'card.action.search_wolt': 'ابحث على Wolt',
    'card.action.search_wolt_title': 'ابحث عن هذا المطعم على Wolt',
    'card.dietary.gluten_free': 'خالٍ من الغلوتين',
    'card.dietary.gluten_free_maybe': 'ربما خالٍ من الغلوتين',
    'card.dietary.gluten_free_disclaimer': 'بناءً على إشارات نصية — غير مضمون',
    'card.chip.gf': 'خالٍ من الغلوتين',
    'card.chip.kosher': 'كوشير',
    'card.chip.vegetarian': 'نباتي',
    'card.badge.near_you': 'بالقرب منك',
    'card.reviews': '{count} تقييمات',
    'card.reviews_label': 'تقييمات',
    'card.hours.open_until': 'مفتوح حتى {time}',
    'card.hours.until': 'حتى',
    'card.hours.closes': 'يغلق',
    'card.hours.open_now_until': 'مفتوح الآن · حتى {time}',
    'card.hours.closing_soon': 'يغلق قريباً · {time}',
    'card.hours.closed_opens_at': 'مغلق · يفتح في {time}',
    'card.hours.opens_at': 'يفتح في {time}',
    'card.hours.closed_hours': 'مغلق · ساعات: {range}',
    'card.distance.meters_short': 'م',
    'card.distance.km_short': 'كم',
    'card.distance.minutes_short': 'د',
    'card.distance.walk_time': '~{minutes} د مشياً',
    'card.distance.rounded_km': '~{km} كم',
    'card.distance.meters': '{meters} م',
    'card.distance.very_close': 'قريب جداً',
    'card.distance.short_walk': 'مشي قصير',
    'card.distance.few_minutes_drive': 'دقائق قليلة بالسيارة',
    'reason.best_match': 'أفضل تطابق',
    'reason.open_now': 'مفتوح الآن',
    'reason.closest_option': 'الخيار الأقرب',
    'filter.open_now': '🟢 مفتوح الآن',
    'filter.open_now_description': 'يعرض المطاعم المفتوحة فقط الآن',
    'filter.gluten_free': 'خالٍ من الغلوتين (إشارات)',
    'filter.gluten_free_description': 'بناءً على إشارات نصية — غير مضمون',
    'location.enable_prompt': 'تمكين الموقع لنتائج أفضل',
    'results.loadMore': 'عرض المزيد'
  },

  // French
  fr: {
    'card.status.open': 'Ouvert',
    'card.status.closed': 'Fermé',
    'card.status.temporarily_closed': 'Fermé temporairement',
    'card.status.hours_unverified': 'Horaires non vérifiés',
    'card.action.navigate': 'Naviguer',
    'card.action.call': 'Appeler',
    'card.action.get_directions': 'Obtenir l\'itinéraire',
    'card.action.location_not_available': 'Emplacement non disponible',
    'card.action.call_restaurant': 'Appeler le restaurant',
    'card.action.phone_not_available': 'Numéro de téléphone non disponible',
    'card.action.order_on': 'Commander sur {provider}',
    'card.action.search_on': 'Rechercher sur {provider}',
    'card.action.order': 'Commander',
    'card.action.on': 'sur',
    'card.action.loading': 'Chargement…',
    'card.action.order_wolt': 'Commander sur Wolt',
    'card.action.order_wolt_title': 'Commander la livraison de ce restaurant via Wolt',
    'card.action.checking_wolt': 'Vérification Wolt…',
    'card.action.checking_wolt_title': 'Vérification de la disponibilité du restaurant sur Wolt',
    'card.action.search_wolt': 'Rechercher sur Wolt',
    'card.action.search_wolt_title': 'Rechercher ce restaurant sur Wolt',
    'card.dietary.gluten_free': 'SG',
    'card.dietary.gluten_free_maybe': 'Peut-être SG',
    'card.dietary.gluten_free_disclaimer': 'Basé sur des signaux textuels — non garanti',
    'card.chip.gf': 'SG',
    'card.chip.kosher': 'Casher',
    'card.chip.vegetarian': 'Végétarien',
    'card.badge.near_you': 'Tout près',
    'card.reviews': '{count} avis',
    'card.reviews_label': 'avis',
    'card.hours.open_until': 'Ouvert jusqu\'à {time}',
    'card.hours.until': 'jusqu\'à',
    'card.hours.closes': 'ferme',
    'card.hours.open_now_until': 'Ouvert maintenant · jusqu\'à {time}',
    'card.hours.closing_soon': 'Ferme bientôt · {time}',
    'card.hours.closed_opens_at': 'Fermé · ouvre à {time}',
    'card.hours.opens_at': 'ouvre à {time}',
    'card.hours.closed_hours': 'Fermé · horaires: {range}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'card.distance.walk_time': '~{minutes} min à pied',
    'card.distance.rounded_km': '~{km} km',
    'card.distance.meters': '{meters} m',
    'card.distance.very_close': 'Très proche',
    'card.distance.short_walk': 'Courte marche',
    'card.distance.few_minutes_drive': 'Quelques minutes en voiture',
    'reason.best_match': 'Meilleure correspondance',
    'reason.open_now': 'Ouvert maintenant',
    'reason.closest_option': 'Option la plus proche',
    'filter.open_now': '🟢 Ouvert maintenant',
    'filter.open_now_description': 'Affichage des restaurants ouverts uniquement',
    'filter.gluten_free': 'Sans gluten (signaux)',
    'filter.gluten_free_description': 'Basé sur des signaux textuels — non garanti',
    'location.enable_prompt': 'Activer la localisation pour de meilleurs résultats',
    'results.loadMore': 'Afficher plus'
  },

  // Spanish
  es: {
    'card.status.open': 'Abierto',
    'card.status.closed': 'Cerrado',
    'card.status.temporarily_closed': 'Cerrado temporalmente',
    'card.status.hours_unverified': 'Horario no verificado',
    'card.action.navigate': 'Navegar',
    'card.action.call': 'Llamar',
    'card.action.get_directions': 'Obtener direcciones',
    'card.action.location_not_available': 'Ubicación no disponible',
    'card.action.call_restaurant': 'Llamar al restaurante',
    'card.action.phone_not_available': 'Número de teléfono no disponible',
    'card.action.order_on': 'Pedir en {provider}',
    'card.action.search_on': 'Buscar en {provider}',
    'card.action.order': 'Pedir',
    'card.action.on': 'en',
    'card.action.loading': 'Cargando…',
    'card.action.order_wolt': 'Pedir en Wolt',
    'card.action.order_wolt_title': 'Pedir entrega de este restaurante a través de Wolt',
    'card.action.checking_wolt': 'Verificando Wolt…',
    'card.action.checking_wolt_title': 'Verificando si este restaurante está disponible en Wolt',
    'card.action.search_wolt': 'Buscar en Wolt',
    'card.action.search_wolt_title': 'Buscar este restaurante en Wolt',
    'card.dietary.gluten_free': 'SG',
    'card.dietary.gluten_free_maybe': 'Tal vez SG',
    'card.dietary.gluten_free_disclaimer': 'Basado en señales de texto — no garantizado',
    'card.chip.gf': 'SG',
    'card.chip.kosher': 'Kosher',
    'card.chip.vegetarian': 'Vegetariano',
    'card.badge.near_you': 'Cerca de ti',
    'card.reviews': '{count} reseñas',
    'card.reviews_label': 'reseñas',
    'card.hours.open_until': 'Abierto hasta {time}',
    'card.hours.until': 'hasta',
    'card.hours.closes': 'cierra',
    'card.hours.open_now_until': 'Abierto ahora · hasta {time}',
    'card.hours.closing_soon': 'Cerrando pronto · {time}',
    'card.hours.closed_opens_at': 'Cerrado · abre a las {time}',
    'card.hours.opens_at': 'abre a las {time}',
    'card.hours.closed_hours': 'Cerrado · horario: {range}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'card.distance.walk_time': '~{minutes} min caminando',
    'card.distance.rounded_km': '~{km} km',
    'card.distance.meters': '{meters} m',
    'card.distance.very_close': 'Muy cerca',
    'card.distance.short_walk': 'Paseo corto',
    'card.distance.few_minutes_drive': 'Unos minutos en coche',
    'reason.best_match': 'Mejor coincidencia',
    'reason.open_now': 'Abierto ahora',
    'reason.closest_option': 'Opción más cercana',
    'filter.open_now': '🟢 Abierto ahora',
    'filter.open_now_description': 'Mostrando solo restaurantes abiertos ahora',
    'filter.gluten_free': 'Sin gluten (señales)',
    'filter.gluten_free_description': 'Basado en señales de texto — no garantizado',
    'location.enable_prompt': 'Activar ubicación para mejores resultados',
    'results.loadMore': 'Mostrar más'
  },

  // German
  de: {
    'card.status.open': 'Geöffnet',
    'card.status.closed': 'Geschlossen',
    'card.status.temporarily_closed': 'Vorübergehend geschlossen',
    'card.status.hours_unverified': 'Öffnungszeiten unbestätigt',
    'card.action.navigate': 'Navigieren',
    'card.action.call': 'Anrufen',
    'card.action.get_directions': 'Route abrufen',
    'card.action.location_not_available': 'Standort nicht verfügbar',
    'card.action.call_restaurant': 'Restaurant anrufen',
    'card.action.phone_not_available': 'Telefonnummer nicht verfügbar',
    'card.action.order_on': 'Bei {provider} bestellen',
    'card.action.search_on': 'Bei {provider} suchen',
    'card.action.order': 'Bestellen',
    'card.action.on': 'bei',
    'card.action.loading': 'Lädt…',
    'card.action.order_wolt': 'Bei Wolt bestellen',
    'card.action.order_wolt_title': 'Lieferung von diesem Restaurant über Wolt bestellen',
    'card.action.checking_wolt': 'Wolt wird überprüft…',
    'card.action.checking_wolt_title': 'Verfügbarkeit des Restaurants bei Wolt wird überprüft',
    'card.action.search_wolt': 'Bei Wolt suchen',
    'card.action.search_wolt_title': 'Dieses Restaurant bei Wolt suchen',
    'card.dietary.gluten_free': 'GF',
    'card.dietary.gluten_free_maybe': 'Vielleicht GF',
    'card.dietary.gluten_free_disclaimer': 'Basierend auf Textsignalen — nicht garantiert',
    'card.chip.gf': 'GF',
    'card.chip.kosher': 'Koscher',
    'card.chip.vegetarian': 'Vegetarisch',
    'card.badge.near_you': 'In der Nähe',
    'card.reviews': '{count} Bewertungen',
    'card.reviews_label': 'Bewertungen',
    'card.hours.open_until': 'Geöffnet bis {time}',
    'card.hours.until': 'bis',
    'card.hours.closes': 'schließt',
    'card.hours.open_now_until': 'Jetzt geöffnet · bis {time}',
    'card.hours.closing_soon': 'Schließt bald · {time}',
    'card.hours.closed_opens_at': 'Geschlossen · öffnet um {time}',
    'card.hours.opens_at': 'öffnet um {time}',
    'card.hours.closed_hours': 'Geschlossen · Zeiten: {range}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'Min',
    'card.distance.walk_time': '~{minutes} Min zu Fuß',
    'card.distance.rounded_km': '~{km} km',
    'card.distance.meters': '{meters} m',
    'card.distance.very_close': 'Sehr nah',
    'card.distance.short_walk': 'Kurzer Spaziergang',
    'card.distance.few_minutes_drive': 'Wenige Minuten Fahrt',
    'reason.best_match': 'Beste Übereinstimmung',
    'reason.open_now': 'Jetzt geöffnet',
    'reason.closest_option': 'Nächste Option',
    'filter.open_now': '🟢 Jetzt geöffnet',
    'filter.open_now_description': 'Zeigt nur jetzt geöffnete Restaurants',
    'filter.gluten_free': 'Glutenfrei (Signale)',
    'filter.gluten_free_description': 'Basierend auf Textsignalen — nicht garantiert',
    'location.enable_prompt': 'Standort aktivieren für bessere Ergebnisse',
    'results.loadMore': 'Mehr anzeigen'
  },

  // Italian
  it: {
    'card.status.open': 'Aperto',
    'card.status.closed': 'Chiuso',
    'card.status.temporarily_closed': 'Chiuso temporaneamente',
    'card.status.hours_unverified': 'Orari non verificati',
    'card.action.navigate': 'Naviga',
    'card.action.call': 'Chiama',
    'card.action.get_directions': 'Ottieni indicazioni',
    'card.action.location_not_available': 'Posizione non disponibile',
    'card.action.call_restaurant': 'Chiama il ristorante',
    'card.action.phone_not_available': 'Numero di telefono non disponibile',
    'card.action.order_on': 'Ordina su {provider}',
    'card.action.search_on': 'Cerca su {provider}',
    'card.action.order': 'Ordina',
    'card.action.on': 'su',
    'card.action.loading': 'Caricamento…',
    'card.action.order_wolt': 'Ordina su Wolt',
    'card.action.order_wolt_title': 'Ordina consegna da questo ristorante tramite Wolt',
    'card.action.checking_wolt': 'Controllo Wolt…',
    'card.action.checking_wolt_title': 'Controllo disponibilità del ristorante su Wolt',
    'card.action.search_wolt': 'Cerca su Wolt',
    'card.action.search_wolt_title': 'Cerca questo ristorante su Wolt',
    'card.dietary.gluten_free': 'SG',
    'card.dietary.gluten_free_maybe': 'Forse SG',
    'card.dietary.gluten_free_disclaimer': 'Basato su segnali testuali — non garantito',
    'card.chip.gf': 'SG',
    'card.chip.kosher': 'Kosher',
    'card.chip.vegetarian': 'Vegetariano',
    'card.badge.near_you': 'Vicino a te',
    'card.reviews': '{count} recensioni',
    'card.reviews_label': 'recensioni',
    'card.hours.open_until': 'Aperto fino alle {time}',
    'card.hours.until': 'fino alle',
    'card.hours.closes': 'chiude',
    'card.hours.open_now_until': 'Aperto ora · fino alle {time}',
    'card.hours.closing_soon': 'Chiude presto · {time}',
    'card.hours.closed_opens_at': 'Chiuso · apre alle {time}',
    'card.hours.opens_at': 'apre alle {time}',
    'card.hours.closed_hours': 'Chiuso · orari: {range}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'card.distance.walk_time': '~{minutes} min a piedi',
    'card.distance.rounded_km': '~{km} km',
    'card.distance.meters': '{meters} m',
    'card.distance.very_close': 'Molto vicino',
    'card.distance.short_walk': 'Breve passeggiata',
    'card.distance.few_minutes_drive': 'Pochi minuti di guida',
    'reason.best_match': 'Migliore corrispondenza',
    'reason.open_now': 'Aperto ora',
    'reason.closest_option': 'Opzione più vicina',
    'filter.open_now': '🟢 Aperto ora',
    'filter.open_now_description': 'Mostra solo ristoranti aperti ora',
    'filter.gluten_free': 'Senza glutine (segnali)',
    'filter.gluten_free_description': 'Basato su segnali testuali — non garantito',
    'location.enable_prompt': 'Abilita posizione per risultati migliori',
    'results.loadMore': 'Mostra altro'
  },

  // Amharic (አማርኛ)
  am: {
    'card.status.open': 'ክፈት',
    'card.status.closed': 'ዝጋ',
    'card.status.temporarily_closed': 'በጊዜያዊ ዝጋ',
    'card.status.hours_unverified': 'ሰዓት አልተረጋገጠም',
    'card.action.navigate': 'መርቀቅ',
    'card.action.call': 'ይደውሉ',
    'card.action.get_directions': 'አቅጣጫ ያግኙ',
    'card.action.location_not_available': 'ቦታ አይገኝም',
    'card.action.call_restaurant': 'ለርስቶራንት ይደውሉ',
    'card.action.phone_not_available': 'ስልክ ቁጥር አይገኝም',
    'card.action.order_on': 'በ{provider} ይዘዙ',
    'card.action.search_on': 'በ{provider} ይፈልጉ',
    'card.action.order': 'ይዘዙ',
    'card.action.on': 'በ',
    'card.action.loading': 'በመጫን…',
    'card.action.order_wolt': 'በWolt ይዘዙ',
    'card.action.order_wolt_title': 'ከዚህ ርስቶራንት በWolt መጫን ይዘዙ',
    'card.action.checking_wolt': 'Wolt በማረጋገጥ…',
    'card.action.checking_wolt_title': 'ርስቶራንት በWolt ይገኛል እንደሆነ በማረጋገጥ',
    'card.action.search_wolt': 'በWolt ይፈልጉ',
    'card.action.search_wolt_title': 'ይህን ርስቶራንት በWolt ይፈልጉ',
    'card.dietary.gluten_free': 'ግሉተን ነፃ',
    'card.dietary.gluten_free_maybe': 'ግሉተን ነፃ ሊሆን ይችላል',
    'card.dietary.gluten_free_disclaimer': 'በጽሑፍ ምልክቶች ላይ የተመሰረተ — አልተረጋገጠም',
    'card.chip.gf': 'ግሉተን ነፃ',
    'card.chip.kosher': 'ኮሸር',
    'card.chip.vegetarian': 'እህል በሚበላ',
    'card.badge.near_you': 'ከእርስዎ አጠገብ',
    'card.reviews': '{count} ግምገማዎች',
    'card.reviews_label': 'ግምገማዎች',
    'card.hours.open_until': 'እስከ {time} ክፈት',
    'card.hours.until': 'እስከ',
    'card.hours.closes': 'ይዘጋ',
    'card.hours.open_now_until': 'አሁን ክፈት · እስከ {time}',
    'card.hours.closing_soon': 'በቅርብ ይዘጋል · {time}',
    'card.hours.closed_opens_at': 'ዝጋ · በ{time} ይከፈታል',
    'card.hours.opens_at': 'በ{time} ይከፈታል',
    'card.hours.closed_hours': 'ዝጋ · ሰዓት: {range}',
    'card.distance.meters_short': 'ሜ',
    'card.distance.km_short': 'ኪሜ',
    'card.distance.minutes_short': 'ደቂቃ',
    'card.distance.walk_time': '~{minutes} ደቂቃ በእግር',
    'card.distance.rounded_km': '~{km} ኪሜ',
    'card.distance.meters': '{meters} ሜ',
    'card.distance.very_close': 'በጣም ቅርብ',
    'card.distance.short_walk': 'አጭር መራቅ',
    'card.distance.few_minutes_drive': 'ጥቂት ደቂቃ በመኪና',
    'reason.best_match': 'ምርጥ መጣጣም',
    'reason.open_now': 'አሁን ክፈት',
    'reason.closest_option': 'ቅርብ አማራጭ',
    'filter.open_now': '🟢 አሁን ክፈት',
    'filter.open_now_description': 'አሁን የተከፈቱ ርስቶራንቶችን ብቻ ያሳያል',
    'filter.gluten_free': 'ግሉተን ነፃ (ምልክቶች)',
    'filter.gluten_free_description': 'በጽሑፍ ምልክቶች ላይ የተመሰረተ — አልተረጋገጠም',
    'location.enable_prompt': 'ለተሻለ ውጤት ቦታ ይግብ',
    'results.loadMore': 'ተጨማሪ ጫን'
  }
};

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private languageService = inject(LanguageService);

  // Current UI language (reactive signal)
  readonly currentLang = signal<SupportedUiLang>('en');

  // Current translations (computed from currentLang)
  readonly translations = computed(() => TRANSLATIONS[this.currentLang()]);

  constructor() {
    // Initialize with language service current language
    const langServiceLang = this.languageService.currentLang();
    this.setLanguage(this.normalizeToUiLang(langServiceLang));
  }

  /**
   * Set UI language
   */
  setLanguage(lang: SupportedUiLang): void {
    this.currentLang.set(lang);
    console.log(`[I18nService] UI language set to: ${lang}`);
  }

  /**
   * Get translation for a key
   * Falls back to English if key not found
   * Supports interpolation with params (e.g., {count})
   */
  t(key: keyof I18nKeys, params?: Record<string, string | number>): string {
    const translations = this.translations();
    let value = translations[key];

    // Fallback to English if key missing in current language
    if (!value && this.currentLang() !== 'en') {
      console.warn(`[I18nService] Missing translation for key "${key}" in language "${this.currentLang()}", using English fallback`);
      value = TRANSLATIONS.en[key] || key;
    }

    if (!value) {
      value = key;
    }

    // Interpolate params if provided
    if (params) {
      return Object.entries(params).reduce((result, [paramKey, paramValue]) => {
        return result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(paramValue));
      }, value);
    }

    return value;
  }

  /**
   * Normalize language from LanguageService to UI language
   */
  private normalizeToUiLang(lang: string): SupportedUiLang {
    const normalized = lang.toLowerCase().split('-')[0];

    switch (normalized) {
      case 'he':
      case 'iw':
        return 'he';
      case 'ar':
        return 'ar';
      case 'ru':
        return 'ru';
      case 'fr':
        return 'fr';
      case 'es':
        return 'es';
      case 'de':
        return 'de';
      case 'it':
        return 'it';
      case 'am':
        return 'am';
      case 'en':
      default:
        return 'en';
    }
  }

  /**
   * Sync language from search response (NOT used for UI labels)
   * UI language is independent of assistant language
   */
  syncFromBrowserOrDefault(): void {
    const langServiceLang = this.languageService.currentLang();
    const uiLang = this.normalizeToUiLang(langServiceLang);

    if (uiLang !== this.currentLang()) {
      this.setLanguage(uiLang);
    }
  }
}
