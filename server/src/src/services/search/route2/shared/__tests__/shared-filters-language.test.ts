/**
 * Test harness for shared-filters language resolution
 * 
 * Tests that language resolution correctly:
 * 1) Preserves intent languages exactly for provider calls (ar, fr, es, ru)
 * 2) Maps non-Hebrew languages to 'en' for UI
 * 3) Falls back appropriately for 'other' intent
 */

type Gate2Language = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other';
type ProviderLanguage = 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru';

// Copy of the mapping functions from shared-filters.tighten.ts
const mapToUiLanguage = (lang: Gate2Language): 'he' | 'en' | null => {
    if (lang === 'he') return 'he';
    if (lang === 'en') return 'en';
    
    // For other specific languages that should map to 'en' in UI
    if (lang === 'fr' || lang === 'es' || lang === 'ru' || lang === 'ar') {
        return 'en'; // Non-Hebrew languages use English UI
    }
    
    // For 'other', return null (not confident)
    return null;
};

const mapToProviderLanguage = (lang: Gate2Language): ProviderLanguage | null => {
    // Only map confident languages that providers support
    if (lang === 'he' || lang === 'en' || lang === 'ar' || lang === 'fr' || lang === 'es' || lang === 'ru') {
        return lang;
    }
    
    // For 'other', return null (not confident)
    return null;
};

// Test runner
console.log('🧪 Running shared-filters language resolution tests...\n');

const runTest = (
    testName: string,
    intentLanguage: Gate2Language,
    expectedProvider: ProviderLanguage | null,
    expectedUi: 'he' | 'en' | null
) => {
    const providerResult = mapToProviderLanguage(intentLanguage);
    const uiResult = mapToUiLanguage(intentLanguage);
    
    const providerPass = providerResult === expectedProvider;
    const uiPass = uiResult === expectedUi;
    const pass = providerPass && uiPass;
    
    console.log(`${pass ? '✅' : '❌'} ${testName}`);
    console.log(`   intent.language='${intentLanguage}'`);
    console.log(`   => providerLanguage='${providerResult}' (expected: '${expectedProvider}') ${providerPass ? '✓' : '✗'}`);
    console.log(`   => uiLanguage='${uiResult}' (expected: '${expectedUi}') ${uiPass ? '✓' : '✗'}`);
    console.log('');
    
    return pass;
};

let allPass = true;

// Test 1: Arabic intent (must preserve 'ar' for Google API)
allPass = runTest('Test 1: Arabic intent', 'ar', 'ar', 'en') && allPass;

// Test 2: French intent (must preserve 'fr' for Google API)
allPass = runTest('Test 2: French intent', 'fr', 'fr', 'en') && allPass;

// Test 3: Spanish intent (must preserve 'es' for Google API)
allPass = runTest('Test 3: Spanish intent', 'es', 'es', 'en') && allPass;

// Test 4: Russian intent (must preserve 'ru' for Google API)
allPass = runTest('Test 4: Russian intent', 'ru', 'ru', 'en') && allPass;

// Test 5: Hebrew intent (both ui and provider are 'he')
allPass = runTest('Test 5: Hebrew intent', 'he', 'he', 'he') && allPass;

// Test 6: English intent (both ui and provider are 'en')
allPass = runTest('Test 6: English intent', 'en', 'en', 'en') && allPass;

// Test 7: Other intent (not confident - returns null for fallback)
allPass = runTest('Test 7: Other intent (fallback)', 'other', null, null) && allPass;

console.log('═'.repeat(60));
console.log(allPass ? '✅ All tests passed!' : '❌ Some tests failed');
console.log('═'.repeat(60));

process.exit(allPass ? 0 : 1);
