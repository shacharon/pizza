import dotenv from 'dotenv';

dotenv.config();

export function getConfig() {
    const port = Number(process.env.PORT || 3000);

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const googleApiKey = process.env.GOOGLE_API_KEY;

    if (!openaiApiKey) {
        console.warn('[Config] OPENAI_API_KEY is missing');
    }
    if (!googleApiKey) {
        console.warn('[Config] GOOGLE_API_KEY is missing');
    }

    return { port, openaiApiKey, googleApiKey };
}
