import { ChatOpenAI } from "@langchain/openai";
import type { ExtractedSlots } from './nlu.service.js';

function requireOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    return key;
}

const llm = new ChatOpenAI({ apiKey: requireOpenAIKey(), model: "gpt-3.5-turbo", temperature: 0.3 });

// Track recent responses to avoid repetition
const recentResponses = new Map<string, { response: string; timestamp: number; count: number }>();
const lastTemplateIndex = new Map<string, number>();

export async function phraseResults(opts: {
    language: 'he' | 'en' | 'ar';
    topResultName?: string;
    currentSlots: ExtractedSlots;
    previousSlots: ExtractedSlots | null;
    names: string[];
    sessionId?: string;
}): Promise<string> {
    const { language, topResultName, currentSlots, previousSlots, names, sessionId = 'default' } = opts;

    // Success/failure context
    const hasResults = names.length > 0;
    const resultCount = names.length;
    const { city, type, maxPrice, dietary } = currentSlots;

    // 1. Delta Tracking: What changed from the last query?
    let deltaPhrase = '';
    if (previousSlots) {
        const deltas = [];
        if (city && city !== previousSlots.city) deltas.push(language === 'he' ? `עכשיו ב${city}` : `now in ${city}`);
        if (type && type !== previousSlots.type) deltas.push(language === 'he' ? `ל${type}` : `for ${type}`);
        if (maxPrice && maxPrice !== previousSlots.maxPrice) deltas.push(language === 'he' ? `עד ₪${maxPrice}` : `under ₪${maxPrice}`);
        if (dietary.length > 0 && dietary.join() !== previousSlots.dietary.join()) deltas.push(dietary.join(', '));

        if (deltas.length > 0) {
            const deltaIntros = language === 'he' ? ['סבבה, עדכנתי ', 'הבנתי, שיניתי '] : language === 'ar' ? ['حسنًا، تم التحديث ', 'فهمت، تم التغيير '] : ['Okay, updated ', 'Got it, switched '];
            deltaPhrase = `${deltaIntros[Math.floor(Math.random() * deltaIntros.length)]}${deltas.join(', ')}. `;
        }
    }

    // 2. Build constraint description
    const constraints = [
        type,
        ...(maxPrice ? [language === 'he' ? `עד ₪${maxPrice}` : language === 'ar' ? `حتى ${maxPrice}₪` : `under ₪${maxPrice}`] : []),
        ...(dietary || [])
    ].filter(Boolean);
    const constraintText = constraints.length > 0 ? ` (${constraints.join(', ')})` : '';

    // Check for recent similar responses
    const contextKey = `${sessionId}-${resultCount}-${constraintText}`;
    const recent = recentResponses.get(contextKey);
    const now = Date.now();

    // Clean old entries (older than 5 minutes)
    for (const [key, value] of recentResponses.entries()) {
        if (now - value.timestamp > 300000) {
            recentResponses.delete(key);
        }
    }

    // 3. Generate varied responses based on context and repetition
    const templates = {
        he: {
            noResults: [
                `לא מצאתי שום דבר${constraintText} ב${city}. אולי ננסה חיפוש אחר?`,
                `אין תוצאות${constraintText} ב${city}. אפשר לנסות להרחיב את החיפוש.`,
            ],
            results: [
                `מצאתי ${resultCount} מקומות${constraintText} ב${city}. למשל, יש את ${topResultName}.`,
                `יש ${resultCount} אפשרויות${constraintText} ב${city}, כולל ${topResultName}.`,
                `קבל ${resultCount} תוצאות${constraintText} ב${city}. הראשונה היא ${topResultName}.`
            ],
            fewResults: [
                `מצאתי רק ${resultCount} מקומות${constraintText} ב${city}. למשל ${topResultName}.`,
                `יש רק ${resultCount} אופציות${constraintText} ב${city}, כמו ${topResultName}.`
            ],
            manyResults: [
                `מצאתי ${resultCount} מקומות${constraintText} ב${city}! למשל, ${topResultName}. יש המון אופציות.`,
                `יש ${resultCount} תוצאות${constraintText} ב${city}, הראשונה היא ${topResultName}. שווה לבדוק.`,
            ],
            rephrasedSameResults: [
                `עדיין ${resultCount} תוצאות${constraintText}. לא משהו חדש.`,
                `זה לא שינה את מספר התוצאות, עדיין ${resultCount}${constraintText}.`,
            ]
        },
        en: {
            noResults: [
                `I couldn't find anything for${constraintText} in ${city}. Maybe try a different search?`,
                `No results found for${constraintText} in ${city}. Let's try broadening the search.`,
            ],
            results: [
                `Found ${resultCount} places${constraintText} in ${city}. For example, there's ${topResultName}.`,
                `Got ${resultCount} options${constraintText} in ${city}, including ${topResultName}.`,
                `Here are ${resultCount} results${constraintText} in ${city}. The top one is ${topResultName}.`
            ],
            fewResults: [
                `Found just ${resultCount} places${constraintText} in ${city}, like ${topResultName}.`,
                `Only ${resultCount} options${constraintText} in ${city}, such as ${topResultName}.`
            ],
            manyResults: [
                `Found ${resultCount} places${constraintText} in ${city}! For instance, ${topResultName}. Lots of options.`,
                `Got ${resultCount} results${constraintText} in ${city}, starting with ${topResultName}. Worth a look.`,
            ],
            rephrasedSameResults: [
                `Still ${resultCount} results${constraintText}. Nothing new to show.`,
                `That didn't change the result count, still at ${resultCount}${constraintText}.`,
            ]
        },
        ar: {
            noResults: [
                `لم أجد أي شيء لـ${constraintText} في ${city}. ربما تجرب بحثًا مختلفًا؟`,
                `لا توجد نتائج لـ${constraintText} في ${city}. لنجرب توسيع البحث.`,
            ],
            results: [
                `وجدت ${resultCount} أماكن${constraintText} في ${city}. على سبيل المثال، هناك ${topResultName}.`,
                `لدي ${resultCount} خيارات${constraintText} في ${city}، بما في ذلك ${topResultName}.`,
                `إليك ${resultCount} نتائج${constraintText} في ${city}. الأفضل هو ${topResultName}.`
            ],
            fewResults: [
                `وجدت فقط ${resultCount} أماكن${constraintText} في ${city}، مثل ${topResultName}.`,
                `فقط ${resultCount} خيارات${constraintText} في ${city}، مثل ${topResultName}.`
            ],
            manyResults: [
                `وجدت ${resultCount} أماكن${constraintText} في ${city}! على سبيل المثال، ${topResultName}. الكثير من الخيارات.`,
                `لدي ${resultCount} نتائج${constraintText} في ${city}، بدءًا من ${topResultName}. تستحق إلقاء نظرة.`,
            ],
            rephrasedSameResults: [
                `لا تزال ${resultCount} نتائج${constraintText}. لا شيء جديد لعرضه.`,
                `ذلك لم يغير عدد النتائج، لا يزال عند ${resultCount}${constraintText}.`,
            ]
        }
    };

    const langTemplates = templates[language] || templates.en;
    let promptPool: string[];

    const isSameResultCount = recent?.response && recent.count > 0;

    if (!hasResults) {
        promptPool = langTemplates.noResults;
    } else if (isSameResultCount) {
        promptPool = langTemplates.rephrasedSameResults;
    } else if (resultCount <= 3) {
        promptPool = langTemplates.fewResults;
    } else if (resultCount >= 8) {
        promptPool = langTemplates.manyResults;
    } else {
        promptPool = langTemplates.results;
    }

    // 4. Select response with rotation
    let currentTemplateIndex = lastTemplateIndex.get(sessionId) ?? -1;
    currentTemplateIndex = (currentTemplateIndex + 1) % promptPool.length;
    lastTemplateIndex.set(sessionId, currentTemplateIndex);
    const selectedPrompt = promptPool[currentTemplateIndex] || promptPool[0];


    // Update tracking
    recentResponses.set(contextKey, {
        response: selectedPrompt || '',
        timestamp: now,
        count: (recent?.count || 0) + 1
    });

    return `${deltaPhrase}${selectedPrompt}`;
}


