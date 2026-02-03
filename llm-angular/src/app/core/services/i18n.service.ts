/**
 * I18n Service
 * Central i18n dictionary for UI labels with 8 language support
 * Single source of truth driven by uiLanguage
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { LanguageService } from './language.service';

export type SupportedUiLang = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it';

/**
 * I18n dictionary keys
 */
export interface I18nKeys {
  // Restaurant card - Status
  'card.status.open': string;
  'card.status.closed': string;
  'card.status.hours_unverified': string;
  
  // Restaurant card - Actions
  'card.action.navigate': string;
  'card.action.call': string;
  'card.action.get_directions': string;
  'card.action.location_not_available': string;
  'card.action.call_restaurant': string;
  'card.action.phone_not_available': string;
  
  // Restaurant card - Dietary badges
  'card.dietary.gluten_free': string;
  'card.dietary.gluten_free_maybe': string;
  'card.dietary.gluten_free_disclaimer': string;
  
  // Restaurant card - Near you badge
  'card.badge.near_you': string;
  
  // Restaurant card - Open until
  'card.hours.open_until': string;
  
  // Restaurant card - Distance units
  'card.distance.meters_short': string;
  'card.distance.km_short': string;
  'card.distance.minutes_short': string;
  
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
 * I18n dictionary: 8 languages
 */
const TRANSLATIONS: Record<SupportedUiLang, I18nKeys> = {
  // English
  en: {
    'card.status.open': 'Open now',
    'card.status.closed': 'Closed',
    'card.status.hours_unverified': 'Hours unverified',
    'card.action.navigate': 'Navigate',
    'card.action.call': 'Call',
    'card.action.get_directions': 'Get directions',
    'card.action.location_not_available': 'Location not available',
    'card.action.call_restaurant': 'Call restaurant',
    'card.action.phone_not_available': 'Phone number not available',
    'card.dietary.gluten_free': 'GF',
    'card.dietary.gluten_free_maybe': 'Maybe GF',
    'card.dietary.gluten_free_disclaimer': 'Based on text signals — not guaranteed',
    'card.badge.near_you': 'Near you',
    'card.hours.open_until': 'Open until {time}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'reason.best_match': 'Best match',
    'reason.open_now': 'Open now',
    'reason.closest_option': 'Closest option',
    'filter.open_now': '🟢 Open now',
    'filter.open_now_description': 'Showing only restaurants open now',
    'filter.gluten_free': 'Gluten-free (signals)',
    'filter.gluten_free_description': 'Based on text signals — not guaranteed',
    'location.enable_prompt': 'Enable location for better results',
    'results.loadMore': 'Load {count} more'
  },
  
  // Hebrew
  he: {
    'card.status.open': 'פתוח עכשיו',
    'card.status.closed': 'סגור',
    'card.status.hours_unverified': 'שעות לא מאומתות',
    'card.action.navigate': 'נווט',
    'card.action.call': 'התקשר',
    'card.action.get_directions': 'קבל הוראות הגעה',
    'card.action.location_not_available': 'מיקום לא זמין',
    'card.action.call_restaurant': 'התקשר למסעדה',
    'card.action.phone_not_available': 'מספר טלפון לא זמין',
    'card.dietary.gluten_free': 'ללא גלוטן',
    'card.dietary.gluten_free_maybe': 'אולי ללא גלוטן',
    'card.dietary.gluten_free_disclaimer': 'מבוסס על רמזים בטקסט — לא מובטח',
    'card.badge.near_you': 'קרוב אליך',
    'card.hours.open_until': 'פתוח עד {time}',
    'card.distance.meters_short': 'מ׳',
    'card.distance.km_short': 'ק״מ',
    'card.distance.minutes_short': 'דק׳',
    'reason.best_match': 'התאמה הטובה ביותר',
    'reason.open_now': 'פתוח עכשיו',
    'reason.closest_option': 'האופציה הקרובה ביותר',
    'filter.open_now': '🟢 פתוח עכשיו',
    'filter.open_now_description': 'מציג רק מסעדות פתוחות עכשיו',
    'filter.gluten_free': 'ללא גלוטן (רמזים)',
    'filter.gluten_free_description': 'מבוסס על רמזים בטקסט — לא מובטח',
    'location.enable_prompt': 'הפעל מיקום לתוצאות טובות יותר',
    'results.loadMore': 'עוד {count}'
  },
  
  // Russian
  ru: {
    'card.status.open': 'Открыто сейчас',
    'card.status.closed': 'Закрыто',
    'card.status.hours_unverified': 'Часы не подтверждены',
    'card.action.navigate': 'Навигация',
    'card.action.call': 'Позвонить',
    'card.action.get_directions': 'Получить маршрут',
    'card.action.location_not_available': 'Местоположение недоступно',
    'card.action.call_restaurant': 'Позвонить в ресторан',
    'card.action.phone_not_available': 'Номер телефона недоступен',
    'card.dietary.gluten_free': 'БГ',
    'card.dietary.gluten_free_maybe': 'Возможно БГ',
    'card.dietary.gluten_free_disclaimer': 'На основе текстовых сигналов — не гарантируется',
    'card.badge.near_you': 'Рядом',
    'card.hours.open_until': 'Открыто до {time}',
    'card.distance.meters_short': 'м',
    'card.distance.km_short': 'км',
    'card.distance.minutes_short': 'мин',
    'reason.best_match': 'Лучшее совпадение',
    'reason.open_now': 'Открыто сейчас',
    'reason.closest_option': 'Ближайший вариант',
    'filter.open_now': '🟢 Открыто сейчас',
    'filter.open_now_description': 'Показаны только открытые рестораны',
    'filter.gluten_free': 'Без глютена (сигналы)',
    'filter.gluten_free_description': 'На основе текстовых сигналов — не гарантируется',
    'location.enable_prompt': 'Включить местоположение для лучших результатов',
    'results.loadMore': 'Показать ещё {count}'
  },
  
  // Arabic
  ar: {
    'card.status.open': 'مفتوح الآن',
    'card.status.closed': 'مغلق',
    'card.status.hours_unverified': 'الساعات غير مؤكدة',
    'card.action.navigate': 'التنقل',
    'card.action.call': 'اتصل',
    'card.action.get_directions': 'احصل على الاتجاهات',
    'card.action.location_not_available': 'الموقع غير متاح',
    'card.action.call_restaurant': 'اتصل بالمطعم',
    'card.action.phone_not_available': 'رقم الهاتف غير متاح',
    'card.dietary.gluten_free': 'خالٍ من الغلوتين',
    'card.dietary.gluten_free_maybe': 'ربما خالٍ من الغلوتين',
    'card.dietary.gluten_free_disclaimer': 'بناءً على إشارات نصية — غير مضمون',
    'card.badge.near_you': 'بالقرب منك',
    'card.hours.open_until': 'مفتوح حتى {time}',
    'card.distance.meters_short': 'م',
    'card.distance.km_short': 'كم',
    'card.distance.minutes_short': 'د',
    'reason.best_match': 'أفضل تطابق',
    'reason.open_now': 'مفتوح الآن',
    'reason.closest_option': 'الخيار الأقرب',
    'filter.open_now': '🟢 مفتوح الآن',
    'filter.open_now_description': 'يعرض المطاعم المفتوحة فقط الآن',
    'filter.gluten_free': 'خالٍ من الغلوتين (إشارات)',
    'filter.gluten_free_description': 'بناءً على إشارات نصية — غير مضمون',
    'location.enable_prompt': 'تمكين الموقع لنتائج أفضل',
    'results.loadMore': 'عرض {count} إضافية'
  },
  
  // French
  fr: {
    'card.status.open': 'Ouvert maintenant',
    'card.status.closed': 'Fermé',
    'card.status.hours_unverified': 'Horaires non vérifiés',
    'card.action.navigate': 'Naviguer',
    'card.action.call': 'Appeler',
    'card.action.get_directions': 'Obtenir l\'itinéraire',
    'card.action.location_not_available': 'Emplacement non disponible',
    'card.action.call_restaurant': 'Appeler le restaurant',
    'card.action.phone_not_available': 'Numéro de téléphone non disponible',
    'card.dietary.gluten_free': 'SG',
    'card.dietary.gluten_free_maybe': 'Peut-être SG',
    'card.dietary.gluten_free_disclaimer': 'Basé sur des signaux textuels — non garanti',
    'card.badge.near_you': 'Tout près',
    'card.hours.open_until': 'Ouvert jusqu\'à {time}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'reason.best_match': 'Meilleure correspondance',
    'reason.open_now': 'Ouvert maintenant',
    'reason.closest_option': 'Option la plus proche',
    'filter.open_now': '🟢 Ouvert maintenant',
    'filter.open_now_description': 'Affichage des restaurants ouverts uniquement',
    'filter.gluten_free': 'Sans gluten (signaux)',
    'filter.gluten_free_description': 'Basé sur des signaux textuels — non garanti',
    'location.enable_prompt': 'Activer la localisation pour de meilleurs résultats',
    'results.loadMore': 'Afficher {count} de plus'
  },
  
  // Spanish
  es: {
    'card.status.open': 'Abierto ahora',
    'card.status.closed': 'Cerrado',
    'card.status.hours_unverified': 'Horario no verificado',
    'card.action.navigate': 'Navegar',
    'card.action.call': 'Llamar',
    'card.action.get_directions': 'Obtener direcciones',
    'card.action.location_not_available': 'Ubicación no disponible',
    'card.action.call_restaurant': 'Llamar al restaurante',
    'card.action.phone_not_available': 'Número de teléfono no disponible',
    'card.dietary.gluten_free': 'SG',
    'card.dietary.gluten_free_maybe': 'Tal vez SG',
    'card.dietary.gluten_free_disclaimer': 'Basado en señales de texto — no garantizado',
    'card.badge.near_you': 'Cerca de ti',
    'card.hours.open_until': 'Abierto hasta {time}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'reason.best_match': 'Mejor coincidencia',
    'reason.open_now': 'Abierto ahora',
    'reason.closest_option': 'Opción más cercana',
    'filter.open_now': '🟢 Abierto ahora',
    'filter.open_now_description': 'Mostrando solo restaurantes abiertos ahora',
    'filter.gluten_free': 'Sin gluten (señales)',
    'filter.gluten_free_description': 'Basado en señales de texto — no garantizado',
    'location.enable_prompt': 'Activar ubicación para mejores resultados',
    'results.loadMore': 'Mostrar {count} más'
  },
  
  // German
  de: {
    'card.status.open': 'Jetzt geöffnet',
    'card.status.closed': 'Geschlossen',
    'card.status.hours_unverified': 'Öffnungszeiten unbestätigt',
    'card.action.navigate': 'Navigieren',
    'card.action.call': 'Anrufen',
    'card.action.get_directions': 'Route abrufen',
    'card.action.location_not_available': 'Standort nicht verfügbar',
    'card.action.call_restaurant': 'Restaurant anrufen',
    'card.action.phone_not_available': 'Telefonnummer nicht verfügbar',
    'card.dietary.gluten_free': 'GF',
    'card.dietary.gluten_free_maybe': 'Vielleicht GF',
    'card.dietary.gluten_free_disclaimer': 'Basierend auf Textsignalen — nicht garantiert',
    'card.badge.near_you': 'In der Nähe',
    'card.hours.open_until': 'Geöffnet bis {time}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'Min',
    'reason.best_match': 'Beste Übereinstimmung',
    'reason.open_now': 'Jetzt geöffnet',
    'reason.closest_option': 'Nächste Option',
    'filter.open_now': '🟢 Jetzt geöffnet',
    'filter.open_now_description': 'Zeigt nur jetzt geöffnete Restaurants',
    'filter.gluten_free': 'Glutenfrei (Signale)',
    'filter.gluten_free_description': 'Basierend auf Textsignalen — nicht garantiert',
    'location.enable_prompt': 'Standort aktivieren für bessere Ergebnisse',
    'results.loadMore': '{count} weitere anzeigen'
  },
  
  // Italian
  it: {
    'card.status.open': 'Aperto ora',
    'card.status.closed': 'Chiuso',
    'card.status.hours_unverified': 'Orari non verificati',
    'card.action.navigate': 'Naviga',
    'card.action.call': 'Chiama',
    'card.action.get_directions': 'Ottieni indicazioni',
    'card.action.location_not_available': 'Posizione non disponibile',
    'card.action.call_restaurant': 'Chiama il ristorante',
    'card.action.phone_not_available': 'Numero di telefono non disponibile',
    'card.dietary.gluten_free': 'SG',
    'card.dietary.gluten_free_maybe': 'Forse SG',
    'card.dietary.gluten_free_disclaimer': 'Basato su segnali testuali — non garantito',
    'card.badge.near_you': 'Vicino a te',
    'card.hours.open_until': 'Aperto fino alle {time}',
    'card.distance.meters_short': 'm',
    'card.distance.km_short': 'km',
    'card.distance.minutes_short': 'min',
    'reason.best_match': 'Migliore corrispondenza',
    'reason.open_now': 'Aperto ora',
    'reason.closest_option': 'Opzione più vicina',
    'filter.open_now': '🟢 Aperto ora',
    'filter.open_now_description': 'Mostra solo ristoranti aperti ora',
    'filter.gluten_free': 'Senza glutine (segnali)',
    'filter.gluten_free_description': 'Basato su segnali testuali — non garantito',
    'location.enable_prompt': 'Abilita posizione per risultati migliori',
    'results.loadMore': 'Mostra altre {count}'
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
