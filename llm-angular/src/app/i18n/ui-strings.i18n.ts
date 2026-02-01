/**
 * UI Strings i18n Module
 * Comprehensive translations for all UI elements in the restaurant search app
 * 
 * Supported languages: en, he, fr, es, ru, ar, it, ja
 * Fallback: English (en)
 * 
 * USAGE:
 * import { t } from './ui-strings.i18n';
 * const label = t(lang, 'card.openNow');
 */

// Supported language codes
export type UiLang = 'he' | 'en' | 'fr' | 'es' | 'ru' | 'ar' | 'it' | 'ja';

// All UI string keys
export type UiKey =
  // Restaurant card
  | 'card.viewDetails'
  | 'card.photoAlt'
  | 'card.photoPlaceholder'
  | 'card.rating'
  | 'card.priceLevel'
  | 'card.reviews'
  | 'card.navigate'
  | 'card.navigateTo'
  | 'card.locationNotAvailable'
  | 'card.call'
  | 'card.callRestaurant'
  | 'card.phoneNotAvailable'
  | 'card.save'
  | 'card.saveToFavorites'
  | 'card.openNow'
  | 'card.closed'
  | 'card.hoursUnverified'
  | 'card.glutenFree'
  | 'card.maybeGlutenFree'
  | 'card.glutenFreeTooltip'
  | 'card.restaurantFallback'
  | 'card.locationFallback'

  // Reason labels
  | 'reason.bestMatch'
  | 'reason.closestOption'

  // Search bar
  | 'searchBar.ariaLabel'
  | 'searchBar.loading'
  | 'searchBar.clearSearch'

  // Assistant
  | 'assistant.quickPicks'
  | 'assistant.refine'
  | 'assistant.clearMessages'
  | 'assistant.primaryAction'
  | 'assistant.action'

  // Actions
  | 'action.openedMaps'
  | 'action.failedToOpenMaps'
  | 'action.openedDialer'
  | 'action.noPhoneNumber'
  | 'action.phoneNotAvailable'
  | 'action.failedToOpenDialer'
  | 'action.openedWebsite'
  | 'action.openedSearchResults'
  | 'action.failedToOpenWebsite'
  | 'action.shareText'
  | 'action.sharedSuccessfully'
  | 'action.copiedToClipboard'
  | 'action.failedToShare'
  | 'action.savedToFavorites'
  | 'action.failedToSaveFavorite'

  // Common
  | 'common.close'
  | 'common.clear';

// Message dictionary
export const UI_STRINGS: Record<UiLang, Record<UiKey, string>> = {
  // English (fallback)
  en: {
    // Restaurant card
    'card.viewDetails': 'View details for',
    'card.photoAlt': 'restaurant photo',
    'card.photoPlaceholder': 'Placeholder image for',
    'card.rating': 'Rating:',
    'card.priceLevel': 'Price level:',
    'card.reviews': 'reviews',
    'card.navigate': 'Navigate to restaurant',
    'card.navigateTo': 'Navigate to',
    'card.locationNotAvailable': 'Location not available',
    'card.call': 'Call restaurant',
    'card.callRestaurant': 'Call',
    'card.phoneNotAvailable': 'Phone number not available',
    'card.save': 'Save to favorites',
    'card.saveToFavorites': 'Save to favorites',
    'card.openNow': 'Open now',
    'card.closed': 'Closed',
    'card.hoursUnverified': 'Hours unverified',
    'card.glutenFree': 'GF',
    'card.maybeGlutenFree': 'Maybe GF',
    'card.glutenFreeTooltip': 'Based on text signals — not guaranteed',
    'card.restaurantFallback': 'Restaurant',
    'card.locationFallback': 'Location',

    // Reason labels
    'reason.bestMatch': 'Best match',
    'reason.closestOption': 'Closest option',

    // Search bar
    'searchBar.ariaLabel': 'Search for restaurants',
    'searchBar.loading': 'Loading',
    'searchBar.clearSearch': 'Clear search',

    // Assistant
    'assistant.quickPicks': 'Quick Picks',
    'assistant.refine': 'Refine',
    'assistant.clearMessages': 'Clear messages',
    'assistant.primaryAction': 'Primary action:',
    'assistant.action': 'Action:',

    // Actions
    'action.openedMaps': 'Opened Google Maps',
    'action.failedToOpenMaps': 'Failed to open maps',
    'action.openedDialer': 'Opened phone dialer',
    'action.noPhoneNumber': 'No phone number',
    'action.phoneNotAvailable': 'Phone number not available',
    'action.failedToOpenDialer': 'Failed to open dialer',
    'action.openedWebsite': 'Opened website',
    'action.openedSearchResults': 'Opened search results',
    'action.failedToOpenWebsite': 'Failed to open website',
    'action.shareText': 'Check out {name} at {address}',
    'action.sharedSuccessfully': 'Shared successfully',
    'action.copiedToClipboard': 'Copied to clipboard',
    'action.failedToShare': 'Failed to share',
    'action.savedToFavorites': 'Saved to favorites',
    'action.failedToSaveFavorite': 'Failed to save favorite',

    // Common
    'common.close': 'Close',
    'common.clear': 'Clear',
  },

  // Hebrew (עברית)
  he: {
    // Restaurant card
    'card.viewDetails': 'הצג פרטים עבור',
    'card.photoAlt': 'תמונת מסעדה',
    'card.photoPlaceholder': 'תמונה זמנית עבור',
    'card.rating': 'דירוג:',
    'card.priceLevel': 'רמת מחיר:',
    'card.reviews': 'ביקורות',
    'card.navigate': 'נווט למסעדה',
    'card.navigateTo': 'נווט ל',
    'card.locationNotAvailable': 'המיקום לא זמין',
    'card.call': 'התקשר למסעדה',
    'card.callRestaurant': 'התקשר',
    'card.phoneNotAvailable': 'מספר טלפון לא זמין',
    'card.save': 'שמור למועדפים',
    'card.saveToFavorites': 'שמור למועדפים',
    'card.openNow': 'פתוח עכשיו',
    'card.closed': 'סגור עכשיו',
    'card.hoursUnverified': 'שעות לא מאומתות',
    'card.glutenFree': 'ללא גלוטן',
    'card.maybeGlutenFree': 'אולי ללא גלוטן',
    'card.glutenFreeTooltip': 'מבוסס על רמזים בטקסט — לא מובטח',
    'card.restaurantFallback': 'מסעדה',
    'card.locationFallback': 'מיקום',

    // Reason labels
    'reason.bestMatch': 'התאמה הכי טובה',
    'reason.closestOption': 'האופציה הקרובה ביותר',

    // Search bar
    'searchBar.ariaLabel': 'חפש מסעדות',
    'searchBar.loading': 'טוען',
    'searchBar.clearSearch': 'נקה חיפוש',

    // Assistant
    'assistant.quickPicks': 'בחירות מהירות',
    'assistant.refine': 'שפר',
    'assistant.clearMessages': 'נקה הודעות',
    'assistant.primaryAction': 'פעולה עיקרית:',
    'assistant.action': 'פעולה:',

    // Actions
    'action.openedMaps': 'נפתח ב-Google Maps',
    'action.failedToOpenMaps': 'נכשל לפתוח מפות',
    'action.openedDialer': 'נפתח חייגן',
    'action.noPhoneNumber': 'אין מספר טלפון',
    'action.phoneNotAvailable': 'מספר טלפון לא זמין',
    'action.failedToOpenDialer': 'נכשל לפתוח חייגן',
    'action.openedWebsite': 'נפתח אתר',
    'action.openedSearchResults': 'נפתחו תוצאות חיפוש',
    'action.failedToOpenWebsite': 'נכשל לפתוח אתר',
    'action.shareText': 'תבדוק את {name} ב-{address}',
    'action.sharedSuccessfully': 'שותף בהצלחה',
    'action.copiedToClipboard': 'הועתק ללוח',
    'action.failedToShare': 'נכשל לשתף',
    'action.savedToFavorites': 'נשמר למועדפים',
    'action.failedToSaveFavorite': 'נכשל לשמור למועדפים',

    // Common
    'common.close': 'סגור',
    'common.clear': 'נקה',
  },

  // French (Français)
  fr: {
    // Restaurant card
    'card.viewDetails': 'Voir les détails de',
    'card.photoAlt': 'photo du restaurant',
    'card.photoPlaceholder': 'Image temporaire pour',
    'card.rating': 'Note:',
    'card.priceLevel': 'Niveau de prix:',
    'card.reviews': 'avis',
    'card.navigate': 'Naviguer vers le restaurant',
    'card.navigateTo': 'Naviguer vers',
    'card.locationNotAvailable': 'Emplacement non disponible',
    'card.call': 'Appeler le restaurant',
    'card.callRestaurant': 'Appeler',
    'card.phoneNotAvailable': 'Numéro de téléphone non disponible',
    'card.save': 'Enregistrer dans les favoris',
    'card.saveToFavorites': 'Enregistrer dans les favoris',
    'card.openNow': 'Ouvert maintenant',
    'card.closed': 'Fermé',
    'card.hoursUnverified': 'Horaires non vérifiés',
    'card.glutenFree': 'Sans gluten',
    'card.maybeGlutenFree': 'Peut-être sans gluten',
    'card.glutenFreeTooltip': 'Basé sur des indices textuels — non garanti',
    'card.restaurantFallback': 'Restaurant',
    'card.locationFallback': 'Emplacement',

    // Reason labels
    'reason.bestMatch': 'Meilleure correspondance',
    'reason.closestOption': 'Option la plus proche',

    // Search bar
    'searchBar.ariaLabel': 'Rechercher des restaurants',
    'searchBar.loading': 'Chargement',
    'searchBar.clearSearch': 'Effacer la recherche',

    // Assistant
    'assistant.quickPicks': 'Sélections rapides',
    'assistant.refine': 'Affiner',
    'assistant.clearMessages': 'Effacer les messages',
    'assistant.primaryAction': 'Action principale:',
    'assistant.action': 'Action:',

    // Actions
    'action.openedMaps': 'Ouvert dans Google Maps',
    'action.failedToOpenMaps': 'Échec de l\'ouverture des cartes',
    'action.openedDialer': 'Ouverture du composeur',
    'action.noPhoneNumber': 'Pas de numéro de téléphone',
    'action.phoneNotAvailable': 'Numéro de téléphone non disponible',
    'action.failedToOpenDialer': 'Échec de l\'ouverture du composeur',
    'action.openedWebsite': 'Site web ouvert',
    'action.openedSearchResults': 'Résultats de recherche ouverts',
    'action.failedToOpenWebsite': 'Échec de l\'ouverture du site web',
    'action.shareText': 'Découvrez {name} à {address}',
    'action.sharedSuccessfully': 'Partagé avec succès',
    'action.copiedToClipboard': 'Copié dans le presse-papiers',
    'action.failedToShare': 'Échec du partage',
    'action.savedToFavorites': 'Enregistré dans les favoris',
    'action.failedToSaveFavorite': 'Échec de l\'enregistrement du favori',

    // Common
    'common.close': 'Fermer',
    'common.clear': 'Effacer',
  },

  // Spanish (Español)
  es: {
    // Restaurant card
    'card.viewDetails': 'Ver detalles de',
    'card.photoAlt': 'foto del restaurante',
    'card.photoPlaceholder': 'Imagen temporal para',
    'card.rating': 'Calificación:',
    'card.priceLevel': 'Nivel de precio:',
    'card.reviews': 'reseñas',
    'card.navigate': 'Navegar al restaurante',
    'card.navigateTo': 'Navegar a',
    'card.locationNotAvailable': 'Ubicación no disponible',
    'card.call': 'Llamar al restaurante',
    'card.callRestaurant': 'Llamar',
    'card.phoneNotAvailable': 'Número de teléfono no disponible',
    'card.save': 'Guardar en favoritos',
    'card.saveToFavorites': 'Guardar en favoritos',
    'card.openNow': 'Abierto ahora',
    'card.closed': 'Cerrado',
    'card.hoursUnverified': 'Horarios no verificados',
    'card.glutenFree': 'Sin gluten',
    'card.maybeGlutenFree': 'Tal vez sin gluten',
    'card.glutenFreeTooltip': 'Basado en señales de texto — no garantizado',
    'card.restaurantFallback': 'Restaurante',
    'card.locationFallback': 'Ubicación',

    // Reason labels
    'reason.bestMatch': 'Mejor opción',
    'reason.closestOption': 'Opción más cercana',

    // Search bar
    'searchBar.ariaLabel': 'Buscar restaurantes',
    'searchBar.loading': 'Cargando',
    'searchBar.clearSearch': 'Borrar búsqueda',

    // Assistant
    'assistant.quickPicks': 'Selecciones rápidas',
    'assistant.refine': 'Refinar',
    'assistant.clearMessages': 'Borrar mensajes',
    'assistant.primaryAction': 'Acción principal:',
    'assistant.action': 'Acción:',

    // Actions
    'action.openedMaps': 'Abierto en Google Maps',
    'action.failedToOpenMaps': 'Error al abrir mapas',
    'action.openedDialer': 'Marcador abierto',
    'action.noPhoneNumber': 'Sin número de teléfono',
    'action.phoneNotAvailable': 'Número de teléfono no disponible',
    'action.failedToOpenDialer': 'Error al abrir marcador',
    'action.openedWebsite': 'Sitio web abierto',
    'action.openedSearchResults': 'Resultados de búsqueda abiertos',
    'action.failedToOpenWebsite': 'Error al abrir sitio web',
    'action.shareText': 'Echa un vistazo a {name} en {address}',
    'action.sharedSuccessfully': 'Compartido exitosamente',
    'action.copiedToClipboard': 'Copiado al portapapeles',
    'action.failedToShare': 'Error al compartir',
    'action.savedToFavorites': 'Guardado en favoritos',
    'action.failedToSaveFavorite': 'Error al guardar favorito',

    // Common
    'common.close': 'Cerrar',
    'common.clear': 'Borrar',
  },

  // Russian (Русский)
  ru: {
    // Restaurant card
    'card.viewDetails': 'Посмотреть детали',
    'card.photoAlt': 'фото ресторана',
    'card.photoPlaceholder': 'Временное изображение для',
    'card.rating': 'Рейтинг:',
    'card.priceLevel': 'Уровень цен:',
    'card.reviews': 'отзывов',
    'card.navigate': 'Навигация к ресторану',
    'card.navigateTo': 'Навигация к',
    'card.locationNotAvailable': 'Местоположение недоступно',
    'card.call': 'Позвонить в ресторан',
    'card.callRestaurant': 'Позвонить',
    'card.phoneNotAvailable': 'Номер телефона недоступен',
    'card.save': 'Сохранить в избранное',
    'card.saveToFavorites': 'Сохранить в избранное',
    'card.openNow': 'Открыто сейчас',
    'card.closed': 'Закрыто',
    'card.hoursUnverified': 'Часы не проверены',
    'card.glutenFree': 'Без глютена',
    'card.maybeGlutenFree': 'Возможно без глютена',
    'card.glutenFreeTooltip': 'На основе текстовых подсказок — не гарантировано',
    'card.restaurantFallback': 'Ресторан',
    'card.locationFallback': 'Местоположение',

    // Reason labels
    'reason.bestMatch': 'Лучшее совпадение',
    'reason.closestOption': 'Ближайший вариант',

    // Search bar
    'searchBar.ariaLabel': 'Поиск ресторанов',
    'searchBar.loading': 'Загрузка',
    'searchBar.clearSearch': 'Очистить поиск',

    // Assistant
    'assistant.quickPicks': 'Быстрый выбор',
    'assistant.refine': 'Уточнить',
    'assistant.clearMessages': 'Очистить сообщения',
    'assistant.primaryAction': 'Основное действие:',
    'assistant.action': 'Действие:',

    // Actions
    'action.openedMaps': 'Открыто в Google Maps',
    'action.failedToOpenMaps': 'Не удалось открыть карты',
    'action.openedDialer': 'Набиратель открыт',
    'action.noPhoneNumber': 'Нет номера телефона',
    'action.phoneNotAvailable': 'Номер телефона недоступен',
    'action.failedToOpenDialer': 'Не удалось открыть набиратель',
    'action.openedWebsite': 'Сайт открыт',
    'action.openedSearchResults': 'Результаты поиска открыты',
    'action.failedToOpenWebsite': 'Не удалось открыть сайт',
    'action.shareText': 'Посмотрите {name} по адресу {address}',
    'action.sharedSuccessfully': 'Успешно поделились',
    'action.copiedToClipboard': 'Скопировано в буфер обмена',
    'action.failedToShare': 'Не удалось поделиться',
    'action.savedToFavorites': 'Сохранено в избранное',
    'action.failedToSaveFavorite': 'Не удалось сохранить в избранное',

    // Common
    'common.close': 'Закрыть',
    'common.clear': 'Очистить',
  },

  // Arabic (العربية)
  ar: {
    // Restaurant card
    'card.viewDetails': 'عرض التفاصيل لـ',
    'card.photoAlt': 'صورة المطعم',
    'card.photoPlaceholder': 'صورة مؤقتة لـ',
    'card.rating': 'التقييم:',
    'card.priceLevel': 'مستوى السعر:',
    'card.reviews': 'مراجعات',
    'card.navigate': 'الانتقال إلى المطعم',
    'card.navigateTo': 'الانتقال إلى',
    'card.locationNotAvailable': 'الموقع غير متاح',
    'card.call': 'الاتصال بالمطعم',
    'card.callRestaurant': 'اتصل',
    'card.phoneNotAvailable': 'رقم الهاتف غير متاح',
    'card.save': 'حفظ في المفضلة',
    'card.saveToFavorites': 'حفظ في المفضلة',
    'card.openNow': 'مفتوح الآن',
    'card.closed': 'مغلق',
    'card.hoursUnverified': 'الساعات غير موثقة',
    'card.glutenFree': 'خالي من الغلوتين',
    'card.maybeGlutenFree': 'ربما خالي من الغلوتين',
    'card.glutenFreeTooltip': 'بناءً على إشارات النص — غير مضمون',
    'card.restaurantFallback': 'مطعم',
    'card.locationFallback': 'الموقع',

    // Reason labels
    'reason.bestMatch': 'أفضل تطابق',
    'reason.closestOption': 'الخيار الأقرب',

    // Search bar
    'searchBar.ariaLabel': 'البحث عن مطاعم',
    'searchBar.loading': 'جاري التحميل',
    'searchBar.clearSearch': 'مسح البحث',

    // Assistant
    'assistant.quickPicks': 'اختيارات سريعة',
    'assistant.refine': 'تحسين',
    'assistant.clearMessages': 'مسح الرسائل',
    'assistant.primaryAction': 'الإجراء الأساسي:',
    'assistant.action': 'الإجراء:',

    // Actions
    'action.openedMaps': 'تم الفتح في Google Maps',
    'action.failedToOpenMaps': 'فشل فتح الخرائط',
    'action.openedDialer': 'تم فتح الهاتف',
    'action.noPhoneNumber': 'لا يوجد رقم هاتف',
    'action.phoneNotAvailable': 'رقم الهاتف غير متاح',
    'action.failedToOpenDialer': 'فشل فتح الهاتف',
    'action.openedWebsite': 'تم فتح الموقع',
    'action.openedSearchResults': 'تم فتح نتائج البحث',
    'action.failedToOpenWebsite': 'فشل فتح الموقع',
    'action.shareText': 'تحقق من {name} في {address}',
    'action.sharedSuccessfully': 'تمت المشاركة بنجاح',
    'action.copiedToClipboard': 'تم النسخ إلى الحافظة',
    'action.failedToShare': 'فشلت المشاركة',
    'action.savedToFavorites': 'تم الحفظ في المفضلة',
    'action.failedToSaveFavorite': 'فشل الحفظ في المفضلة',

    // Common
    'common.close': 'إغلاق',
    'common.clear': 'مسح',
  },

  // Italian (Italiano)
  it: {
    // Restaurant card
    'card.viewDetails': 'Visualizza dettagli per',
    'card.photoAlt': 'foto del ristorante',
    'card.photoPlaceholder': 'Immagine temporanea per',
    'card.rating': 'Valutazione:',
    'card.priceLevel': 'Livello di prezzo:',
    'card.reviews': 'recensioni',
    'card.navigate': 'Naviga verso il ristorante',
    'card.navigateTo': 'Naviga verso',
    'card.locationNotAvailable': 'Posizione non disponibile',
    'card.call': 'Chiama il ristorante',
    'card.callRestaurant': 'Chiama',
    'card.phoneNotAvailable': 'Numero di telefono non disponibile',
    'card.save': 'Salva nei preferiti',
    'card.saveToFavorites': 'Salva nei preferiti',
    'card.openNow': 'Aperto ora',
    'card.closed': 'Chiuso',
    'card.hoursUnverified': 'Orari non verificati',
    'card.glutenFree': 'Senza glutine',
    'card.maybeGlutenFree': 'Forse senza glutine',
    'card.glutenFreeTooltip': 'Basato su segnali testuali — non garantito',
    'card.restaurantFallback': 'Ristorante',
    'card.locationFallback': 'Posizione',

    // Reason labels
    'reason.bestMatch': 'Migliore corrispondenza',
    'reason.closestOption': 'Opzione più vicina',

    // Search bar
    'searchBar.ariaLabel': 'Cerca ristoranti',
    'searchBar.loading': 'Caricamento',
    'searchBar.clearSearch': 'Cancella ricerca',

    // Assistant
    'assistant.quickPicks': 'Selezioni rapide',
    'assistant.refine': 'Affina',
    'assistant.clearMessages': 'Cancella messaggi',
    'assistant.primaryAction': 'Azione principale:',
    'assistant.action': 'Azione:',

    // Actions
    'action.openedMaps': 'Aperto in Google Maps',
    'action.failedToOpenMaps': 'Errore nell\'apertura delle mappe',
    'action.openedDialer': 'Dialer aperto',
    'action.noPhoneNumber': 'Nessun numero di telefono',
    'action.phoneNotAvailable': 'Numero di telefono non disponibile',
    'action.failedToOpenDialer': 'Errore nell\'apertura del dialer',
    'action.openedWebsite': 'Sito web aperto',
    'action.openedSearchResults': 'Risultati di ricerca aperti',
    'action.failedToOpenWebsite': 'Errore nell\'apertura del sito web',
    'action.shareText': 'Dai un\'occhiata a {name} in {address}',
    'action.sharedSuccessfully': 'Condiviso con successo',
    'action.copiedToClipboard': 'Copiato negli appunti',
    'action.failedToShare': 'Errore nella condivisione',
    'action.savedToFavorites': 'Salvato nei preferiti',
    'action.failedToSaveFavorite': 'Errore nel salvataggio del preferito',

    // Common
    'common.close': 'Chiudi',
    'common.clear': 'Cancella',
  },

  // Japanese (日本語)
  ja: {
    // Restaurant card
    'card.viewDetails': '詳細を表示',
    'card.photoAlt': 'レストランの写真',
    'card.photoPlaceholder': '一時的な画像',
    'card.rating': '評価:',
    'card.priceLevel': '価格帯:',
    'card.reviews': 'レビュー',
    'card.navigate': 'レストランへ移動',
    'card.navigateTo': 'へ移動',
    'card.locationNotAvailable': '場所が利用できません',
    'card.call': 'レストランに電話',
    'card.callRestaurant': '電話',
    'card.phoneNotAvailable': '電話番号が利用できません',
    'card.save': 'お気に入りに保存',
    'card.saveToFavorites': 'お気に入りに保存',
    'card.openNow': '営業中',
    'card.closed': '閉店',
    'card.hoursUnverified': '営業時間未確認',
    'card.glutenFree': 'グルテンフリー',
    'card.maybeGlutenFree': 'グルテンフリーの可能性',
    'card.glutenFreeTooltip': 'テキスト信号に基づく — 保証なし',
    'card.restaurantFallback': 'レストラン',
    'card.locationFallback': '場所',

    // Reason labels
    'reason.bestMatch': '最適',
    'reason.closestOption': '最寄り',

    // Search bar
    'searchBar.ariaLabel': 'レストランを検索',
    'searchBar.loading': '読み込み中',
    'searchBar.clearSearch': '検索をクリア',

    // Assistant
    'assistant.quickPicks': 'クイック選択',
    'assistant.refine': '絞り込み',
    'assistant.clearMessages': 'メッセージをクリア',
    'assistant.primaryAction': '主要アクション:',
    'assistant.action': 'アクション:',

    // Actions
    'action.openedMaps': 'Google Mapsを開きました',
    'action.failedToOpenMaps': 'マップを開けませんでした',
    'action.openedDialer': 'ダイヤラーを開きました',
    'action.noPhoneNumber': '電話番号なし',
    'action.phoneNotAvailable': '電話番号が利用できません',
    'action.failedToOpenDialer': 'ダイヤラーを開けませんでした',
    'action.openedWebsite': 'ウェブサイトを開きました',
    'action.openedSearchResults': '検索結果を開きました',
    'action.failedToOpenWebsite': 'ウェブサイトを開けませんでした',
    'action.shareText': '{name}（{address}）をチェック',
    'action.sharedSuccessfully': '共有しました',
    'action.copiedToClipboard': 'クリップボードにコピーしました',
    'action.failedToShare': '共有できませんでした',
    'action.savedToFavorites': 'お気に入りに保存しました',
    'action.failedToSaveFavorite': 'お気に入りに保存できませんでした',

    // Common
    'common.close': '閉じる',
    'common.clear': 'クリア',
  },
};

/**
 * Translate a UI key to a given language
 * 
 * @param lang - Language code (he|en|ru|ar|fr|es|it|ja)
 * @param key - UI string key
 * @param vars - Optional variables for interpolation (e.g., {name: 'John'})
 * @returns Translated string with interpolated variables
 */
export function tUi(lang: UiLang, key: UiKey, vars?: Record<string, string | number>): string {
  // Get message from dictionary
  let message = UI_STRINGS[lang]?.[key];

  // Fallback to English if message not found in current language
  if (!message && lang !== 'en') {
    console.warn(`[ui-i18n] Missing translation for key "${key}" in language "${lang}", falling back to English`);
    message = UI_STRINGS.en[key];
  }

  // Final fallback: return key itself if not found
  if (!message) {
    console.error(`[ui-i18n] Missing translation for key "${key}" in all languages`);
    return key;
  }

  // Apply variable interpolation (simple {var} replacement)
  if (vars) {
    Object.keys(vars).forEach(varKey => {
      const placeholder = `{${varKey}}`;
      message = message.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(vars[varKey]));
    });
  }

  return message;
}

/**
 * Check if a language is supported
 */
export function isUiLangSupported(lang: string): lang is UiLang {
  return ['he', 'en', 'ru', 'ar', 'fr', 'es', 'it', 'ja'].includes(lang);
}

/**
 * Get RTL status for a language
 * Hebrew and Arabic are RTL languages
 */
export function isRTL(lang: UiLang): boolean {
  return lang === 'he' || lang === 'ar';
}

/**
 * Normalize language code from backend to UiLang type
 * Maps common language codes to our supported set
 */
export function normalizeUiLang(langCode: string | undefined): UiLang {
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
    case 'it':
      return 'it';
    case 'ja':
      return 'ja';
    default:
      return 'en'; // Default fallback to English
  }
}
