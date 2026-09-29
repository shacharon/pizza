import type { SupportedLang } from '../../../core/services/language.service';

const HERO_ABOUT: Record<'en' | 'he' | 'ar' | 'ru', readonly string[]> = {
  en: [
    'We built this so finding a place to eat feels like asking a friend.',
    'Say the dish, the walk, or the street. In your state, or in a city abroad.',
    'We turn those words into places on the map.'
  ],
  he: [
    'בנינו את זה כדי שמציאת מקום לאכול תרגיש כמו לשאול חבר.',
    'אמרו את המנה, ההליכה או הרחוב. במדינה שלך, או בעיר בחו״ל.',
    'אנחנו הופכים את המילים האלה למקומות על המפה.'
  ],
  ar: [
    'بنينا هذا ليكون إيجاد مكان للأكل كأنك تسأل صديقاً.',
    'قل الطبق أو المشي أو الشارع. في بلدك، أو في مدينة في الخارج.',
    'نحوّل هذه الكلمات إلى أماكن على الخريطة.'
  ],
  ru: [
    'Мы сделали это, чтобы поиск еды был как вопрос другу.',
    'Назовите блюдо, прогулку или улицу. В вашей стране или в городе за границей.',
    'Мы превращаем эти слова в места на карте.'
  ]
};

export function heroAboutLines(lang: SupportedLang): readonly string[] {
  if (lang === 'he' || lang === 'ar' || lang === 'ru') return HERO_ABOUT[lang];
  return HERO_ABOUT.en;
}
