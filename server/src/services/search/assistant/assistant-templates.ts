/**
 * Assistant Template Engine
 * Assistant Narration Performance Policy: Fast deterministic templates for NORMAL mode
 */

import { getI18n } from '../../i18n/index.js';

export interface TemplateContext {
  resultCount: number;
  category?: string;
  city?: string;
  language: 'he' | 'en' | 'ar' | 'ru';
  hasActiveFilters?: boolean;
  topResultName?: string;
}

/**
 * Generate template-based assistant message for NORMAL mode
 * Performance: <50ms (no LLM call)
 */
export function generateNormalTemplate(ctx: TemplateContext): string {
  const i18n = getI18n();
  
  // No results
  if (ctx.resultCount === 0) {
    return i18n.t('assistant.noResults', { language: ctx.language });
  }
  
  // Results with category and city
  if (ctx.category && ctx.city) {
    return i18n.t('assistant.foundResults', {
      count: ctx.resultCount,
      category: ctx.category,
      city: ctx.city,
      language: ctx.language
    });
  }
  
  // Results with category only
  if (ctx.category) {
    return i18n.t('assistant.foundWithCategory', {
      count: ctx.resultCount,
      category: ctx.category,
      language: ctx.language
    });
  }
  
  // Results with city only
  if (ctx.city) {
    return i18n.t('assistant.foundInCity', {
      count: ctx.resultCount,
      city: ctx.city,
      language: ctx.language
    });
  }
  
  // Generic results
  return i18n.t('assistant.foundGeneric', {
    count: ctx.resultCount,
    language: ctx.language
  });
}

/**
 * Add filter context to template message
 */
export function addFilterContext(message: string, ctx: TemplateContext): string {
  if (!ctx.hasActiveFilters) {
    return message;
  }
  
  const i18n = getI18n();
  const filterText = i18n.t('assistant.withFilters', { language: ctx.language });
  
  return `${message} ${filterText}`;
}

