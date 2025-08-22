import type { FoodQueryDTO, SearchResultDTO } from "@api";

export interface Context {
    query: FoodQueryDTO;
    results?: SearchResultDTO;
    lastMessage?: string;
}

export const hasCity = (q: FoodQueryDTO) => !!q.city?.trim();
export const missingAnyOf = (q: FoodQueryDTO, keys: (keyof FoodQueryDTO)[]) =>
    keys.some(k => (q as any)[k] === undefined || (q as any)[k] === null);

export const coreKnown = (q: FoodQueryDTO) =>
    hasCity(q) && q.type !== undefined;


