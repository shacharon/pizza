/**
 * @file Manages all user-facing strings for the application.
 * This service centralizes all prompts and messages, making it easy to manage
 * and localize the application's text.
 */

type Language = 'he' | 'en' | 'ar';

const prompts = {
    clarify_city: {
        he: 'באיזה עיר לחפש? למשל: תל אביב, ירושלים, חיפה. אפשר לכתוב כל עיר.',
        ar: 'في أي مدينة أبحث؟ مثلاً: تل أبيب، القدس، حيفا. يمكنك كتابة أي مدينة.',
        en: 'In which city should I search? For example: Tel Aviv, Jerusalem, Haifa. You can type any city.',
    },
    clarify_price: {
        he: 'איזה תקציב? למשל: עד 60 שקל, עד 100 שקל.',
        ar: 'ما هي الميزانية؟ مثلاً: حتى 60 شيكل، حتى 100 شيكل.',
        en: 'What\'s your budget? For example: up to ₪60, up to ₪100.',
    },
    clarify_not_food: {
        he: '"{param}" לא נשמע כמו אוכל. התכוונתי לחפש את זה, אבל עצרתי. אפשר לנסות סוג אוכל אחר?',
        ar: '"{param}" لا يبدو طعامًا. كنت سأبحث عنه، لكنني توقفت. هل يمكنك تجربة نوع آخر من الطعام؟',
        en: '"{param}" doesn\'t sound like a food. I was going to search for it, but I stopped. Could you try a different type of food?',
    }
};

export type PromptKey = keyof typeof prompts;

export class PromptManager {
    /**
     * Retrieves a prompt string for a given key and language.
     * @param key The identifier for the prompt.
     * @param language The target language.
     * @param param An optional parameter to substitute into the prompt string.
     * @returns The localized prompt string.
     */
    get(key: PromptKey, language: Language, param?: string): string {
        const promptSet = prompts[key];
        let text = promptSet[language] || promptSet.en;

        if (param && text.includes('{param}')) {
            text = text.replace('{param}', param);
        }

        return text;
    }
}

export const promptManager = new PromptManager();
