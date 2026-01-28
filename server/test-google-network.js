/**
 * Google Places API Network Diagnostic Tool
 * 
 * Tests DNS resolution and HTTPS connectivity to places.googleapis.com
 * Run: node test-google-network.js
 */

import dns from 'dns';
import https from 'https';
import { promisify } from 'util';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

const HOSTNAME = 'places.googleapis.com';
const TEST_TIMEOUT_MS = 5000;

console.log('🔍 Google Places API Network Diagnostics\n');
console.log(`Target: ${HOSTNAME}`);
console.log(`Timeout: ${TEST_TIMEOUT_MS}ms\n`);

// Step 1: DNS Resolution Test
async function testDns() {
  console.log('━━━ DNS Resolution Test ━━━');
  
  try {
    console.log('Testing IPv4 (A records)...');
    const ipv4 = await resolve4(HOSTNAME);
    console.log(`✅ IPv4 resolved: ${ipv4.join(', ')}`);
  } catch (err) {
    console.error(`❌ IPv4 resolution failed: ${err.message}`);
  }

  try {
    console.log('Testing IPv6 (AAAA records)...');
    const ipv6 = await resolve6(HOSTNAME);
    console.log(`✅ IPv6 resolved: ${ipv6.join(', ')}`);
  } catch (err) {
    console.error(`❌ IPv6 resolution failed: ${err.message}`);
  }

  console.log('');
}

// Step 2: HTTPS Connectivity Test
async function testHttps() {
  console.log('━━━ HTTPS Connectivity Test ━━━');
  console.log(`Testing GET https://${HOSTNAME}/`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const req = https.get(`https://${HOSTNAME}/`, {
      timeout: TEST_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Network Diagnostic Tool)'
      }
    }, (res) => {
      const durationMs = Date.now() - startTime;
      console.log(`✅ Connection successful`);
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Duration: ${durationMs}ms`);
      console.log(`   Headers: ${JSON.stringify(res.headers, null, 2)}`);
      resolve(true);
    });

    req.on('timeout', () => {
      const durationMs = Date.now() - startTime;
      console.error(`❌ Request timed out after ${durationMs}ms`);
      console.error(`   This suggests network/firewall blocking`);
      req.destroy();
      resolve(false);
    });

    req.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      console.error(`❌ Request failed after ${durationMs}ms`);
      console.error(`   Error: ${err.message}`);
      console.error(`   Code: ${err.code || 'unknown'}`);
      
      if (err.code === 'ENOTFOUND') {
        console.error(`   → DNS resolution failed`);
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        console.error(`   → Network/firewall likely blocking outbound HTTPS`);
      } else if (err.code === 'ECONNREFUSED') {
        console.error(`   → Connection refused (unusual for public API)`);
      }
      
      resolve(false);
    });
  });
}

// Step 3: Test Google Places API Endpoint
async function testPlacesApi() {
  console.log('\n━━━ Google Places API Endpoint Test ━━━');
  
  const apiKey = process.env.GOOGLE_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️  GOOGLE_API_KEY not set - skipping API test');
    console.warn('   Set GOOGLE_API_KEY to test authenticated endpoint');
    return;
  }
  
  console.log(`Testing POST https://${HOSTNAME}/v1/places:searchText`);
  console.log(`API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)} (length: ${apiKey.length})`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const postData = JSON.stringify({
      textQuery: 'pizza',
      languageCode: 'en',
      maxResultCount: 1
    });
    
    const options = {
      hostname: HOSTNAME,
      port: 443,
      path: '/v1/places:searchText',
      method: 'POST',
      timeout: TEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.id'
      }
    };

    const req = https.request(options, (res) => {
      const durationMs = Date.now() - startTime;
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`✅ API Response received`);
        console.log(`   Status: ${res.statusCode}`);
        console.log(`   Duration: ${durationMs}ms`);
        
        if (res.statusCode === 200) {
          console.log(`   ✅ API call successful`);
          try {
            const parsed = JSON.parse(data);
            console.log(`   Results: ${parsed.places?.length || 0} places`);
          } catch (e) {
            console.log(`   Response: ${data.substring(0, 200)}`);
          }
        } else {
          console.error(`   ❌ API error: ${data}`);
          
          if (res.statusCode === 403) {
            console.error(`   → API key may lack Places API (New) permissions`);
          } else if (res.statusCode === 400) {
            console.error(`   → Bad request (check API format)`);
          }
        }
        
        resolve(true);
      });
    });

    req.on('timeout', () => {
      const durationMs = Date.now() - startTime;
      console.error(`❌ API request timed out after ${durationMs}ms`);
      console.error(`   Network/firewall likely blocking outbound HTTPS to Google`);
      req.destroy();
      resolve(false);
    });

    req.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      console.error(`❌ API request failed after ${durationMs}ms`);
      console.error(`   Error: ${err.message}`);
      console.error(`   Code: ${err.code || 'unknown'}`);
      resolve(false);
    });

    req.write(postData);
    req.end();
  });
}

// Run all tests
(async () => {
  try {
    await testDns();
    const httpsSuccess = await testHttps();
    
    if (httpsSuccess) {
      await testPlacesApi();
    } else {
      console.log('\n⚠️  Skipping API test due to connectivity failure');
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Diagnostic Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('If DNS resolved but HTTPS failed:');
    console.log('  → Check corporate firewall/proxy settings');
    console.log('  → Check outbound HTTPS (port 443) access');
    console.log('  → Try: curl -v https://places.googleapis.com/');
    console.log('');
    console.log('If DNS failed:');
    console.log('  → Check /etc/resolv.conf (Linux) or DNS settings (Windows)');
    console.log('  → Try: nslookup places.googleapis.com');
    console.log('');
    console.log('If API call failed with 403:');
    console.log('  → Enable "Places API (New)" in Google Cloud Console');
    console.log('  → Check API key restrictions');
    console.log('  → Verify billing is enabled');
    console.log('');
    console.log('Workaround for local dev:');
    console.log('  Set SEARCH_PROVIDER=stub in .env file');
    console.log('');
    
  } catch (err) {
    console.error(`\n❌ Diagnostic failed: ${err.message}`);
    process.exit(1);
  }
})();
