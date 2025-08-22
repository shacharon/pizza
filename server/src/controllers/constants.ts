export const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const INTENT_CONFIDENCE_MIN = 0.6;

export const MESSAGES = {
    missingMessage: 'message is required',
    refuse: 'I can only help with ordering food. Want me to find pizza, sushi, or burgers near you?',
    greeting: 'Hi! I can help order food. Which city and cuisine are you interested in?',
    clarify: 'Just to confirm—are you looking to order food? What city and budget should I use?',
    serverErrorFallback: 'Server error'
} as const;


