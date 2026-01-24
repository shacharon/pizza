/**
 * Manual verification script for Near-Me HOTFIX
 * Run: node test-near-me-hotfix.js
 */

import { isNearMeQuery, getNearMePattern } from './dist/server/src/services/search/route2/utils/near-me-detector.js';

console.log('=== Testing Near-Me Detector ===\n');

const testCases = [
  // Hebrew - should match
  { query: 'מסעדות לידי', expected: true },
  { query: 'מה יש לידיי', expected: true },
  { query: 'פיצה ממני', expected: true },
  { query: 'קרוב אליי', expected: true },
  { query: 'בסביבה שלי', expected: true },
  { query: 'מסעדות פתוחות לידי', expected: true },
  
  // English - should match
  { query: 'restaurants near me', expected: true },
  { query: 'pizza nearby', expected: true },
  { query: 'food around me', expected: true },
  
  // Should NOT match
  { query: 'מסעדות בתל אביב', expected: false },
  { query: 'פיצה ברעננה', expected: false },
  { query: 'restaurants in london', expected: false },
  { query: 'pizza downtown', expected: false }
];

let passed = 0;
let failed = 0;

testCases.forEach(({ query, expected }) => {
  const result = isNearMeQuery(query);
  const pattern = getNearMePattern(query);
  
  if (result === expected) {
    console.log(`✅ PASS: "${query}" → ${result}${pattern ? ` (pattern: "${pattern}")` : ''}`);
    passed++;
  } else {
    console.log(`❌ FAIL: "${query}" → Expected ${expected}, got ${result}`);
    failed++;
  }
});

console.log(`\n=== Results ===`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed > 0) {
  process.exit(1);
}

console.log('\n✅ All tests passed!');
