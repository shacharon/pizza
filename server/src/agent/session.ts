import type { FoodQueryDTO } from "@api";

export interface SessionData {
    dto: FoodQueryDTO;
}

const store = new Map<string, SessionData>();

export function getSession(id: string): SessionData | undefined {
    return store.get(id);
}

export function setSession(id: string, data: SessionData): void {
    store.set(id, data);
}


