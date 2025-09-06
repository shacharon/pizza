import { ChatOpenAI } from "@langchain/openai";

function requireOpenAIKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    return key;
}

const llm = new ChatOpenAI({ apiKey: requireOpenAIKey(), model: "gpt-3.5-turbo", temperature: 0.3 });

export async function phraseResults(opts: { language: 'he' | 'en' | 'ar'; city: string; type?: 'pizza' | 'sushi' | 'burger' | 'other' | undefined; maxPrice?: number | null | undefined; names: string[]; }): Promise<string> {
    const { language, city, type, maxPrice, names } = opts;
    const top = names.slice(0, 5);
    const list = top.join(', ');
    const constraints = [type ? (language === 'he' ? (type === 'pizza' ? 'פיצה' : type === 'sushi' ? 'סושי' : type === 'burger' ? 'המבורגר' : 'אוכל') : type) : null, (maxPrice ? (language === 'he' ? `עד ₪${maxPrice}` : language === 'ar' ? `حتى ₪${maxPrice}` : `under ₪${maxPrice}`) : null)].filter(Boolean).join(', ');

    const prompts = {
        he: `נסה להיות עוזר אדיב וקצר. אמור: הנה תוצאות שמצאתי${constraints ? ` (${constraints})` : ''} ב-${city}: ${list}. אם תרצה, אפשר לדייק לפי סוג, מחיר או כשרות.`,
        ar: `كن مساعداً لبقاً ومختصراً. قل: هذه نتائج وجدتها${constraints ? ` (${constraints})` : ''} في ${city}: ${list}. إذا رغبت، يمكننا التضييق حسب النوع أو السعر أو الكاشير.`,
        en: `Be polite and concise. Say: Here are some places I found${constraints ? ` (${constraints})` : ''} in ${city}: ${list}. You can narrow it by type, price, or dietary preferences.`,
    } as const;

    const system = language === 'he' ? 'ענה בעברית.' : language === 'ar' ? 'أجب بالعربية.' : 'Answer in English.';
    const res = await llm.invoke([{ role: 'system', content: system }, { role: 'user', content: prompts[language] }]);
    return res.content?.toString?.() || prompts.en;
}


