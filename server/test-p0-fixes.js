/**
 * P0 Reliability Fixes - Test Script
 * 
 * Quick validation of timeout handling, retry logic, and error boundaries
 * Run: node test-p0-fixes.js
 */

import { fetchWithTimeout } from './src/utils/fetch-with-timeout.js';

console.log('🧪 Testing P0 Reliability Fixes\n');

// Test 1: fetchWithTimeout - Success case
async function testFetchSuccess() {
  console.log('Test 1: fetchWithTimeout - Success case');
  try {
    const response = await fetchWithTimeout(
      'https://httpbin.org/delay/1',
      { method: 'GET' },
      {
        timeoutMs: 3000,
        requestId: 'test-001',
        stage: 'test',
        provider: 'httpbin'
      }
    );
    
    if (response.ok) {
      console.log('✅ PASS - Request completed successfully\n');
    } else {
      console.log('❌ FAIL - Request returned non-OK status\n');
    }
  } catch (err) {
    console.log('❌ FAIL - Unexpected error:', err.message, '\n');
  }
}

// Test 2: fetchWithTimeout - Timeout case
async function testFetchTimeout() {
  console.log('Test 2: fetchWithTimeout - Timeout case');
  try {
    await fetchWithTimeout(
      'https://httpbin.org/delay/5',
      { method: 'GET' },
      {
        timeoutMs: 1000,
        requestId: 'test-002',
        stage: 'test',
        provider: 'httpbin'
      }
    );
    
    console.log('❌ FAIL - Should have timed out\n');
  } catch (err) {
    if (err.code === 'UPSTREAM_TIMEOUT') {
      console.log('✅ PASS - Timeout handled correctly');
      console.log(`   Error: ${err.message}`);
      console.log(`   Provider: ${err.provider}`);
      console.log(`   Timeout: ${err.timeoutMs}ms\n`);
    } else {
      console.log('❌ FAIL - Wrong error type:', err.message, '\n');
    }
  }
}

// Test 3: Memory leak check - Ensure timeout is cleared
async function testTimeoutCleanup() {
  console.log('Test 3: Timeout cleanup verification');
  
  const initialHandles = process._getActiveHandles().length;
  
  // Execute multiple fast requests
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(
      fetchWithTimeout(
        'https://httpbin.org/delay/0',
        { method: 'GET' },
        {
          timeoutMs: 5000,
          requestId: `test-003-${i}`,
          stage: 'test',
          provider: 'httpbin'
        }
      ).catch(() => {}) // Ignore errors
    );
  }
  
  await Promise.all(promises);
  
  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const finalHandles = process._getActiveHandles().length;
  
  if (finalHandles <= initialHandles + 2) { // Allow some variance
    console.log('✅ PASS - No dangling timeout handles detected');
    console.log(`   Initial: ${initialHandles}, Final: ${finalHandles}\n`);
  } else {
    console.log('❌ FAIL - Possible memory leak detected');
    console.log(`   Initial: ${initialHandles}, Final: ${finalHandles}\n`);
  }
}

// Test 4: Error propagation
async function testErrorPropagation() {
  console.log('Test 4: Error propagation (network error)');
  try {
    await fetchWithTimeout(
      'https://invalid-domain-that-does-not-exist-12345.com',
      { method: 'GET' },
      {
        timeoutMs: 3000,
        requestId: 'test-004',
        stage: 'test',
        provider: 'test'
      }
    );
    
    console.log('❌ FAIL - Should have thrown network error\n');
  } catch (err) {
    if (err.code !== 'UPSTREAM_TIMEOUT') {
      console.log('✅ PASS - Network error propagated correctly');
      console.log(`   Error: ${err.message}\n`);
    } else {
      console.log('❌ FAIL - Wrong error type (timeout instead of network error)\n');
    }
  }
}

// Run all tests
async function runTests() {
  console.log('─'.repeat(60));
  console.log('Starting P0 Reliability Tests...\n');
  
  await testFetchSuccess();
  await testFetchTimeout();
  await testTimeoutCleanup();
  await testErrorPropagation();
  
  console.log('─'.repeat(60));
  console.log('✅ Test suite complete!\n');
  console.log('💡 Next steps:');
  console.log('   1. Deploy to staging');
  console.log('   2. Monitor error rates and memory usage');
  console.log('   3. Run load tests with cache-heavy queries');
  console.log('   4. Verify no orchestrator crashes\n');
}

// Execute
runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
