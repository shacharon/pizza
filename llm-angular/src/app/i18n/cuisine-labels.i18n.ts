/**
 * Cuisine Labels i18n Module
 * Translations for cuisine types and categories
 * 
 * Supported languages: en, he, fr, es, ru, ar, it, ja
 * Each cuisine has an emoji and localized label
 */

import type { UiLang } from './ui-strings.i18n';

export interface CuisineLabel {
  emoji: string;
  label: string;
}

// Cuisine type keys
export type CuisineKey =
  | 'sushi'
  | 'pizza'
  | 'italian'
  | 'burger'
  | 'chinese'
  | 'indian'
  | 'mexican'
  | 'japanese'
  | 'thai'
  | 'mediterranean'
  | 'american'
  | 'asian'
  | 'middle_eastern'
  | 'seafood'
  | 'steakhouse'
  | 'vegan'
  | 'vegetarian'
  | 'cafe'
  | 'bar'
  | 'bakery'
  | 'dessert'
  | 'restaurant'; // Generic fallback

// Cuisine labels dictionary
export const CUISINE_LABELS: Record<UiLang, Record<CuisineKey, CuisineLabel>> = {
  // English
  en: {
    sushi: { emoji: '🍣', label: 'Sushi' },
    pizza: { emoji: '🍕', label: 'Pizza' },
    italian: { emoji: '🍝', label: 'Italian' },
    burger: { emoji: '🍔', label: 'Burger' },
    chinese: { emoji: '🥡', label: 'Chinese' },
    indian: { emoji: '🍛', label: 'Indian' },
    mexican: { emoji: '🌮', label: 'Mexican' },
    japanese: { emoji: '🍱', label: 'Japanese' },
    thai: { emoji: '🍜', label: 'Thai' },
    mediterranean: { emoji: '🥙', label: 'Mediterranean' },
    american: { emoji: '🍔', label: 'American' },
    asian: { emoji: '🥢', label: 'Asian' },
    middle_eastern: { emoji: '🥙', label: 'Middle Eastern' },
    seafood: { emoji: '🦞', label: 'Seafood' },
    steakhouse: { emoji: '🥩', label: 'Steakhouse' },
    vegan: { emoji: '🌱', label: 'Vegan' },
    vegetarian: { emoji: '🥗', label: 'Vegetarian' },
    cafe: { emoji: '☕', label: 'Cafe' },
    bar: { emoji: '🍺', label: 'Bar' },
    bakery: { emoji: '🥐', label: 'Bakery' },
    dessert: { emoji: '🍰', label: 'Dessert' },
    restaurant: { emoji: '🍽️', label: 'Restaurant' },
  },

  // Hebrew (עברית)
  he: {
    sushi: { emoji: '🍣', label: 'סושי' },
    pizza: { emoji: '🍕', label: 'פיצה' },
    italian: { emoji: '🍝', label: 'איטלקי' },
    burger: { emoji: '🍔', label: 'המבורגר' },
    chinese: { emoji: '🥡', label: 'סיני' },
    indian: { emoji: '🍛', label: 'הודי' },
    mexican: { emoji: '🌮', label: 'מקסיקני' },
    japanese: { emoji: '🍱', label: 'יפני' },
    thai: { emoji: '🍜', label: 'תאילנדי' },
    mediterranean: { emoji: '🥙', label: 'ים תיכוני' },
    american: { emoji: '🍔', label: 'אמריקאי' },
    asian: { emoji: '🥢', label: 'אסייתי' },
    middle_eastern: { emoji: '🥙', label: 'מזרח תיכוני' },
    seafood: { emoji: '🦞', label: 'פירות ים' },
    steakhouse: { emoji: '🥩', label: 'בשרים' },
    vegan: { emoji: '🌱', label: 'טבעוני' },
    vegetarian: { emoji: '🥗', label: 'צמחוני' },
    cafe: { emoji: '☕', label: 'בית קפה' },
    bar: { emoji: '🍺', label: 'בר' },
    bakery: { emoji: '🥐', label: 'מאפייה' },
    dessert: { emoji: '🍰', label: 'קינוחים' },
    restaurant: { emoji: '🍽️', label: 'מסעדה' },
  },

  // French (Français)
  fr: {
    sushi: { emoji: '🍣', label: 'Sushi' },
    pizza: { emoji: '🍕', label: 'Pizza' },
    italian: { emoji: '🍝', label: 'Italien' },
    burger: { emoji: '🍔', label: 'Burger' },
    chinese: { emoji: '🥡', label: 'Chinois' },
    indian: { emoji: '🍛', label: 'Indien' },
    mexican: { emoji: '🌮', label: 'Mexicain' },
    japanese: { emoji: '🍱', label: 'Japonais' },
    thai: { emoji: '🍜', label: 'Thaï' },
    mediterranean: { emoji: '🥙', label: 'Méditerranéen' },
    american: { emoji: '🍔', label: 'Américain' },
    asian: { emoji: '🥢', label: 'Asiatique' },
    middle_eastern: { emoji: '🥙', label: 'Moyen-Orient' },
    seafood: { emoji: '🦞', label: 'Fruits de mer' },
    steakhouse: { emoji: '🥩', label: 'Steakhouse' },
    vegan: { emoji: '🌱', label: 'Végétalien' },
    vegetarian: { emoji: '🥗', label: 'Végétarien' },
    cafe: { emoji: '☕', label: 'Café' },
    bar: { emoji: '🍺', label: 'Bar' },
    bakery: { emoji: '🥐', label: 'Boulangerie' },
    dessert: { emoji: '🍰', label: 'Dessert' },
    restaurant: { emoji: '🍽️', label: 'Restaurant' },
  },

  // Spanish (Español)
  es: {
    sushi: { emoji: '🍣', label: 'Sushi' },
    pizza: { emoji: '🍕', label: 'Pizza' },
    italian: { emoji: '🍝', label: 'Italiano' },
    burger: { emoji: '🍔', label: 'Hamburguesa' },
    chinese: { emoji: '🥡', label: 'Chino' },
    indian: { emoji: '🍛', label: 'Indio' },
    mexican: { emoji: '🌮', label: 'Mexicano' },
    japanese: { emoji: '🍱', label: 'Japonés' },
    thai: { emoji: '🍜', label: 'Tailandés' },
    mediterranean: { emoji: '🥙', label: 'Mediterráneo' },
    american: { emoji: '🍔', label: 'Americano' },
    asian: { emoji: '🥢', label: 'Asiático' },
    middle_eastern: { emoji: '🥙', label: 'Medio Oriente' },
    seafood: { emoji: '🦞', label: 'Mariscos' },
    steakhouse: { emoji: '🥩', label: 'Asador' },
    vegan: { emoji: '🌱', label: 'Vegano' },
    vegetarian: { emoji: '🥗', label: 'Vegetariano' },
    cafe: { emoji: '☕', label: 'Café' },
    bar: { emoji: '🍺', label: 'Bar' },
    bakery: { emoji: '🥐', label: 'Panadería' },
    dessert: { emoji: '🍰', label: 'Postre' },
    restaurant: { emoji: '🍽️', label: 'Restaurante' },
  },

  // Russian (Русский)
  ru: {
    sushi: { emoji: '🍣', label: 'Суши' },
    pizza: { emoji: '🍕', label: 'Пицца' },
    italian: { emoji: '🍝', label: 'Итальянская' },
    burger: { emoji: '🍔', label: 'Бургеры' },
    chinese: { emoji: '🥡', label: 'Китайская' },
    indian: { emoji: '🍛', label: 'Индийская' },
    mexican: { emoji: '🌮', label: 'Мексиканская' },
    japanese: { emoji: '🍱', label: 'Японская' },
    thai: { emoji: '🍜', label: 'Тайская' },
    mediterranean: { emoji: '🥙', label: 'Средиземноморская' },
    american: { emoji: '🍔', label: 'Американская' },
    asian: { emoji: '🥢', label: 'Азиатская' },
    middle_eastern: { emoji: '🥙', label: 'Ближневосточная' },
    seafood: { emoji: '🦞', label: 'Морепродукты' },
    steakhouse: { emoji: '🥩', label: 'Стейкхаус' },
    vegan: { emoji: '🌱', label: 'Веганская' },
    vegetarian: { emoji: '🥗', label: 'Вегетарианская' },
    cafe: { emoji: '☕', label: 'Кафе' },
    bar: { emoji: '🍺', label: 'Бар' },
    bakery: { emoji: '🥐', label: 'Пекарня' },
    dessert: { emoji: '🍰', label: 'Десерты' },
    restaurant: { emoji: '🍽️', label: 'Ресторан' },
  },

  // Arabic (العربية)
  ar: {
    sushi: { emoji: '🍣', label: 'سوشي' },
    pizza: { emoji: '🍕', label: 'بيتزا' },
    italian: { emoji: '🍝', label: 'إيطالي' },
    burger: { emoji: '🍔', label: 'برغر' },
    chinese: { emoji: '🥡', label: 'صيني' },
    indian: { emoji: '🍛', label: 'هندي' },
    mexican: { emoji: '🌮', label: 'مكسيكي' },
    japanese: { emoji: '🍱', label: 'ياباني' },
    thai: { emoji: '🍜', label: 'تايلندي' },
    mediterranean: { emoji: '🥙', label: 'متوسطي' },
    american: { emoji: '🍔', label: 'أمريكي' },
    asian: { emoji: '🥢', label: 'آسيوي' },
    middle_eastern: { emoji: '🥙', label: 'شرق أوسطي' },
    seafood: { emoji: '🦞', label: 'مأكولات بحرية' },
    steakhouse: { emoji: '🥩', label: 'ستيك هاوس' },
    vegan: { emoji: '🌱', label: 'نباتي' },
    vegetarian: { emoji: '🥗', label: 'نباتي' },
    cafe: { emoji: '☕', label: 'مقهى' },
    bar: { emoji: '🍺', label: 'بار' },
    bakery: { emoji: '🥐', label: 'مخبز' },
    dessert: { emoji: '🍰', label: 'حلويات' },
    restaurant: { emoji: '🍽️', label: 'مطعم' },
  },

  // Italian (Italiano)
  it: {
    sushi: { emoji: '🍣', label: 'Sushi' },
    pizza: { emoji: '🍕', label: 'Pizza' },
    italian: { emoji: '🍝', label: 'Italiano' },
    burger: { emoji: '🍔', label: 'Hamburger' },
    chinese: { emoji: '🥡', label: 'Cinese' },
    indian: { emoji: '🍛', label: 'Indiano' },
    mexican: { emoji: '🌮', label: 'Messicano' },
    japanese: { emoji: '🍱', label: 'Giapponese' },
    thai: { emoji: '🍜', label: 'Thailandese' },
    mediterranean: { emoji: '🥙', label: 'Mediterraneo' },
    american: { emoji: '🍔', label: 'Americano' },
    asian: { emoji: '🥢', label: 'Asiatico' },
    middle_eastern: { emoji: '🥙', label: 'Medio Orientale' },
    seafood: { emoji: '🦞', label: 'Pesce' },
    steakhouse: { emoji: '🥩', label: 'Steakhouse' },
    vegan: { emoji: '🌱', label: 'Vegano' },
    vegetarian: { emoji: '🥗', label: 'Vegetariano' },
    cafe: { emoji: '☕', label: 'Caffè' },
    bar: { emoji: '🍺', label: 'Bar' },
    bakery: { emoji: '🥐', label: 'Panetteria' },
    dessert: { emoji: '🍰', label: 'Dolci' },
    restaurant: { emoji: '🍽️', label: 'Ristorante' },
  },

  // Japanese (日本語)
  ja: {
    sushi: { emoji: '🍣', label: '寿司' },
    pizza: { emoji: '🍕', label: 'ピザ' },
    italian: { emoji: '🍝', label: 'イタリアン' },
    burger: { emoji: '🍔', label: 'ハンバーガー' },
    chinese: { emoji: '🥡', label: '中華' },
    indian: { emoji: '🍛', label: 'インド料理' },
    mexican: { emoji: '🌮', label: 'メキシカン' },
    japanese: { emoji: '🍱', label: '和食' },
    thai: { emoji: '🍜', label: 'タイ料理' },
    mediterranean: { emoji: '🥙', label: '地中海料理' },
    american: { emoji: '🍔', label: 'アメリカン' },
    asian: { emoji: '🥢', label: 'アジアン' },
    middle_eastern: { emoji: '🥙', label: '中東料理' },
    seafood: { emoji: '🦞', label: 'シーフード' },
    steakhouse: { emoji: '🥩', label: 'ステーキハウス' },
    vegan: { emoji: '🌱', label: 'ヴィーガン' },
    vegetarian: { emoji: '🥗', label: 'ベジタリアン' },
    cafe: { emoji: '☕', label: 'カフェ' },
    bar: { emoji: '🍺', label: 'バー' },
    bakery: { emoji: '🥐', label: 'ベーカリー' },
    dessert: { emoji: '🍰', label: 'デザート' },
    restaurant: { emoji: '🍽️', label: 'レストラン' },
  },
};

/**
 * Get cuisine label for a given tag and language
 * Matches cuisine keywords in tags and returns localized label with emoji
 * 
 * @param tags - Array of tags from restaurant
 * @param lang - Language code
 * @returns Formatted cuisine string (emoji + label) or fallback
 */
export function getCuisineLabel(tags: string[], lang: UiLang): string {
  if (!tags || tags.length === 0) {
    return formatCuisine('restaurant', lang);
  }

  // Try to match each tag against known cuisine keys
  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();

    // Try direct key match
    for (const cuisineKey of Object.keys(CUISINE_LABELS.en) as CuisineKey[]) {
      if (normalized.includes(cuisineKey)) {
        return formatCuisine(cuisineKey, lang);
      }
    }
  }

  // Fallback to restaurant
  return formatCuisine('restaurant', lang);
}

/**
 * Format cuisine with emoji and label
 */
function formatCuisine(key: CuisineKey, lang: UiLang): string {
  const cuisine = CUISINE_LABELS[lang][key];
  return `${cuisine.emoji} ${cuisine.label}`;
}

/**
 * Get cuisine label object (emoji + label separately)
 */
export function getCuisineLabelObject(tags: string[], lang: UiLang): CuisineLabel {
  if (!tags || tags.length === 0) {
    return CUISINE_LABELS[lang].restaurant;
  }

  for (const tag of tags) {
    const normalized = tag.toLowerCase().trim();

    for (const cuisineKey of Object.keys(CUISINE_LABELS.en) as CuisineKey[]) {
      if (normalized.includes(cuisineKey)) {
        return CUISINE_LABELS[lang][cuisineKey];
      }
    }
  }

  return CUISINE_LABELS[lang].restaurant;
}
