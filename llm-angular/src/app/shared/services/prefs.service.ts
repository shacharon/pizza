import { Injectable } from '@angular/core';

export type LanguagePref = 'mirror' | 'he' | 'en';

@Injectable({ providedIn: 'root' })
export class PrefsService {
    private readonly key = 'chat_prefs_v1';

    load(): { language?: LanguagePref; chips?: any; lastMessage?: string } {
        try {
            const raw = localStorage.getItem(this.key);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    save(partial: { language?: LanguagePref; chips?: any; lastMessage?: string }): void {
        try {
            const cur = this.load();
            const next = { ...cur, ...partial };
            localStorage.setItem(this.key, JSON.stringify(next));
        } catch { }
    }
}


