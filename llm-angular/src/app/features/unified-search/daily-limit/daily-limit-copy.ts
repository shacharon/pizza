export type DailyLimitLang = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'de' | 'it' | 'am';

export interface DailyLimitCopy {
  lang: DailyLimitLang;
  dir: 'rtl' | 'ltr';
  title: string;
  body: string;
}

const COPY: Record<DailyLimitLang, DailyLimitCopy> = {
  en: {
    lang: 'en',
    dir: 'ltr',
    title: 'Daily limit',
    body: 'You can make up to 40 calls per day.'
  },
  he: {
    lang: 'he',
    dir: 'rtl',
    title: 'הגבלה יומית',
    body: 'אפשר לבצע עד 40 קריאות ביום.'
  },
  ar: {
    lang: 'ar',
    dir: 'rtl',
    title: 'الحد اليومي',
    body: 'يمكنك إجراء ما يصل إلى 40 طلباً في اليوم.'
  },
  ru: {
    lang: 'ru',
    dir: 'ltr',
    title: 'Дневной лимит',
    body: 'Можно сделать до 40 запросов в день.'
  },
  fr: {
    lang: 'fr',
    dir: 'ltr',
    title: 'Limite du jour',
    body: 'Vous pouvez faire jusqu’à 40 appels par jour.'
  },
  es: {
    lang: 'es',
    dir: 'ltr',
    title: 'Límite diario',
    body: 'Puedes hacer hasta 40 llamadas al día.'
  },
  de: {
    lang: 'de',
    dir: 'ltr',
    title: 'Tageslimit',
    body: 'Du kannst bis zu 40 Anfragen pro Tag stellen.'
  },
  it: {
    lang: 'it',
    dir: 'ltr',
    title: 'Limite giornaliero',
    body: 'Puoi fare fino a 40 richieste al giorno.'
  },
  am: {
    lang: 'am',
    dir: 'ltr',
    title: 'የቀን ገደብ',
    body: 'በቀን እስከ 40 ጥሪዎች ማድረግ ትችላለህ።'
  }
};

/** Language of the search text, then the daily-limit sentence in that language. */
export function dailyLimitCopy(query: string): DailyLimitCopy {
  return COPY[languageOfQuery(query)];
}

export function isDailyModelLimit(message: string | undefined, code?: string): boolean {
  if (code === 'MODEL_BUDGET_EXCEEDED') return true;
  const text = (message || '').trim();
  return text === 'Try again later'
    || text.startsWith('MODEL_BUDGET_EXCEEDED')
    || text.endsWith('Try again later');
}

function languageOfQuery(query: string): DailyLimitLang {
  let hebrew = 0;
  let arabic = 0;
  let cyrillic = 0;
  let ethiopic = 0;
  let latin = 0;
  for (const char of query || '') {
    if (/[\u0590-\u05FF]/.test(char)) hebrew++;
    else if (/[\u0600-\u06FF]/.test(char)) arabic++;
    else if (/[\u0400-\u04FF]/.test(char)) cyrillic++;
    else if (/[\u1200-\u137F]/.test(char)) ethiopic++;
    else if (/[A-Za-z]/.test(char)) latin++;
  }
  const top = Math.max(hebrew, arabic, cyrillic, ethiopic, latin);
  if (top === 0) return 'en';
  if (hebrew === top) return 'he';
  if (arabic === top) return 'ar';
  if (cyrillic === top) return 'ru';
  if (ethiopic === top) return 'am';
  return latinLanguage(query);
}

function latinLanguage(query: string): DailyLimitLang {
  const text = query.toLowerCase();
  if (/[äöüß]/.test(text) || /\b(und|nicht|mit|für|näh?e)\b/.test(text)) return 'de';
  if (/[ñ¿¡]/.test(text) || /\b(restaurante|cerca|comida)\b/.test(text)) return 'es';
  if (/[ìò]/.test(text) || /\b(ristorante|vicino|cucina|senza)\b/.test(text)) return 'it';
  if (/[çœ]/.test(text) || /\b(près|avec|pour|dans|une|des)\b/.test(text) || /[éèêàù]/.test(text)) return 'fr';
  return 'en';
}
