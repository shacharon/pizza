const HEBREW = /[\u0590-\u05FF]/;
const ARABIC = /[\u0600-\u06FF]/;
const CYRILLIC = /[\u0400-\u04FF]/;

/** Hebrew, Arabic, or Russian when those letters are on the keyboard. Otherwise leave the browser language. */
export function languageFromKeyboardSample(sample: string): 'he' | 'ar' | 'ru' | null {
  if (HEBREW.test(sample)) return 'he';
  if (ARABIC.test(sample)) return 'ar';
  if (CYRILLIC.test(sample)) return 'ru';
  return null;
}

type LayoutMap = { forEach: (fn: (value: string) => void) => void };

export async function readKeyboardSample(): Promise<string> {
  if (typeof navigator === 'undefined') return '';
  const keyboard = (navigator as Navigator & {
    keyboard?: { getLayoutMap?: () => Promise<LayoutMap> };
  }).keyboard;
  if (!keyboard?.getLayoutMap) return '';
  const map = await keyboard.getLayoutMap();
  let sample = '';
  map.forEach((value) => {
    sample += value;
  });
  return sample;
}
