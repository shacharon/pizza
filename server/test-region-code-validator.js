/**
 * Manual verification for Region Code Validator
 * Tests validation against CLDR allowlist and 'GZ' special case handling
 */

import { 
  isValidRegionCode, 
  sanitizeRegionCode, 
  isInsideIsrael,
  getFallbackRegion 
} from './dist/server/src/services/search/route2/utils/region-code-validator.js';

console.log('=== Testing Region Code Validator ===\n');

let passed = 0;
let failed = 0;

// TEST 1: Valid region codes
{
  console.log('Test 1: Valid CLDR region codes');
  
  const validCodes = ['IL', 'US', 'GB', 'FR', 'DE', 'ES'];
  const allValid = validCodes.every(code => isValidRegionCode(code));
  
  if (allValid) {
    console.log(`✅ PASS: All valid codes accepted: ${validCodes.join(', ')}`);
    passed++;
  } else {
    console.log(`❌ FAIL: Some valid codes rejected`);
    failed++;
  }
}

// TEST 2: Invalid region codes
{
  console.log('\nTest 2: Invalid region codes');
  
  const invalidCodes = [
    'GZ',      // Gaza - not in CLDR
    'XX',      // Non-existent
    'ABC',     // Wrong format (3 letters)
    'I',       // Wrong format (1 letter)
    'il',      // Lowercase
    '12',      // Numbers
    null,
    undefined,
    ''
  ];
  
  const allInvalid = invalidCodes.every(code => !isValidRegionCode(code));
  
  if (allInvalid) {
    console.log(`✅ PASS: All invalid codes rejected`);
    passed++;
  } else {
    console.log(`❌ FAIL: Some invalid codes accepted`);
    failed++;
  }
}

// TEST 3: isInsideIsrael function
{
  console.log('\nTest 3: isInsideIsrael geographic check');
  
  // Tel Aviv coordinates
  const telAviv = { lat: 32.0853, lng: 34.7818 };
  const inIsrael = isInsideIsrael(telAviv.lat, telAviv.lng);
  
  // London coordinates
  const london = { lat: 51.5074, lng: -0.1278 };
  const notInIsrael = !isInsideIsrael(london.lat, london.lng);
  
  if (inIsrael && notInIsrael) {
    console.log(`✅ PASS: Tel Aviv (${telAviv.lat},${telAviv.lng}) -> inside Israel`);
    console.log(`   ✅ London (${london.lat},${london.lng}) -> outside Israel`);
    passed++;
  } else {
    console.log(`❌ FAIL: Geographic check failed`);
    failed++;
  }
}

// TEST 4: sanitizeRegionCode - Valid codes pass through
{
  console.log('\nTest 4: sanitizeRegionCode - Valid codes pass through');
  
  const result = sanitizeRegionCode('IL', null);
  
  if (result === 'IL') {
    console.log(`✅ PASS: 'IL' -> 'IL'`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 'IL', got ${result}`);
    failed++;
  }
}

// TEST 5: sanitizeRegionCode - Invalid codes return null
{
  console.log('\nTest 5: sanitizeRegionCode - Invalid codes return null');
  
  const result = sanitizeRegionCode('XX', null);
  
  if (result === null) {
    console.log(`✅ PASS: 'XX' -> null`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected null, got ${result}`);
    failed++;
  }
}

// TEST 6: sanitizeRegionCode - 'GZ' with location inside Israel -> 'IL'
{
  console.log('\nTest 6: sanitizeRegionCode - GZ + location inside Israel -> IL');
  
  const telAviv = { lat: 32.0853, lng: 34.7818 };
  const result = sanitizeRegionCode('GZ', telAviv);
  
  if (result === 'IL') {
    console.log(`✅ PASS: 'GZ' + Tel Aviv location -> 'IL'`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 'IL', got ${result}`);
    failed++;
  }
}

// TEST 7: sanitizeRegionCode - 'GZ' with location outside Israel -> null
{
  console.log('\nTest 7: sanitizeRegionCode - GZ + location outside Israel -> null');
  
  const london = { lat: 51.5074, lng: -0.1278 };
  const result = sanitizeRegionCode('GZ', london);
  
  if (result === null) {
    console.log(`✅ PASS: 'GZ' + London location -> null`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected null, got ${result}`);
    failed++;
  }
}

// TEST 8: sanitizeRegionCode - 'GZ' without location -> null
{
  console.log('\nTest 8: sanitizeRegionCode - GZ without location -> null');
  
  const result = sanitizeRegionCode('GZ', null);
  
  if (result === null) {
    console.log(`✅ PASS: 'GZ' + no location -> null`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected null, got ${result}`);
    failed++;
  }
}

// TEST 9: getFallbackRegion - Inside Israel
{
  console.log('\nTest 9: getFallbackRegion - Inside Israel -> IL');
  
  const telAviv = { lat: 32.0853, lng: 34.7818 };
  const result = getFallbackRegion('GZ', telAviv);
  
  if (result === 'IL') {
    console.log(`✅ PASS: Inside Israel location -> 'IL'`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected 'IL', got ${result}`);
    failed++;
  }
}

// TEST 10: getFallbackRegion - Outside Israel
{
  console.log('\nTest 10: getFallbackRegion - Outside Israel -> null');
  
  const london = { lat: 51.5074, lng: -0.1278 };
  const result = getFallbackRegion('XX', london);
  
  if (result === null) {
    console.log(`✅ PASS: Outside Israel location -> null`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected null, got ${result}`);
    failed++;
  }
}

// TEST 11: Real-world scenario - Gaza coordinates with 'GZ' code
{
  console.log('\nTest 11: REAL SCENARIO - Gaza coordinates with GZ code');
  
  // Gaza Strip coordinates (31.5, 34.45)
  const gazaCoords = { lat: 31.5, lng: 34.45 };
  const result = sanitizeRegionCode('GZ', gazaCoords);
  
  // Gaza is technically inside IL bbox (southern Israel region)
  const expectedResult = isInsideIsrael(gazaCoords.lat, gazaCoords.lng) ? 'IL' : null;
  
  if (result === expectedResult) {
    console.log(`✅ PASS: Gaza coords (${gazaCoords.lat},${gazaCoords.lng}) -> ${result || 'null'}`);
    console.log(`   ✅ Inside IL bbox: ${isInsideIsrael(gazaCoords.lat, gazaCoords.lng)}`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected ${expectedResult}, got ${result}`);
    failed++;
  }
}

// TEST 12: Null/undefined handling
{
  console.log('\nTest 12: Null/undefined handling');
  
  const nullResult = sanitizeRegionCode(null, null);
  const undefinedResult = sanitizeRegionCode(undefined, null);
  const emptyResult = sanitizeRegionCode('', null);
  
  if (nullResult === null && undefinedResult === null && emptyResult === null) {
    console.log(`✅ PASS: null/undefined/empty -> null`);
    passed++;
  } else {
    console.log(`❌ FAIL: Expected all null, got ${nullResult}, ${undefinedResult}, ${emptyResult}`);
    failed++;
  }
}

console.log('\n=== Results ===');
console.log(`Passed: ${passed}/12`);
console.log(`Failed: ${failed}/12`);

if (failed > 0) {
  console.log('\n❌ TESTS FAILED');
  process.exit(1);
}

console.log('\n✅ ALL TESTS PASSED!');
console.log('\n🎉 FIX VERIFIED: Region code validator working correctly');
console.log('   ✅ Valid CLDR codes pass through');
console.log('   ✅ Invalid codes rejected (return null)');
console.log('   ✅ GZ special case: IL when inside Israel, null otherwise');
console.log('   ✅ Google API will not receive INVALID_ARGUMENT for regionCode');
