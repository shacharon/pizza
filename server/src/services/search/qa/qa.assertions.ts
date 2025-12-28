/**
 * QA Assertion Engine
 * Phase 6: Deterministic assertion rules to validate SearchResponse
 * 
 * Philosophy:
 * - DO check structural invariants (mode logic, chip presence, language correctness)
 * - DON'T check exact LLM phrasing or creative content
 * - DO validate contracts (SearchResponse shape, required fields)
 * - DON'T assert on provider-specific data (Google Places results change)
 */

import type { QAEntry, QAFailure } from './qa.types.js';
import type { SearchResponse } from '../types/search-response.dto.js';

export class QAAssertionEngine {
  /**
   * Validate a SearchResponse against expected behaviors
   * Returns array of failures (empty array = all assertions passed)
   */
  validate(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    
    // Contract invariants (always check)
    failures.push(...this.checkContractInvariants(response));
    
    // Entry-specific assertions
    if (entry.assertions.hasResults !== undefined) {
      failures.push(...this.checkHasResults(entry, response));
    }
    
    if (entry.assertions.minResults !== undefined) {
      failures.push(...this.checkMinResults(entry, response));
    }
    
    if (entry.assertions.maxResults !== undefined) {
      failures.push(...this.checkMaxResults(entry, response));
    }
    
    if (entry.assertions.hasChips) {
      failures.push(...this.checkHasChips(entry, response));
    }
    
    if (entry.assertions.minChips !== undefined) {
      failures.push(...this.checkMinChips(entry, response));
    }
    
    if (entry.assertions.maxChips !== undefined) {
      failures.push(...this.checkMaxChips(entry, response));
    }
    
    if (entry.assertions.hasAssist) {
      failures.push(...this.checkHasAssist(entry, response));
    }
    
    if (entry.assertions.requiresLiveData) {
      failures.push(...this.checkRequiresLiveData(entry, response));
    }
    
    if (entry.assertions.languageMatch) {
      failures.push(...this.checkLanguageMatch(entry, response));
    }
    
    if (entry.assertions.modeMatch && entry.expectedMode) {
      failures.push(...this.checkModeMatch(entry, response));
    }
    
    return failures;
  }
  
  /**
   * Check SearchResponse contract invariants
   * These must ALWAYS be true for a valid response
   */
  private checkContractInvariants(response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    
    // SearchResponse must have required fields
    if (!response.intent) {
      failures.push({
        rule: 'contract.intent',
        expected: 'Intent object',
        actual: undefined,
        message: 'SearchResponse missing required field: intent'
      });
    }
    
    if (!response.meta) {
      failures.push({
        rule: 'contract.meta',
        expected: 'Meta object',
        actual: undefined,
        message: 'SearchResponse missing required field: meta'
      });
    }
    
    if (!response.assist) {
      failures.push({
        rule: 'contract.assist',
        expected: 'AssistPayload',
        actual: undefined,
        message: 'SearchResponse missing required field: assist'
      });
    }
    
    // Intent must have required fields
    if (response.intent) {
      if (!response.intent.query && response.intent.query !== '') {
        failures.push({
          rule: 'contract.intent.query',
          expected: 'Non-null query',
          actual: response.intent.query,
          message: 'Intent missing query field'
        });
      }
      
      if (!response.intent.language) {
        failures.push({
          rule: 'contract.intent.language',
          expected: 'Language string',
          actual: undefined,
          message: 'Intent missing language field'
        });
      }
    }
    
    // Meta must have required fields
    if (response.meta) {
      if (response.meta.failureReason === undefined) {
        failures.push({
          rule: 'contract.meta.failureReason',
          expected: 'FailureReason',
          actual: undefined,
          message: 'Meta missing failureReason field'
        });
      }
    }
    
    // Assist must have required fields
    if (response.assist) {
      if (!response.assist.message) {
        failures.push({
          rule: 'contract.assist.message',
          expected: 'Non-empty message string',
          actual: response.assist.message,
          message: 'Assist missing or empty message'
        });
      }
      
      if (!response.assist.mode) {
        failures.push({
          rule: 'contract.assist.mode',
          expected: 'Mode string',
          actual: undefined,
          message: 'Assist missing mode field'
        });
      }
    }
    
    // Chips must be valid if present
    if (response.chips && Array.isArray(response.chips)) {
      response.chips.forEach((chip, idx) => {
        if (!chip.id || !chip.label || !chip.action) {
          failures.push({
            rule: 'contract.chip',
            expected: 'Valid chip with id, label, action',
            actual: chip,
            message: `Invalid chip at index ${idx}: missing required fields`
          });
        }
        
        // Action must be valid
        if (chip.action && !['filter', 'sort', 'map'].includes(chip.action)) {
          failures.push({
            rule: 'contract.chip.action',
            expected: 'Action type: filter, sort, or map',
            actual: chip.action,
            message: `Invalid chip action at index ${idx}: ${chip.action}`
          });
        }
      });
    }
    
    return failures;
  }
  
  /**
   * Check if response has results when expected
   */
  private checkHasResults(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const hasResults = response.results && response.results.length > 0;
    
    if (entry.assertions.hasResults && !hasResults) {
      failures.push({
        rule: 'assertion.hasResults',
        expected: 'Results array with at least 1 item',
        actual: response.results?.length || 0,
        message: `Expected results but got ${response.results?.length || 0}`
      });
    } else if (entry.assertions.hasResults === false && hasResults) {
      failures.push({
        rule: 'assertion.hasResults',
        expected: 'No results',
        actual: response.results.length,
        message: `Expected no results but got ${response.results.length}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check minimum number of results
   */
  private checkMinResults(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const resultCount = response.results?.length || 0;
    const minResults = entry.assertions.minResults!;
    
    if (resultCount < minResults) {
      failures.push({
        rule: 'assertion.minResults',
        expected: `At least ${minResults} results`,
        actual: resultCount,
        message: `Expected at least ${minResults} results but got ${resultCount}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check maximum number of results
   */
  private checkMaxResults(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const resultCount = response.results?.length || 0;
    const maxResults = entry.assertions.maxResults!;
    
    if (resultCount > maxResults) {
      failures.push({
        rule: 'assertion.maxResults',
        expected: `At most ${maxResults} results`,
        actual: resultCount,
        message: `Expected at most ${maxResults} results but got ${resultCount}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check if response has chips
   */
  private checkHasChips(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const hasChips = response.chips && response.chips.length > 0;
    
    if (entry.assertions.hasChips && !hasChips) {
      failures.push({
        rule: 'assertion.hasChips',
        expected: 'Chips array with at least 1 item',
        actual: response.chips?.length || 0,
        message: `Expected chips but got ${response.chips?.length || 0}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check minimum number of chips
   */
  private checkMinChips(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const chipCount = response.chips?.length || 0;
    const minChips = entry.assertions.minChips!;
    
    if (chipCount < minChips) {
      failures.push({
        rule: 'assertion.minChips',
        expected: `At least ${minChips} chips`,
        actual: chipCount,
        message: `Expected at least ${minChips} chips but got ${chipCount}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check maximum number of chips
   */
  private checkMaxChips(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const chipCount = response.chips?.length || 0;
    const maxChips = entry.assertions.maxChips!;
    
    if (chipCount > maxChips) {
      failures.push({
        rule: 'assertion.maxChips',
        expected: `At most ${maxChips} chips`,
        actual: chipCount,
        message: `Expected at most ${maxChips} chips but got ${chipCount}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check if response has assistant payload
   */
  private checkHasAssist(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    
    if (!response.assist) {
      failures.push({
        rule: 'assertion.hasAssist',
        expected: 'AssistPayload object',
        actual: undefined,
        message: 'Expected assist payload but got undefined'
      });
    } else if (!response.assist.message) {
      failures.push({
        rule: 'assertion.hasAssist.message',
        expected: 'Non-empty message',
        actual: response.assist.message,
        message: 'Assist payload missing message'
      });
    }
    
    return failures;
  }
  
  /**
   * Check if intent requires live data
   */
  private checkRequiresLiveData(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const requiresLiveData = response.intent?.requiresLiveData;
    
    if (entry.assertions.requiresLiveData && !requiresLiveData) {
      failures.push({
        rule: 'assertion.requiresLiveData',
        expected: 'requiresLiveData = true',
        actual: requiresLiveData,
        message: 'Expected intent to require live data but it does not'
      });
    }
    
    return failures;
  }
  
  /**
   * Check if response language matches request language
   */
  private checkLanguageMatch(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const intentLanguage = response.intent?.language;
    const requestLanguage = entry.language;
    
    // Normalize languages for comparison (he/iw should match)
    const normalizedIntent = this.normalizeLang(intentLanguage);
    const normalizedRequest = this.normalizeLang(requestLanguage);
    
    if (normalizedIntent !== normalizedRequest) {
      failures.push({
        rule: 'assertion.languageMatch',
        expected: `Intent language = ${requestLanguage}`,
        actual: intentLanguage,
        message: `Language mismatch: request=${requestLanguage}, intent=${intentLanguage}`
      });
    }
    
    return failures;
  }
  
  /**
   * Check if mode matches expected mode
   */
  private checkModeMatch(entry: QAEntry, response: SearchResponse): QAFailure[] {
    const failures: QAFailure[] = [];
    const actualMode = response.assist?.mode;
    const expectedMode = entry.expectedMode;
    
    if (actualMode !== expectedMode) {
      failures.push({
        rule: 'assertion.modeMatch',
        expected: `Mode = ${expectedMode}`,
        actual: actualMode,
        message: `Mode mismatch: expected=${expectedMode}, actual=${actualMode}`
      });
    }
    
    return failures;
  }
  
  /**
   * Normalize language code (he/iw → he, etc.)
   */
  private normalizeLang(lang: string | undefined): string {
    if (!lang) return 'en';
    const lower = lang.toLowerCase();
    if (lower === 'iw' || lower === 'he') return 'he';
    if (lower === 'ar') return 'ar';
    if (lower === 'ru') return 'ru';
    return 'en';
  }
}



