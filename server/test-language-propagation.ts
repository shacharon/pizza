#!/usr/bin/env node
/**
 * Language Propagation Regression Test
 * 
 * Runs 3 fixed queries through Route2 and validates:
 * 1. Arabic query: CLARIFY with language="ar"
 * 2. Hebrew query: GATE_FAIL with language="he", no timeout
 * 3. Short Arabic query: Snapshot for review (no assertions)
 * 
 * Exit code 0 only if (1) and (2) pass.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const LOG_FILE = path.join(__dirname, 'logs', 'server.log');
const POLL_INTERVAL_MS = 500;
const MAX_POLL_TIME_MS = 15000;

interface TestCase {
  id: number;
  name: string;
  query: string;
  expectedStatus: string;
  expectedAssistantType?: string;
  expectedLanguage?: string;
  checkNoTimeout?: boolean;
  snapshotOnly?: boolean;
}

interface TestResult {
  testCase: TestCase;
  passed: boolean;
  status?: string;
  assistantType?: string;
  language?: string;
  hasTimeout?: boolean;
  gate2FoodSignal?: string;
  gate2Language?: string;
  errors: string[];
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    name: 'Arabic - NEARBY without location',
    query: '🇸🇦 مطعم قريب مني',
    expectedStatus: 'DONE_STOPPED',
    expectedAssistantType: 'CLARIFY',
    expectedLanguage: 'ar',
    checkNoTimeout: false,
    snapshotOnly: false
  },
  {
    id: 2,
    name: 'Hebrew - Not food related',
    query: "'יwhat is the wehaerjer usfiond",
    expectedStatus: 'DONE_STOPPED',
    expectedAssistantType: 'GATE_FAIL',
    expectedLanguage: 'he',
    checkNoTimeout: true,
    snapshotOnly: false
  },
  {
    id: 3,
    name: 'Short Arabic - Snapshot',
    query: 'ب مني 🇸🇦',
    expectedStatus: '',
    snapshotOnly: true
  }
];

async function runSearch(query: string, sessionId: string): Promise<{ requestId: string }> {
  const response = await fetch(`${SERVER_URL}/api/v1/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId
    },
    body: JSON.stringify({ query })
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as any;
  return { requestId: data.requestId };
}

async function pollResult(requestId: string, sessionId: string): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const response = await fetch(`${SERVER_URL}/api/v1/result/${requestId}`, {
      headers: {
        'x-session-id': sessionId
      }
    });

    if (!response.ok) {
      throw new Error(`Result polling failed: ${response.status}`);
    }

    const data = await response.json() as any;
    
    if (data.status.startsWith('DONE_') || data.status === 'FAILED') {
      return data;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Polling timeout - job did not complete');
}

function parseLogsForRequest(requestId: string): {
  gate2FoodSignal?: string;
  gate2Language?: string;
  assistantType?: string;
  assistantLanguage?: string;
  hasAbortTimeout: boolean;
} {
  if (!fs.existsSync(LOG_FILE)) {
    return { hasAbortTimeout: false };
  }

  const logs = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = logs.split('\n').filter(line => line.trim());

  let gate2FoodSignal: string | undefined;
  let gate2Language: string | undefined;
  let assistantType: string | undefined;
  let assistantLanguage: string | undefined;
  let hasAbortTimeout = false;

  for (const line of lines) {
    try {
      const log = JSON.parse(line);
      
      if (log.requestId !== requestId) continue;

      // Gate2 completion
      if (log.event === 'stage_completed' && log.stage === 'gate2') {
        gate2FoodSignal = log.foodSignal;
      }

      // Gate2 language snapshot (new log)
      if (log.event === 'gate2_lang_snapshot') {
        gate2Language = log.gateAssistantLanguage;
      }

      // Assistant type
      if (log.event === 'assistant_llm_success') {
        assistantType = log.type;
      }

      // Assistant publish snapshot (new log)
      if (log.event === 'assistant_publish_lang_snapshot') {
        assistantLanguage = log.enforcedLanguage;
      }

      // Abort timeout detection
      if (log.errorType === 'abort_timeout' || (log.error && log.error.includes('abort'))) {
        hasAbortTimeout = true;
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  }

  return {
    gate2FoodSignal,
    gate2Language,
    assistantType,
    assistantLanguage,
    hasAbortTimeout
  };
}

async function runTest(testCase: TestCase): Promise<TestResult> {
  const sessionId = `test-session-${Date.now()}-${testCase.id}`;
  const errors: string[] = [];

  try {
    console.log(`\n[Test ${testCase.id}] Running: ${testCase.name}`);
    console.log(`  Query: "${testCase.query}"`);

    const { requestId } = await runSearch(testCase.query, sessionId);
    console.log(`  RequestId: ${requestId}`);

    const result = await pollResult(requestId, sessionId);
    console.log(`  Status: ${result.status}`);

    // Parse logs
    const logData = parseLogsForRequest(requestId);
    
    // Snapshot-only test (no assertions)
    if (testCase.snapshotOnly) {
      console.log(`  [SNAPSHOT] Gate2 foodSignal: ${logData.gate2FoodSignal}`);
      console.log(`  [SNAPSHOT] Gate2 language: ${logData.gate2Language}`);
      console.log(`  [SNAPSHOT] Assistant type: ${logData.assistantType}`);
      console.log(`  [SNAPSHOT] Assistant language: ${logData.assistantLanguage}`);
      
      return {
        testCase,
        passed: true, // Snapshot tests always pass
        status: result.status,
        gate2FoodSignal: logData.gate2FoodSignal,
        gate2Language: logData.gate2Language,
        assistantType: logData.assistantType,
        language: logData.assistantLanguage,
        errors: []
      };
    }

    // Assertion 1: Status
    if (testCase.expectedStatus && result.status !== testCase.expectedStatus) {
      errors.push(`Expected status ${testCase.expectedStatus}, got ${result.status}`);
    }

    // Assertion 2: Assistant type (from logs)
    if (testCase.expectedAssistantType && logData.assistantType !== testCase.expectedAssistantType) {
      errors.push(`Expected assistantType ${testCase.expectedAssistantType}, got ${logData.assistantType || 'NONE'}`);
    }

    // Assertion 3: Language (from logs - assistant_publish_lang_snapshot)
    if (testCase.expectedLanguage && logData.assistantLanguage !== testCase.expectedLanguage) {
      errors.push(`Expected language ${testCase.expectedLanguage}, got ${logData.assistantLanguage || 'NONE'}`);
    }

    // Assertion 4: No abort_timeout
    if (testCase.checkNoTimeout && logData.hasAbortTimeout) {
      errors.push('Found abort_timeout in logs');
    }

    const passed = errors.length === 0;
    
    if (passed) {
      console.log(`  ✓ PASSED`);
    } else {
      console.log(`  ✗ FAILED:`);
      errors.forEach(err => console.log(`    - ${err}`));
    }

    return {
      testCase,
      passed,
      status: result.status,
      assistantType: logData.assistantType,
      language: logData.assistantLanguage,
      hasTimeout: logData.hasAbortTimeout,
      gate2FoodSignal: logData.gate2FoodSignal,
      gate2Language: logData.gate2Language,
      errors
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`  ✗ FAILED: ${errorMsg}`);
    
    return {
      testCase,
      passed: false,
      errors: [errorMsg]
    };
  }
}

function printSummaryTable(results: TestResult[]): void {
  console.log('\n' + '='.repeat(120));
  console.log('LANGUAGE PROPAGATION REGRESSION TEST SUMMARY');
  console.log('='.repeat(120));

  // Header
  console.log(
    '| Test | Name'.padEnd(35) + 
    '| Status'.padEnd(17) + 
    '| AssistantType'.padEnd(16) + 
    '| Language'.padEnd(11) + 
    '| Result'.padEnd(8) + 
    '|'
  );
  console.log('|' + '-'.repeat(118) + '|');

  // Rows
  for (const result of results) {
    const testId = `  ${result.testCase.id}  `;
    const name = result.testCase.name.substring(0, 27).padEnd(28);
    const status = (result.status || 'N/A').padEnd(14);
    const assistantType = (result.assistantType || 'N/A').padEnd(13);
    const language = (result.language || 'N/A').padEnd(8);
    const resultStr = result.testCase.snapshotOnly 
      ? 'SNAPSHOT'
      : (result.passed ? '✓ PASS' : '✗ FAIL');
    const resultPadded = resultStr.padEnd(5);

    console.log(
      `| ${testId}| ${name}| ${status}| ${assistantType}| ${language}| ${resultPadded}|`
    );

    // Show errors if any
    if (!result.passed && !result.testCase.snapshotOnly && result.errors.length > 0) {
      result.errors.forEach(err => {
        console.log(`|      └─ ${err.padEnd(109)}|`);
      });
    }

    // Show snapshot details
    if (result.testCase.snapshotOnly) {
      console.log(`|      └─ Gate2: foodSignal=${result.gate2FoodSignal} language=${result.gate2Language}`.padEnd(119) + '|');
    }
  }

  console.log('|' + '-'.repeat(118) + '|');

  // Summary
  const assertionTests = results.filter(r => !r.testCase.snapshotOnly);
  const passedCount = assertionTests.filter(r => r.passed).length;
  const totalCount = assertionTests.length;
  const allPassed = passedCount === totalCount;

  console.log(`| RESULT: ${passedCount}/${totalCount} tests passed`.padEnd(119) + '|');
  console.log('='.repeat(120));

  if (allPassed) {
    console.log('✓ All assertion tests PASSED');
  } else {
    console.log('✗ Some tests FAILED');
  }
}

async function main() {
  console.log('Language Propagation Regression Test');
  console.log('=====================================');
  console.log(`Server: ${SERVER_URL}`);
  console.log(`Log file: ${LOG_FILE}`);

  // Check if server is running
  try {
    await fetch(`${SERVER_URL}/health`);
  } catch (error) {
    console.error('\n✗ Server is not running. Start the server first:');
    console.error('  cd server && npm run dev');
    process.exit(1);
  }

  const results: TestResult[] = [];

  // Run tests sequentially
  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Print summary
  printSummaryTable(results);

  // Exit code: 0 only if all non-snapshot tests passed
  const assertionTests = results.filter(r => !r.testCase.snapshotOnly);
  const allPassed = assertionTests.every(r => r.passed);
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('\n✗ Test runner failed:', error);
  process.exit(1);
});
