/**
 * Test Brave Search for All 3 Providers
 * Tests Wolt, TenBis, Mishloha with detailed logging
 */

import { BraveSearchClient } from './dist/server/src/services/search/route2/enrichment/brave-search-client.js';
import { BraveSearchAdapter } from './dist/server/src/services/search/route2/enrichment/brave-search.adapter.js';

// Your Brave API key from .env
const BRAVE_API_KEY = 'BSAwO90CHdddddddddddddddddd';

console.log('\n🚀 Testing Brave Search for All Providers\n');
console.log('=' .repeat(60));

// Create Brave client
const client = new BraveSearchClient({
  apiKey: BRAVE_API_KEY,
  timeoutMs: 10000,
  maxRetries: 2
});

const adapter = new BraveSearchAdapter(client);

// Test cases for each provider
const testCases = [
  {
    provider: 'wolt',
    name: 'Pizza Hut',
    city: 'Tel Aviv',
    config: {
      provider: 'wolt',
      allowedHosts: ['wolt.com', '*.wolt.com'],
      requiredPathSegments: ['/restaurant/']
    }
  },
  {
    provider: 'tenbis',
    name: 'Pizza Hut',
    city: 'Tel Aviv',
    config: {
      provider: 'tenbis',
      allowedHosts: ['10bis.co.il', '*.10bis.co.il'],
      requiredPathSegments: ['/restaurant/']
    }
  },
  {
    provider: 'mishloha',
    name: 'Pizza Hut',
    city: 'Tel Aviv',
    config: {
      provider: 'mishloha',
      allowedHosts: ['mishloha.co.il', '*.mishloha.co.il'],
      requiredPathSegments: ['/restaurant/']
    }
  }
];

// Run tests
async function runTests() {
  for (const test of testCases) {
    console.log(`\n📍 Testing ${test.provider.toUpperCase()}`);
    console.log('-'.repeat(60));
    console.log(`   Restaurant: ${test.name}`);
    console.log(`   City: ${test.city}`);
    console.log(`   Hosts: ${test.config.allowedHosts.join(', ')}`);
    console.log(`   Required path: ${test.config.requiredPathSegments?.join(', ') || 'none'}`);
    console.log('');

    try {
      const startTime = Date.now();
      
      const url = await adapter.searchWithRelaxPolicy(
        test.name,
        test.city,
        test.config
      );

      const elapsed = Date.now() - startTime;

      if (url) {
        console.log(`✅ SUCCESS (${elapsed}ms)`);
        console.log(`   URL: ${url}`);
        
        // Parse and show URL details
        const parsedUrl = new URL(url);
        console.log(`   Host: ${parsedUrl.hostname}`);
        console.log(`   Path: ${parsedUrl.pathname}`);
      } else {
        console.log(`❌ NOT FOUND (${elapsed}ms)`);
        console.log(`   No valid URLs found after 4 attempts`);
      }
    } catch (err) {
      console.log(`❌ ERROR`);
      console.log(`   ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
