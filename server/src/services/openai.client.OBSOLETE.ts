import 'dotenv/config';
import OpenAI from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
    // Do not throw here to allow health checks to pass; server.ts validates env
}

export const openai = new OpenAI({ apiKey });


