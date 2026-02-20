/**
 * Post-Constraints Prompt - Route2 Pipeline
 * 
 * LLM extracts post-Google constraints from user query
 */

import { createHash } from 'crypto';

export const POST_CONSTRAINTS_PROMPT_VERSION = 'post_constraints_v1';

/**
 * System Prompt for Post-Constraints Extraction
 * Compact: JSON shape + minimal rules only (no long examples).
 */
export const POST_CONSTRAINTS_SYSTEM_PROMPT = `You extract search constraints from the user payload (query, uiLanguage, regionCode, optional top candidates).

Output ONLY valid JSON with ALL fields (never omit any field):
{
  "openState": "OPEN_NOW"|"CLOSED_NOW"|"OPEN_AT"|"OPEN_BETWEEN"|null,
  "openAt": {"day": number|null, "timeHHmm": "HH:mm"|null} | null,
  "openBetween": {"day": number|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null} | null,
  "priceLevel": 1|2|3|4|null,
  "isKosher": true|false|null,
  "isGlutenFree": true|null,
  "requirements": {"accessible": true|false|null, "parking": true|false|null}
}

RULES:
- openState: OPEN_NOW / CLOSED_NOW / OPEN_AT / OPEN_BETWEEN or null. OPEN_AT → set openAt with day (0-6), timeHHmm (24h). OPEN_BETWEEN → set openBetween with day, startHHmm, endHHmm.
- priceLevel: 1=cheap, 2=$$, 3=$$$, 4=$$$$ or null.
- isKosher, isGlutenFree: true only if mentioned; never set false; else null.
- requirements.accessible, requirements.parking: true only if mentioned; never set false; else null.
- When openAt or openBetween is an object, include all keys (use null for missing). Do not output location, language, region, or confidence.
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
