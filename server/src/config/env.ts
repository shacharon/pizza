import dotenv from 'dotenv';

dotenv.config();

export function getConfig() {
    const port = Number(process.env.PORT || 3000);
    const openaiApiKey = process.env.OPENAI_API_KEY;
    return { port, openaiApiKey };
}


