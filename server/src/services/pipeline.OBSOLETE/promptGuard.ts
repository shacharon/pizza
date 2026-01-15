import type { Request } from 'express';

export type GuardDecision =
    | { allow: true }
    | { allow: false; reason: string; reply: string };

const URL_REGEX = /(https?:\/\/\S+|www\.[^\s]+)/i;
const CODE_BLOCK = /```[\s\S]*?```/;
const JAILBREAK = /(ignore.*instructions|disregard.*rules|pretend.*|jailbreak|system prompt)/i;
const OFF_DOMAIN = /(weather|crypto|stock|program|code|leetcode|math|job|resume|politics|news)/i;

export function promptGuardPreFilter(message: string, lang: 'mirror' | 'he' | 'en' = 'mirror'): GuardDecision {
    const trimmed = (message || '').trim();
    if (!trimmed) {
        return { allow: false, reason: 'empty', reply: polite(lang, 'Please write what you would like to order (e.g., "pizza in Tel Aviv up to ₪60").') };
    }
    if (trimmed.length > 4000) {
        return { allow: false, reason: 'too_long', reply: polite(lang, 'The message is too long. Please be concise and stay on food ordering.') };
    }
    if (URL_REGEX.test(trimmed)) {
        return { allow: false, reason: 'url_only', reply: polite(lang, 'Please describe the food you want; links are not needed.') };
    }
    if (CODE_BLOCK.test(trimmed)) {
        return { allow: false, reason: 'code_block', reply: polite(lang, 'I can only help with ordering food, not with code.') };
    }
    if (JAILBREAK.test(trimmed)) {
        return { allow: false, reason: 'jailbreak', reply: polite(lang, 'I can only help with food ordering. What city and cuisine should I use?') };
    }
    if (OFF_DOMAIN.test(trimmed)) {
        return { allow: false, reason: 'off_domain', reply: polite(lang, 'I only handle food ordering. What city and price range?') };
    }
    return { allow: true };
}

export function foodOnlyPolicy(lang: 'mirror' | 'he' | 'en' = 'mirror'): string {
    const base = 'You are a food-ordering agent. Only help with ordering food. Refuse other topics politely and steer back to city/cuisine/budget/ETA.';
    const examples = [
        'User: Solve 2x+3=7\nAssistant: Sorry, I can only help with food ordering. What city and cuisine?',
        'User: Write code for a React app\nAssistant: Sorry, I can only help with food ordering. What city and budget?',
        'User: What happened in the news today?\nAssistant: Sorry, I can only help with food ordering. Prefer pizza, sushi, or burgers?',
        'User: Personal life advice\nAssistant: Sorry, I can only help with food ordering. What would you like to eat?'
    ].join('\n');
    return `${base}\n\nRefusal examples (style to copy):\n${examples}`;
}

function polite(lang: 'mirror' | 'he' | 'en', en: string): string {
    if (lang === 'he') return 'אני יכולה לעזור רק בהזמנת אוכל. באיזה עיר ואיזה מטבח לחפש?';
    return en;
}


