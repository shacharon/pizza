/**
 * "לא כשר" drops a place only when the name itself says it is kosher.
 * A place with no kosher word in the name stays.
 */

const NOT_KOSHER_PHRASE = /לא[\s-]*כשר(?:ה|י?ה)?|non[-\s]?kosher|not\s+kosher/i;

export function queryAsksNotKosher(query: string | undefined | null): boolean {
  if (!query) return false;
  return NOT_KOSHER_PHRASE.test(query);
}

export function placeNameIsClearlyKosher(name: string | undefined | null): boolean {
  if (!name) return false;
  const withoutNegation = name.replace(new RegExp(NOT_KOSHER_PHRASE.source, 'gi'), ' ');
  if (/מהדרין|כשרה|כשירה|הכשרה|בד["״']?ץ/.test(withoutNegation)) return true;
  if (/כשר/.test(withoutNegation)) return true;
  if (/\bkosher\b/i.test(withoutNegation) || /\bmehadrin\b/i.test(withoutNegation)) return true;
  return false;
}
