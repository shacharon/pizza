/**
 * ChatBack Service
 * LLM-powered messaging layer that turns ResponsePlan into natural language
 * Follows "Always Help, Never Stop" behavior contract
 * Phase 4: Fully i18n compliant
 */

import { z } from 'zod';
import { createLLMProvider } from '../../../llm/factory.js';
import type { LLMProvider, Message } from '../../../llm/types.js';
import type { ResponsePlan, SuggestedAction } from '../types/response-plan.types.js';
import type { ParsedIntent } from '../types/search.types.js';
import { createHash } from 'crypto';
import { getI18n } from '../../i18n/index.js';
import type { Lang } from '../../i18n/i18n.types.js';
import { normalizeLang } from '../../i18n/index.js';

const CHATBACK_POLICY = `You are a helpful food search assistant. Follow these rules:

1. NEVER say "no results" or "nothing found"
2. ALWAYS provide an actionable next step
3. Suggest, don't interrogate (max 1 question)
4. Don't fabricate facts about restaurants (hours, kosher, parking)
5. Vary your phrasing - never say the same thing twice
6. Avoid technical terms (confidence, API, data gaps)
7. Be light and supportive, not robotic

Response format:
- One short message (1-2 sentences)
- Reference specific numbers when available
- Explain tradeoffs gently ("if we extend 5 minutes...")
`;

// Phase 4: Forbidden phrases moved to i18n - see hasForbiddenPhrases() method

const ChatBackSchema = z.object({
  message: z.string().max(200),
  mode: z.enum(['NORMAL', 'RECOVERY'])
});

export interface ChatBackInput {
  userText: string;
  intent: ParsedIntent;
  responsePlan: ResponsePlan;
  memory?: {
    turnIndex: number;
    lastMessages: string[];
    scenarioCount: number;
  };
}

export interface ChatBackOutput {
  message: string;
  actions: SuggestedAction[];
  mode: 'NORMAL' | 'RECOVERY';
}

export class ChatBackService {
  private llm: LLMProvider | null;
  private i18n = getI18n();  // Phase 4: i18n support
  
  constructor() {
    this.llm = createLLMProvider();
  }
  
  /**
   * Generate a helpful message from ResponsePlan
   */
  async generate(input: ChatBackInput): Promise<ChatBackOutput> {
    if (!this.llm) {
      console.warn('[ChatBack] LLM unavailable, using fallback');
      return this.fallbackMessage(input);
    }
    
    try {
      const prompt = this.buildPrompt(input);
      const result = await this.llm.completeJSON(prompt, ChatBackSchema, { 
        temperature: 0.7,
        timeout: 10000 
      });
      
      // Validate against forbidden phrases
      const lang = normalizeLang(input.intent.language);
      if (this.hasForbiddenPhrases(result.message, lang)) {
        console.warn('[ChatBack] Forbidden phrase detected, retrying...');
        return this.retryWithStricterPrompt(input);
      }
      
      return {
        message: result.message,
        actions: input.responsePlan.suggestedActions,
        mode: result.mode
      };
    } catch (error) {
      console.error('[ChatBack] LLM error:', error);
      return this.fallbackMessage(input);
    }
  }
  
  /**
   * Build the LLM prompt from input context
   */
  private buildPrompt(input: ChatBackInput): Message[] {
    const { userText, intent, responsePlan, memory } = input;
    const isHebrew = intent.language === 'he';
    
    const system = CHATBACK_POLICY + `

Language: Respond in ${isHebrew ? 'HEBREW' : 'ENGLISH'}.

Context:
- User searched: "${userText}"
- Scenario: ${responsePlan.scenario}
- Results: ${responsePlan.results.total} total (${responsePlan.results.exact} exact, ${responsePlan.results.nearby} nearby)
- Open now: ${responsePlan.results.openNow}
- Closing soon: ${responsePlan.results.closingSoon}
${responsePlan.filters.nearbyCity ? `- Found ${responsePlan.filters.droppedCount} in ${responsePlan.filters.nearbyCity}` : ''}
${memory ? `- This is turn ${memory.turnIndex}${memory.scenarioCount > 1 ? `, scenario repeated ${memory.scenarioCount} times` : ''}` : ''}

Fallback options available:
${responsePlan.fallback.map(f => `- ${f.type}: ${f.explanation}`).join('\n')}

Suggested actions (you should reference these):
${responsePlan.suggestedActions.map(a => `- ${a.label}`).join('\n')}

Constraints:
${responsePlan.constraints.mustMentionCount ? '- MUST reference result count' : ''}
${responsePlan.constraints.mustSuggestAction ? '- MUST offer next step' : ''}
${responsePlan.constraints.canMentionTiming ? '- CAN reference timing' : '- DO NOT mention timing'}
${responsePlan.constraints.canMentionLocation ? '- CAN reference location' : '- DO NOT mention location'}

${memory?.lastMessages && memory.lastMessages.length > 0 ? `Previous messages (avoid repeating):\n${memory.lastMessages.join('\n')}` : ''}

Remember: This is not a dead end. There's always a way forward.
`;

    const user = `Generate a helpful, light message for this situation.`;
    
    return [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];
  }
  
  /**
   * Retry with stricter instructions to avoid forbidden phrases
   */
  private async retryWithStricterPrompt(input: ChatBackInput): Promise<ChatBackOutput> {
    if (!this.llm) {
      return this.fallbackMessage(input);
    }
    
    const originalPrompt = this.buildPrompt(input);
    const stricterSystem = (originalPrompt[0]?.content || '') + `

CRITICAL: Your response was rejected because it contained forbidden phrases.
ABSOLUTELY FORBIDDEN phrases: "no results", "nothing found", "try again", "לא נמצאו תוצאות", "אין תוצאות"

Instead of saying "no results", you MUST:
- Mention what IS available nearby
- Suggest expanding the search
- Offer alternative options
- Reference specific numbers

Try again, being even more helpful and positive.
`;

    try {
      const result = await this.llm.completeJSON(
        [
          { role: 'system', content: stricterSystem },
          { role: 'user', content: originalPrompt[1]?.content || '' }
        ],
        ChatBackSchema,
        { temperature: 0.6, timeout: 10000 }
      );
      
      // If still has forbidden phrases, use fallback
      const lang = normalizeLang(input.intent.language);
      if (this.hasForbiddenPhrases(result.message, lang)) {
        console.error('[ChatBack] Still has forbidden phrases after retry, using fallback');
        return this.fallbackMessage(input);
      }
      
      return {
        message: result.message,
        actions: input.responsePlan.suggestedActions,
        mode: result.mode
      };
    } catch (error) {
      console.error('[ChatBack] Retry failed:', error);
      return this.fallbackMessage(input);
    }
  }
  
  /**
   * Phase 4: Check if message contains forbidden phrases (i18n-driven)
   */
  private hasForbiddenPhrases(message: string, lang: Lang): boolean {
    const lower = message.toLowerCase();
    const forbidden = [
      this.i18n.t('chatback.forbidden.noResults', lang),
      this.i18n.t('chatback.forbidden.nothingFound', lang),
      this.i18n.t('chatback.forbidden.tryAgain', lang),
      this.i18n.t('chatback.forbidden.confidence', lang),
      this.i18n.t('chatback.forbidden.api', lang),
      this.i18n.t('chatback.forbidden.dataUnavailable', lang),
    ];
    return forbidden.some(phrase => lower.includes(phrase.toLowerCase()));
  }
  
  /**
   * Phase 4: Non-LLM fallback using i18n (language-agnostic)
   * Uses i18n templates based on scenario
   */
  private fallbackMessage(input: ChatBackInput): ChatBackOutput {
    const { responsePlan, intent } = input;
    const lang = normalizeLang(intent.language);
    const { scenario, results, filters, fallback } = responsePlan;
    
    let message = '';
    let mode: 'NORMAL' | 'RECOVERY' = 'NORMAL';
    
    // i18n-driven template-based messages
    switch (scenario) {
      case 'zero_nearby_exists':
        mode = 'RECOVERY';
        if (results.nearby > 0) {
          message = this.i18n.t('chatback.fallback.zeroNearbyExists', lang, {
            count: results.nearby
          });
        } else {
          message = this.i18n.t('chatback.fallback.tryExpanding', lang);
        }
        break;
        
      case 'zero_different_city':
        mode = 'RECOVERY';
        if (filters.nearbyCity) {
          message = this.i18n.t('chatback.fallback.zeroDifferentCity', lang, {
            count: filters.droppedCount,
            city: filters.nearbyCity
          });
        } else {
          message = this.i18n.t('chatback.fallback.zeroDifferentCityNoName', lang);
        }
        break;
        
      case 'few_closing_soon':
        mode = 'RECOVERY';
        message = this.i18n.t('chatback.fallback.fewClosingSoon', lang, {
          count: results.total
        });
        break;
        
      case 'missing_location':
        message = this.i18n.t('chatback.fallback.missingLocation', lang);
        break;
        
      case 'missing_query':
        message = this.i18n.t('chatback.fallback.missingQuery', lang);
        break;
        
      case 'low_confidence':
        message = this.i18n.t('chatback.fallback.normalWithFilter', lang, {
          count: results.total
        });
        break;
        
      default:
        message = this.i18n.t('chatback.fallback.normal', lang, {
          count: results.total
        });
    }
    
    return {
      message,
      actions: responsePlan.suggestedActions,
      mode
    };
  }
  
  /**
   * Create a hash of a message for variation tracking
   */
  hashMessage(message: string): string {
    return createHash('md5').update(message).digest('hex').slice(0, 8);
  }
}






