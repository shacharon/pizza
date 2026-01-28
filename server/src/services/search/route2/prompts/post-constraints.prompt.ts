/**
 * Post-Constraints Prompt - Route2 Pipeline
 * 
 * LLM extracts post-Google constraints from user query
 */

import { createHash } from 'crypto';

export const POST_CONSTRAINTS_PROMPT_VERSION = 'post_constraints_v1';

/**
 * System Prompt for Post-Constraints Extraction
 */
export const POST_CONSTRAINTS_SYSTEM_PROMPT = `You extract search constraints from restaurant queries.

Output ONLY JSON with ALL fields (never omit any field):
{
  "openState": "OPEN_NOW"|"CLOSED_NOW"|"OPEN_AT"|"OPEN_BETWEEN"|null,
  "openAt": {"day": number|null, "timeHHmm": "HH:mm"|null} | null,
  "openBetween": {"day": number|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null} | null,
  "priceLevel": 1|2|3|4|null,
  "isKosher": true|false|null,
  "isGlutenFree": true|null,
  "requirements": {"accessible": true|false|null, "parking": true|false|null}
}

CRITICAL RULES:
1. When openAt or openBetween is an object, ALL keys MUST be present (use null for missing values)
2. NEVER output location, language, region, or confidence fields
3. Output ONLY the constraint fields above

──────────────────────────────────────────────────────────────────
FIELD DEFINITIONS:
──────────────────────────────────────────────────────────────────

openState (default: null):
• "OPEN_NOW": "פתוח עכשיו", "פתוחות עכשיו", "open now", "currently open"
• "CLOSED_NOW": "סגור עכשיו", "סגורות עכשיו", "closed now", "closed"
• "OPEN_AT": specific time → "פתוח ב-21:30", "open at 9pm"
• "OPEN_BETWEEN": time range → "פתוח בין 18:00-22:00", "open 6-10pm"
• null: no time constraint mentioned

openAt (null UNLESS openState="OPEN_AT"):
When openState="OPEN_AT", return object with ALL keys:
  {"day": 0-6|null, "timeHHmm": "HH:mm"|null}
• day: 0=Sunday, 1=Monday, ..., 6=Saturday (null if not specified)
• timeHHmm: "HH:mm" 24-hour format (e.g., "21:30", "09:00")
Examples:
  - "פתוח ב-21:30" → {"day": null, "timeHHmm": "21:30"}
  - "open tomorrow at 8pm" → {"day": <tomorrow>, "timeHHmm": "20:00"}
  - "פתוח ביום שישי ב-19:00" → {"day": 5, "timeHHmm": "19:00"}

openBetween (null UNLESS openState="OPEN_BETWEEN"):
When openState="OPEN_BETWEEN", return object with ALL keys:
  {"day": 0-6|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null}
Examples:
  - "פתוח בין 18:00-22:00" → {"day": null, "startHHmm": "18:00", "endHHmm": "22:00"}
  - "open Friday 6-10pm" → {"day": 5, "startHHmm": "18:00", "endHHmm": "22:00"}

priceLevel (default: null):
• 1: "$", "cheap", "זול", "budget"
• 2: "$$", "moderate", "בינוני", "mid-range"
• 3: "$$$", "expensive", "יקר"
• 4: "$$$$", "very expensive", "יקר מאוד", "fine dining"
• null: no price mentioned

isKosher (default: null):
• true: "כשר", "kosher", "כשרות"
• false: "לא כשר", "not kosher", "non-kosher" (rare, usually just omitted)
• null: not mentioned

isGlutenFree (default: null):
• true: "ללא גלוטן", "gluten-free", "gluten free", "sin gluten", "sans gluten", "celiac-friendly"
• NEVER set false
• null: not mentioned

requirements.accessible (default: null):
• true: "נגיש", "accessible", "wheelchair", "כיסא גלגלים"
• false: never set false
• null: not mentioned

requirements.parking (default: null):
• true: "חניה", "parking", "יש חניה", "with parking"
• false: never set false
• null: not mentioned

──────────────────────────────────────────────────────────────────
EXAMPLES:
──────────────────────────────────────────────────────────────────

Query: "מסעדות איטלקיות פתוחות עכשיו"
Output:
{
  "openState": "OPEN_NOW",
  "openAt": null,
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "isGlutenFree": null,
  "requirements": {"accessible": null, "parking": null}
}

Query: "cheap kosher pizza near me"
Output:
{
  "openState": null,
  "openAt": null,
  "openBetween": null,
  "priceLevel": 1,
  "isKosher": true,
  "isGlutenFree": null,
  "requirements": {"accessible": null, "parking": null}
}

Query: "מסעדה נגישה עם חניה פתוחה ב-20:00"
Output:
{
  "openState": "OPEN_AT",
  "openAt": {"day": null, "timeHHmm": "20:00"},
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "isGlutenFree": null,
  "requirements": {"accessible": true, "parking": true}
}

Query: "expensive restaurant open between 7-9pm Friday"
Output:
{
  "openState": "OPEN_BETWEEN",
  "openAt": null,
  "openBetween": {"day": 5, "startHHmm": "19:00", "endHHmm": "21:00"},
  "priceLevel": 3,
  "isKosher": null,
  "isGlutenFree": null,
  "requirements": {"accessible": null, "parking": null}
}

Query: "sushi in tel aviv"
Output:
{
  "openState": null,
  "openAt": null,
  "openBetween": null,
  "priceLevel": null,
  "isKosher": null,
  "isGlutenFree": null,
  "requirements": {"accessible": null, "parking": null}
}
`;

/**
 * Static JSON Schema for OpenAI Structured Outputs
 */
export const POST_CONSTRAINTS_JSON_SCHEMA = {
    type: "object",
    properties: {
        openState: {
            anyOf: [
                { type: "null" },
                { type: "string", enum: ["OPEN_NOW", "CLOSED_NOW", "OPEN_AT", "OPEN_BETWEEN"] }
            ]
        },
        openAt: {
            anyOf: [
                { type: "null" },
                {
                    type: "object",
                    properties: {
                        day: {
                            anyOf: [
                                { type: "null" },
                                { type: "integer", minimum: 0, maximum: 6 }
                            ]
                        },
                        timeHHmm: {
                            anyOf: [
                                { type: "null" },
                                { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }
                            ]
                        }
                    },
                    required: ["day", "timeHHmm"],
                    additionalProperties: false
                }
            ]
        },
        openBetween: {
            anyOf: [
                { type: "null" },
                {
                    type: "object",
                    properties: {
                        day: {
                            anyOf: [
                                { type: "null" },
                                { type: "integer", minimum: 0, maximum: 6 }
                            ]
                        },
                        startHHmm: {
                            anyOf: [
                                { type: "null" },
                                { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }
                            ]
                        },
                        endHHmm: {
                            anyOf: [
                                { type: "null" },
                                { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }
                            ]
                        }
                    },
                    required: ["day", "startHHmm", "endHHmm"],
                    additionalProperties: false
                }
            ]
        },
        priceLevel: {
            anyOf: [
                { type: "null" },
                { type: "integer", enum: [1, 2, 3, 4] }
            ]
        },
        isKosher: {
            anyOf: [
                { type: "null" },
                { type: "boolean" }
            ]
        },
        isGlutenFree: {
            anyOf: [
                { type: "null" },
                { type: "boolean" }
            ]
        },
        requirements: {
            type: "object",
            properties: {
                accessible: {
                    anyOf: [
                        { type: "null" },
                        { type: "boolean" }
                    ]
                },
                parking: {
                    anyOf: [
                        { type: "null" },
                        { type: "boolean" }
                    ]
                }
            },
            required: ["accessible", "parking"],
            additionalProperties: false
        }
    },
    required: ["openState", "openAt", "openBetween", "priceLevel", "isKosher", "isGlutenFree", "requirements"],
    additionalProperties: false
} as const;

/**
 * Schema Hash (for observability)
 */
export const POST_CONSTRAINTS_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(POST_CONSTRAINTS_JSON_SCHEMA))
    .digest('hex')
    .substring(0, 12);

/**
 * Prompt Hash (for versioning)
 */
export const POST_CONSTRAINTS_PROMPT_HASH = createHash('sha256')
    .update(POST_CONSTRAINTS_SYSTEM_PROMPT, 'utf8')
    .digest('hex');
