/**
 * Translation Completeness Checker
 * 
 * Run this script to verify that all message keys exist in all languages
 * and that no translations are missing.
 * 
 * Usage: npx ts-node check-i18n-completeness.ts
 */

import { MESSAGES, type Lang, type MsgKey } from './llm-angular/src/app/i18n/search-narration.i18n';

const supportedLanguages: Lang[] = ['en', 'he', 'ru', 'ar', 'fr', 'es', 'other'];

interface CheckResult {
  language: Lang;
  missingKeys: MsgKey[];
  emptyValues: MsgKey[];
  total: number;
  complete: number;
}

function checkTranslationCompleteness(): CheckResult[] {
  const results: CheckResult[] = [];
  
  // Get all keys from English (reference language)
  const englishKeys = Object.keys(MESSAGES.en) as MsgKey[];
  
  supportedLanguages.forEach(lang => {
    const langMessages = MESSAGES[lang];
    const missingKeys: MsgKey[] = [];
    const emptyValues: MsgKey[] = [];
    
    // Check each key
    englishKeys.forEach(key => {
      if (!(key in langMessages)) {
        missingKeys.push(key);
      } else if (!langMessages[key] || langMessages[key].trim() === '') {
        emptyValues.push(key);
      }
    });
    
    results.push({
      language: lang,
      missingKeys,
      emptyValues,
      total: englishKeys.length,
      complete: englishKeys.length - missingKeys.length - emptyValues.length,
    });
  });
  
  return results;
}

function printResults(results: CheckResult[]): void {
  console.log('\n=== Translation Completeness Check ===\n');
  
  let allComplete = true;
  
  results.forEach(result => {
    const percentage = ((result.complete / result.total) * 100).toFixed(1);
    const status = result.missingKeys.length === 0 && result.emptyValues.length === 0 ? '✅' : '❌';
    
    console.log(`${status} ${result.language.toUpperCase()}: ${result.complete}/${result.total} (${percentage}%)`);
    
    if (result.missingKeys.length > 0) {
      allComplete = false;
      console.log(`   Missing keys (${result.missingKeys.length}):`);
      result.missingKeys.forEach(key => console.log(`     - ${key}`));
    }
    
    if (result.emptyValues.length > 0) {
      allComplete = false;
      console.log(`   Empty values (${result.emptyValues.length}):`);
      result.emptyValues.forEach(key => console.log(`     - ${key}`));
    }
    
    console.log('');
  });
  
  if (allComplete) {
    console.log('✅ All translations are complete!\n');
  } else {
    console.log('❌ Some translations are missing or empty\n');
    process.exit(1);
  }
}

// Run check
const results = checkTranslationCompleteness();
printResults(results);
