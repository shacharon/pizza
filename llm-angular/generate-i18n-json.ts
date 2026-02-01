/**
 * Generate i18n JSON Files
 * 
 * This script generates individual JSON files for each supported language.
 * The JSON files combine all UI strings, search narration, cuisine labels, and signal labels.
 * 
 * Output:
 * - llm-angular/src/assets/i18n/en.json
 * - llm-angular/src/assets/i18n/he.json
 * - llm-angular/src/assets/i18n/fr.json
 * - llm-angular/src/assets/i18n/es.json
 * - llm-angular/src/assets/i18n/ru.json
 * - llm-angular/src/assets/i18n/ar.json
 * - llm-angular/src/assets/i18n/it.json
 * - llm-angular/src/assets/i18n/ja.json
 * 
 * Usage:
 * npx ts-node generate-i18n-json.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { MESSAGES, type Lang } from '../src/app/i18n/search-narration.i18n';
import { UI_STRINGS, type UiLang } from '../src/app/i18n/ui-strings.i18n';
import { CUISINE_LABELS } from '../src/app/i18n/cuisine-labels.i18n';
import { CARD_SIGNAL_LABELS } from '../src/app/domain/i18n/card-signal-labels.i18n';

// Supported languages (excluding 'other')
const LANGUAGES: Array<Lang | UiLang> = ['en', 'he', 'fr', 'es', 'ru', 'ar', 'it', 'ja'];

// Output directory
const OUTPUT_DIR = path.join(__dirname, '../src/assets/i18n');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Generate JSON for each language
LANGUAGES.forEach((lang) => {
  // Combine all translation sources
  const translations = {
    // Search narration (hero, location, search, errors, etc.)
    ...MESSAGES[lang as Lang],
    
    // UI strings (card, actions, assistant, etc.)
    ...UI_STRINGS[lang as UiLang],
    
    // Cuisine labels (formatted as cuisine.{key})
    cuisine: Object.fromEntries(
      Object.entries(CUISINE_LABELS[lang as UiLang]).map(([key, value]) => [
        key,
        `${value.emoji} ${value.label}`
      ])
    ),
    
    // Signal labels (formatted as signal.{key})
    signal: CARD_SIGNAL_LABELS
      ? Object.fromEntries(
          Object.entries(CARD_SIGNAL_LABELS).map(([key, value]) => [
            key.toLowerCase(),
            value[lang as UiLang]
          ])
        )
      : {}
  };

  // Write JSON file
  const outputPath = path.join(OUTPUT_DIR, `${lang}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(translations, null, 2), 'utf-8');
  
  console.log(`✓ Generated ${lang}.json (${Object.keys(translations).length} top-level keys)`);
});

console.log(`\n✨ All i18n JSON files generated successfully in ${OUTPUT_DIR}`);
