/**
 * Test harness for regionHint validation
 * 
 * Verifies that only valid 2-letter country codes are accepted
 * and invalid values are rejected and normalized to null
 */

// Copy of normalizeRegion2 function
const normalizeRegion2 = (value?: string | null): string | null => {
    if (!value) return null;
    const v = value.trim().toUpperCase();
    // Must be exactly 2 uppercase letters (A-Z only)
    return /^[A-Z]{2}$/.test(v) ? v : null;
};

// Copy of validateRegionHint function (simplified for testing)
const validateRegionHint = (raw: string | null | undefined): { valid: boolean; normalized: string | null } => {
    if (!raw) return { valid: true, normalized: null };
    
    const trimmed = raw.trim().toUpperCase();
    const isValid = /^[A-Z]{2}$/.test(trimmed);
    
    return {
        valid: isValid,
        normalized: isValid ? trimmed : null
    };
};

console.log('🧪 Running regionHint validation tests...\n');

const runTest = (testName: string, input: string | null, expectedValid: boolean, expectedNormalized: string | null) => {
    const result = validateRegionHint(input);
    const pass = result.valid === expectedValid && result.normalized === expectedNormalized;
    
    console.log(`${pass ? '✅' : '❌'} ${testName}`);
    console.log(`   input: ${input === null ? 'null' : `"${input}"`}`);
    console.log(`   => valid: ${result.valid} (expected: ${expectedValid}) ${result.valid === expectedValid ? '✓' : '✗'}`);
    console.log(`   => normalized: ${result.normalized === null ? 'null' : `"${result.normalized}"`} (expected: ${expectedNormalized === null ? 'null' : `"${expectedNormalized}"`}) ${result.normalized === expectedNormalized ? '✓' : '✗'}`);
    console.log('');
    
    return pass;
};

let allPass = true;

// Valid inputs
allPass = runTest('Test 1: Valid uppercase "IL"', 'IL', true, 'IL') && allPass;
allPass = runTest('Test 2: Valid uppercase "FR"', 'FR', true, 'FR') && allPass;
allPass = runTest('Test 3: Valid uppercase "US"', 'US', true, 'US') && allPass;
allPass = runTest('Test 4: Valid lowercase "il" (normalized)', 'il', true, 'IL') && allPass;
allPass = runTest('Test 5: Valid mixed case "Fr" (normalized)', 'Fr', true, 'FR') && allPass;
allPass = runTest('Test 6: Valid with whitespace " IL " (trimmed)', ' IL ', true, 'IL') && allPass;

// Invalid inputs
allPass = runTest('Test 7: Invalid punctuation "/G"', '/G', false, null) && allPass;
allPass = runTest('Test 8: Invalid punctuation "/}"', '/}', false, null) && allPass;
allPass = runTest('Test 9: Invalid empty string "" (treated as null)', '', true, null) && allPass;
allPass = runTest('Test 10: Invalid single letter "I"', 'I', false, null) && allPass;
allPass = runTest('Test 11: Invalid three letters "ISR"', 'ISR', false, null) && allPass;
allPass = runTest('Test 12: Invalid with number "I1"', 'I1', false, null) && allPass;
allPass = runTest('Test 13: Invalid with special char "I!"', 'I!', false, null) && allPass;
allPass = runTest('Test 14: Null input', null, true, null) && allPass;

// Edge cases with normalizeRegion2 (used in fallback resolution)
console.log('═'.repeat(60));
console.log('Testing normalizeRegion2 (used in fallback chain):\n');

const testNormalize = (input: string | null | undefined, expected: string | null) => {
    const result = normalizeRegion2(input);
    const pass = result === expected;
    console.log(`${pass ? '✅' : '❌'} normalizeRegion2(${input === null ? 'null' : input === undefined ? 'undefined' : `"${input}"`}) => ${result === null ? 'null' : `"${result}"`} (expected: ${expected === null ? 'null' : `"${expected}"`})`);
    return pass;
};

allPass = testNormalize('IL', 'IL') && allPass;
allPass = testNormalize('fr', 'FR') && allPass;
allPass = testNormalize(' US ', 'US') && allPass;
allPass = testNormalize('/G', null) && allPass;
allPass = testNormalize('/}', null) && allPass;
allPass = testNormalize('', null) && allPass;
allPass = testNormalize('ISR', null) && allPass;
allPass = testNormalize(null, null) && allPass;
allPass = testNormalize(undefined, null) && allPass;

console.log('');
console.log('═'.repeat(60));
console.log(allPass ? '✅ All tests passed!' : '❌ Some tests failed');
console.log('═'.repeat(60));

process.exit(allPass ? 0 : 1);
