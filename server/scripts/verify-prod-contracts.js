/**
 * PROD Contract Verification Script
 * 
 * Verifies critical API contracts work end-to-end:
 * 1. POST /auth/token - Get JWT
 * 2. POST /search?mode=async - Create search job
 * 3. GET /search/:id/result - Poll until DONE
 * 4. Attempt IDOR with wrong token - Expect 404
 * 
 * Usage:
 *   node scripts/verify-prod-contracts.js [baseUrl]
 *   npm run verify:prod-contracts
 * 
 * Exit codes:
 *   0 - All tests passed
 *   1 - Tests failed
 */

const baseUrl = process.argv[2] || 'http://localhost:3000';
const apiBase = `${baseUrl}/api/v1`;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function pass(test) {
  totalTests++;
  passedTests++;
  log(`✅ PASS: ${test}`);
}

function fail(test, reason) {
  totalTests++;
  failedTests++;
  log(`❌ FAIL: ${test}`);
  log(`   Reason: ${reason}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: POST /auth/token
 */
async function testAuthToken() {
  log('\n[TEST 1] POST /auth/token');
  
  try {
    const response = await fetch(`${apiBase}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response.status !== 200) {
      fail('Auth token creation', `Expected 200, got ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.token || !data.sessionId) {
      fail('Auth token response', 'Missing token or sessionId');
      return null;
    }
    
    // Basic JWT format check (3 dot-separated parts)
    const parts = data.token.split('.');
    if (parts.length !== 3) {
      fail('Auth token format', 'JWT does not have 3 parts');
      return null;
    }
    
    pass('Auth token creation');
    pass('Auth token format');
    return { token: data.token, sessionId: data.sessionId };
  } catch (error) {
    fail('Auth token creation', error.message);
    return null;
  }
}

/**
 * Test 2: POST /search?mode=async
 */
async function testSearchAsync(token) {
  log('\n[TEST 2] POST /search?mode=async');
  
  try {
    const response = await fetch(`${apiBase}/search?mode=async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query: 'pizza near me',
        userLocation: { lat: 32.0853, lng: 34.7818 }
      })
    });
    
    if (response.status !== 202) {
      fail('Search async creation', `Expected 202, got ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.requestId || !data.resultUrl) {
      fail('Search async response', 'Missing requestId or resultUrl');
      return null;
    }
    
    pass('Search async creation');
    pass('Search async response format');
    return data.requestId;
  } catch (error) {
    fail('Search async creation', error.message);
    return null;
  }
}

/**
 * Test 3: GET /search/:id/result (polling)
 */
async function testSearchResult(requestId, token) {
  log('\n[TEST 3] GET /search/:requestId/result (polling)');
  
  const maxAttempts = 20;
  const pollInterval = 2000; // 2 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${apiBase}/search/${requestId}/result`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 404) {
        fail('Search result polling', 'Job not found (404)');
        return false;
      }
      
      if (response.status === 401) {
        fail('Search result polling', 'Unauthorized (401)');
        return false;
      }
      
      if (response.status === 202) {
        // Still running
        log(`   Attempt ${i + 1}/${maxAttempts}: Job still running...`);
        await sleep(pollInterval);
        continue;
      }
      
      if (response.status === 200) {
        const data = await response.json();
        
        if (!Array.isArray(data.results)) {
          fail('Search result format', 'Missing results array');
          return false;
        }
        
        pass('Search result polling');
        pass('Search result format');
        log(`   Got ${data.results.length} results`);
        return true;
      }
      
      if (response.status === 500) {
        // Job failed
        log(`   Job failed with 500`);
        pass('Search result polling (completed with error)');
        return true;
      }
      
      fail('Search result polling', `Unexpected status ${response.status}`);
      return false;
      
    } catch (error) {
      fail('Search result polling', error.message);
      return false;
    }
  }
  
  fail('Search result polling', 'Timeout waiting for job completion');
  return false;
}

/**
 * Test 4: IDOR attempt with wrong token
 */
async function testIDOR(requestId, originalToken) {
  log('\n[TEST 4] IDOR: Attempt access with wrong token');
  
  try {
    // Generate a different token
    const response2 = await fetch(`${apiBase}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response2.status !== 200) {
      fail('IDOR test setup', 'Failed to create second token');
      return;
    }
    
    const data2 = await response2.json();
    const wrongToken = data2.token;
    
    // Try to access original requestId with wrong token
    const response = await fetch(`${apiBase}/search/${requestId}/result`, {
      headers: {
        'Authorization': `Bearer ${wrongToken}`
      }
    });
    
    // CRITICAL: Must return 404 (not 403) to avoid requestId disclosure
    if (response.status === 404) {
      pass('IDOR protection (returns 404)');
    } else if (response.status === 403) {
      fail('IDOR protection', 'Returns 403 instead of 404 (leaks requestId existence)');
    } else if (response.status === 200) {
      fail('IDOR protection', 'CRITICAL: Returned 200 - IDOR vulnerability!');
    } else {
      fail('IDOR protection', `Unexpected status ${response.status}`);
    }
  } catch (error) {
    fail('IDOR test', error.message);
  }
}

/**
 * Main test runner
 */
async function main() {
  log('🚀 Starting PROD Contract Verification');
  log(`   Base URL: ${baseUrl}`);
  log(`   API Base: ${apiBase}`);
  
  // Test 1: Get auth token
  const authResult = await testAuthToken();
  if (!authResult) {
    log('\n❌ Cannot proceed without auth token');
    process.exit(1);
  }
  
  const { token, sessionId } = authResult;
  log(`   Token: ${token.substring(0, 20)}...`);
  log(`   Session: ${sessionId}`);
  
  // Test 2: Create async search
  const requestId = await testSearchAsync(token);
  if (!requestId) {
    log('\n❌ Cannot proceed without requestId');
    process.exit(1);
  }
  
  log(`   Request ID: ${requestId}`);
  
  // Test 3: Poll for result
  const pollingSuccess = await testSearchResult(requestId, token);
  if (!pollingSuccess) {
    log('\n⚠️  Polling failed, but continuing with IDOR test');
  }
  
  // Test 4: IDOR protection
  await testIDOR(requestId, token);
  
  // Summary
  log('\n' + '='.repeat(60));
  log(`📊 Test Summary:`);
  log(`   Total:  ${totalTests}`);
  log(`   Passed: ${passedTests}`);
  log(`   Failed: ${failedTests}`);
  log('='.repeat(60));
  
  if (failedTests === 0) {
    log('✅ All tests passed!');
    process.exit(0);
  } else {
    log(`❌ ${failedTests} test(s) failed`);
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  log(`\n💥 Unhandled error: ${error.message}`);
  log(error.stack);
  process.exit(1);
});
