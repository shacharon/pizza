/**
 * After Google returns a wide list, drop a place that clearly breaks the dish
 * or the city the person typed. Keep the list if the drop would empty it.
 * A gluten-free name moves to the front. It is not removed.
 */

export interface ShapedPlace {
  name?: string | null;
  address?: string | null;
}

const DISHES: Array<{ id: string; query: RegExp; name: RegExp }> = [
  { id: 'falafel', query: /פלאפל|falafel/i, name: /פלאפל|falafel/i },
  { id: 'fish', query: /דגים|\bדג\b|fish|seafood/i, name: /דג|fish|seafood/i },
  { id: 'pizza', query: /פיצה|pizza|piza/i, name: /פיצה|pizza/i },
  { id: 'burger', query: /המבורגר|בורגר|burger/i, name: /המבורגר|בורגר|burger/i },
  { id: 'hummus', query: /חומוס|hummus/i, name: /חומוס|hummus/i },
  { id: 'pasta', query: /פסטה|pasta/i, name: /פסטה|pasta/i },
  { id: 'sushi', query: /סושי|sushi/i, name: /סושי|sushi/i },
  { id: 'coffee', query: /קפה|coffee|\bcafe\b/i, name: /קפה|coffee|\bcafe\b/i },
  { id: 'skewers', query: /שיפוד/i, name: /שיפוד/i },
  { id: 'meat', query: /בשר|steak/i, name: /בשר|steak|סטייק/i }
];

const PLACES: Array<{ id: string; needles: string[] }> = [
  { id: 'maale', needles: ['מעלה אדומים', 'maale adumim', "ma'ale adumim"] },
  { id: 'emek', needles: ['עמק חפר', 'emek hefer'] },
  { id: 'jerusalem', needles: ['ירושלים', 'jerusalem', 'קטמון'] },
  { id: 'telaviv', needles: ['תל אביב', 'תל-אביב', 'tel aviv'] },
  { id: 'haifa', needles: ['חיפה', 'haifa'] },
  { id: 'petah', needles: ['פתח תקווה', 'פתח תקוה', 'petah tikva'] },
  { id: 'rosh', needles: ['ראש העין'] },
  { id: 'beit', needles: ['בית שאן'] },
  { id: 'athens', needles: ['אתונה', 'athens'] },
  { id: 'belgrade', needles: ['בלגרד', 'belgrade'] }
];

const GLUTEN = /ללא גלוטן|גלוטן|gluten[-\s]?free|celiac|צליאק/i;

export function queryAsksGlutenFree(query: string | undefined | null): boolean {
  return GLUTEN.test(query || '');
}

export function nameSaysGlutenFree(name: string | undefined | null): boolean {
  return GLUTEN.test(name || '');
}

function askedDishes(query: string): string[] {
  return DISHES.filter((dish) => dish.query.test(query)).map((dish) => dish.id);
}

function nameDishes(name: string): string[] {
  return DISHES.filter((dish) => dish.name.test(name)).map((dish) => dish.id);
}

export function placeConflictsWithDish(name: string | undefined | null, query: string): boolean {
  const asked = askedDishes(query || '');
  if (asked.length === 0) return false;
  const found = nameDishes(name || '');
  if (found.length === 0) return false;
  if (found.some((id) => asked.includes(id))) return false;
  return true;
}

function placeIdIn(text: string | undefined | null): string | null {
  const hay = (text || '').toLowerCase();
  if (!hay.trim()) return null;
  for (const place of PLACES) {
    if (place.needles.some((needle) => hay.includes(needle.toLowerCase()))) return place.id;
  }
  return null;
}

export function askedPlaceId(query: string, cityText?: string | null): string | null {
  return placeIdIn(cityText) || placeIdIn(query);
}

export function addressIsOtherPlace(address: string | undefined | null, askedId: string | null): boolean {
  if (!askedId) return false;
  const found = placeIdIn(address);
  if (!found) return false;
  return found !== askedId;
}

export function shapeResultList<T extends ShapedPlace>(
  results: T[],
  query: string,
  cityText?: string | null
): { results: T[]; removedDish: number; removedCity: number } {
  const askedId = askedPlaceId(query, cityText);
  let next = results;

  const dishKept = next.filter((place) => !placeConflictsWithDish(place.name, query));
  const removedDish = dishKept.length > 0 && dishKept.length < next.length ? next.length - dishKept.length : 0;
  if (removedDish > 0) next = dishKept;

  const cityKept = next.filter((place) => !addressIsOtherPlace(place.address, askedId));
  const removedCity = cityKept.length > 0 && cityKept.length < next.length ? next.length - cityKept.length : 0;
  if (removedCity > 0) next = cityKept;

  if (queryAsksGlutenFree(query)) {
    const front = next.filter((place) => nameSaysGlutenFree(place.name));
    const rest = next.filter((place) => !nameSaysGlutenFree(place.name));
    next = [...front, ...rest];
  }

  return { results: next, removedDish, removedCity };
}
