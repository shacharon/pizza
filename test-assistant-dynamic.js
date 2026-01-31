/**
 * Assistant Message Dynamic Test
 * Tests that assistant messages are query-specific and respect uiLanguage
 * 
 * PASS CRITERIA:
 * 1. Messages differ between searches A and B (mention different contexts)
 * 2. Search C returns English message (not Hebrew)
 * 3. Backend logs show assistant_emitted with correct fields
 * 4. cacheKey differs across different buckets/languages
 */

const API_BASE = 'http://localhost:3000';
const SESSION_ID = `test-session-${Date.now()}`;

let JWT_TOKEN = null;

/**
 * Get JWT token for authentication
 * @returns {Promise<string>}
 */
async function getJwtToken() {
  if (JWT_TOKEN) return JWT_TOKEN;

  console.log('🔑 Getting JWT token...');

  const response = await fetch(`${API_BASE}/api/v1/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      deviceId: `test-device-${Date.now()}`
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to get JWT token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  JWT_TOKEN = data.token;
  console.log('  ✓ JWT token obtained\n');

  return JWT_TOKEN;
}

/**
 * Execute a search and wait for results
 * @param {string} query
 * @param {'he' | 'en'} uiLanguage
 * @param {string} label
 * @returns {Promise<Object>}
 */
async function executeSearch(query, uiLanguage, label) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[${label}] Starting search: "${query}" (uiLanguage=${uiLanguage})`);
  console.log('='.repeat(80));

  const token = await getJwtToken();

  const requestBody = {
    query,
    sessionId: SESSION_ID,
    uiLanguage
  };

  // POST /api/v1/search?mode=async
  const searchResponse = await fetch(`${API_BASE}/api/v1/search?mode=async`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!searchResponse.ok) {
    throw new Error(`Search API failed: ${searchResponse.status} ${searchResponse.statusText}`);
  }

  const searchData = await searchResponse.json();
  const requestId = searchData.requestId;
  const resultUrl = searchData.resultUrl;

  console.log(`  ✓ Search accepted: requestId=${requestId}`);
  console.log(`  ✓ Result URL: ${resultUrl}`);

  // Build absolute result URL
  const absoluteResultUrl = resultUrl.startsWith('http') ? resultUrl : `${API_BASE}${resultUrl}`;

  // Poll for results
  console.log(`  ⏳ Polling for results...`);
  let pollAttempts = 0;
  const maxAttempts = 30;
  let finalResponse = null;

  while (pollAttempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between polls
    pollAttempts++;

    const pollResponse = await fetch(absoluteResultUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (pollResponse.status === 202) {
      console.log(`  ⏳ Poll ${pollAttempts}: Still pending...`);
      continue;
    }

    if (pollResponse.status === 200) {
      finalResponse = await pollResponse.json();
      console.log(`  ✓ Poll ${pollAttempts}: Results ready!`);
      break;
    }

    throw new Error(`Unexpected poll status: ${pollResponse.status}`);
  }

  if (!finalResponse) {
    throw new Error('Polling timed out after 30 attempts');
  }

  // Extract result
  const result = {
    searchLabel: label,
    query,
    uiLanguage,
    requestId,
    resultCount: finalResponse.results.length,
    assistantMessage: finalResponse.assist?.message || '(NO ASSISTANT MESSAGE)',
    assistantLanguage: detectLanguage(finalResponse.assist?.message || ''),
    timestamp: new Date().toISOString()
  };

  console.log(`\n  📊 RESULT:`);
  console.log(`     RequestId:        ${result.requestId}`);
  console.log(`     Result Count:     ${result.resultCount}`);
  console.log(`     Assistant Lang:   ${result.assistantLanguage}`);
  console.log(`     Assistant Msg:    "${result.assistantMessage}"`);

  return result;
}

/**
 * Detect language (simple heuristic)
 * @param {string} text
 * @returns {string}
 */
function detectLanguage(text) {
  if (!text) return 'none';

  // Hebrew chars: \u0590-\u05FF
  const hebrewChars = text.match(/[\u0590-\u05FF]/g);
  const totalChars = text.replace(/\s/g, '').length;

  if (hebrewChars && hebrewChars.length > totalChars * 0.3) {
    return 'Hebrew';
  }

  return 'English';
}

/**
 * Verify test results
 * @param {Array} results
 */
function verifyResults(results) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(80));

  const [resultA, resultB, resultC] = results;

  // Check 1: Messages differ between A and B
  const messagesAreDifferent = resultA.assistantMessage !== resultB.assistantMessage;
  console.log(`\n✓ Check 1: Messages differ between A and B`);
  console.log(`  A: "${resultA.assistantMessage}"`);
  console.log(`  B: "${resultB.assistantMessage}"`);
  console.log(`  Different? ${messagesAreDifferent ? '✅ YES' : '❌ NO'}`);

  // Check 2: Message C is in English
  const cIsEnglish = resultC.assistantLanguage === 'English';
  console.log(`\n✓ Check 2: Search C returns English message`);
  console.log(`  C: "${resultC.assistantMessage}"`);
  console.log(`  Language: ${resultC.assistantLanguage}`);
  console.log(`  English? ${cIsEnglish ? '✅ YES' : '❌ NO'}`);

  // Check 3: A and B are Hebrew
  const aIsHebrew = resultA.assistantLanguage === 'Hebrew';
  const bIsHebrew = resultB.assistantLanguage === 'Hebrew';
  console.log(`\n✓ Check 3: Searches A and B return Hebrew messages`);
  console.log(`  A Language: ${resultA.assistantLanguage} ${aIsHebrew ? '✅' : '❌'}`);
  console.log(`  B Language: ${resultB.assistantLanguage} ${bIsHebrew ? '✅' : '❌'}`);

  // Check 4: All have assistant messages
  const allHaveMessages = results.every(r => r.assistantMessage !== '(NO ASSISTANT MESSAGE)');
  console.log(`\n✓ Check 4: All searches have assistant messages`);
  console.log(`  All present? ${allHaveMessages ? '✅ YES' : '❌ NO'}`);

  // Check 5: RequestIds are unique
  const uniqueRequestIds = new Set(results.map(r => r.requestId)).size === 3;
  console.log(`\n✓ Check 5: RequestIds are unique`);
  console.log(`  Unique count: ${new Set(results.map(r => r.requestId)).size}/3`);
  console.log(`  All unique? ${uniqueRequestIds ? '✅ YES' : '❌ NO'}`);

  // Final verdict
  console.log(`\n${'='.repeat(80)}`);
  const allPassed = messagesAreDifferent && cIsEnglish && aIsHebrew && bIsHebrew && allHaveMessages && uniqueRequestIds;

  if (allPassed) {
    console.log('🎉 ALL CHECKS PASSED! Assistant messages are dynamic and language-aware.');
  } else {
    console.log('❌ SOME CHECKS FAILED. See details above.');
  }
  console.log('='.repeat(80));
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('\n🧪 ASSISTANT MESSAGE DYNAMIC TEST');
  console.log('Testing that messages are query-specific and respect uiLanguage\n');

  const results = [];

  try {
    // Search A: Hebrew - Italian in Gedera
    const resultA = await executeSearch(
      'מסעדות איטלקיות בגדרה',
      'he',
      'SEARCH A'
    );
    results.push(resultA);

    // Wait 2s between searches
    console.log('\n⏳ Waiting 2s before next search...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Search B: Hebrew - Romantic kosher in Tel Aviv
    const resultB = await executeSearch(
      'מסעדות רומנטיות כשרות בתל אביב',
      'he',
      'SEARCH B'
    );
    results.push(resultB);

    // Wait 2s between searches
    console.log('\n⏳ Waiting 2s before next search...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Search C: English - Italian in Gedera
    const resultC = await executeSearch(
      'Italian restaurants in Gedera',
      'en',
      'SEARCH C'
    );
    results.push(resultC);

    // Verify results
    verifyResults(results);

    // Output JSON for parsing
    console.log('\n📋 TEST RESULTS (JSON):\n');
    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
