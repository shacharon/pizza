#!/usr/bin/env ts-node
/**
 * QA Harness CLI Script
 * Phase 6: Runnable script for local QA execution
 * 
 * Usage:
 *   npm run qa
 *   npm run qa:watch
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { QARunner } from './qa-runner.js';
import { QAAssertionEngine } from './qa.assertions.js';
import { SearchOrchestrator } from '../orchestrator/search.orchestrator.js';
import type { QAEntry, QASummary } from './qa.types.js';

// Import services needed for SearchOrchestrator
import { IntentService } from '../capabilities/intent.service.js';
import { GeoResolverService } from '../capabilities/geo-resolver.service.js';
import { GooglePlacesProvider } from '../../places/providers/google-places.provider.js';
import { RankingService } from '../capabilities/ranking.service.js';
import { SuggestionService } from '../capabilities/suggestion.service.js';
import { SessionService } from '../../places/session/session-manager.js';
import { getOpenAI } from '../../../lib/llm/openai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🧪 Starting QA Harness...\n');
  console.log('Phase 6: Regression Detection & Confidence Testing');
  console.log('=' .repeat(60) + '\n');
  
  // Load dataset
  const datasetPath = path.join(__dirname, 'qa.dataset.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset not found: ${datasetPath}`);
    process.exit(1);
  }
  
  const datasetContent = fs.readFileSync(datasetPath, 'utf-8');
  const dataset: QAEntry[] = JSON.parse(datasetContent);
  
  console.log(`📊 Loaded ${dataset.length} test queries`);
  console.log(`📍 Dataset: ${path.basename(datasetPath)}\n`);
  
  // Initialize LLM (optional - QA can run without it)
  let llm;
  try {
    llm = await getOpenAI();
    console.log('🤖 LLM initialized (OpenAI)');
  } catch (error) {
    console.warn('⚠️  LLM not available - using fallback mode');
    llm = null;
  }
  
  // Initialize services for SearchOrchestrator
  console.log('🔧 Initializing services...');
  
  const intentService = new IntentService(llm);
  const geoResolver = new GeoResolverService();
  const placesProvider = new GooglePlacesProvider();
  const rankingService = new RankingService();
  const suggestionService = new SuggestionService();
  const sessionService = new SessionService();
  
  console.log('✅ Services initialized\n');
  
  // Initialize orchestrator
  const orchestrator = new SearchOrchestrator(
    intentService,
    geoResolver,
    placesProvider,
    rankingService,
    suggestionService,
    sessionService,
    llm
  );
  
  // Initialize QA components
  const assertions = new QAAssertionEngine();
  const runner = new QARunner(orchestrator, assertions);
  
  // Run QA
  console.log('🚀 Starting QA execution...');
  console.log('-'.repeat(60));
  
  const summary = await runner.run(dataset);
  
  // Save snapshot
  const snapshotDir = path.join(__dirname, 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const snapshotPath = path.join(snapshotDir, `qa-${timestamp}.json`);
  
  fs.writeFileSync(snapshotPath, JSON.stringify(summary, null, 2));
  console.log(`\n💾 Snapshot saved: ${path.relative(process.cwd(), snapshotPath)}`);
  
  // Print report
  printReport(summary);
  
  // Exit with appropriate code
  const exitCode = summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

/**
 * Print detailed QA report
 */
function printReport(summary: QASummary) {
  console.log('\n' + '='.repeat(60));
  console.log('QA HARNESS SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Queries:    ${summary.totalQueries}`);
  console.log(`Passed:           ${summary.passed} ✅`);
  console.log(`Failed:           ${summary.failed} ❌`);
  console.log(`Pass Rate:        ${((summary.passed / summary.totalQueries) * 100).toFixed(1)}%`);
  console.log(`Execution Time:   ${summary.executionTimeMs}ms`);
  console.log(`Avg Time/Query:   ${Math.round(summary.executionTimeMs / summary.totalQueries)}ms`);
  console.log(`Timestamp:        ${summary.timestamp}`);
  console.log('='.repeat(60) + '\n');
  
  if (summary.failed > 0) {
    console.log('FAILURES DETAILS:\n');
    
    summary.results
      .filter(r => !r.passed)
      .forEach((result, idx) => {
        console.log(`${idx + 1}. ❌ ${result.entry.id}`);
        console.log(`   Query: "${result.entry.query}"`);
        console.log(`   Language: ${result.entry.language}`);
        console.log(`   Category: ${result.entry.category}`);
        console.log(`   Failures:`);
        
        result.failures.forEach(f => {
          console.log(`     • ${f.rule}`);
          console.log(`       Message: ${f.message}`);
          console.log(`       Expected: ${JSON.stringify(f.expected)}`);
          console.log(`       Actual: ${JSON.stringify(f.actual)}`);
        });
        
        console.log('');
      });
    
    console.log('=' .repeat(60));
    console.log(`\n⚠️  ${summary.failed} test(s) failed. See details above.\n`);
  } else {
    console.log('🎉 All tests passed! System behavior is stable.\n');
  }
  
  // Print summary by category
  const byCategory = summary.results.reduce((acc, r) => {
    const cat = r.entry.category;
    if (!acc[cat]) acc[cat] = { total: 0, passed: 0, failed: 0 };
    acc[cat].total++;
    if (r.passed) acc[cat].passed++;
    else acc[cat].failed++;
    return acc;
  }, {} as Record<string, { total: number; passed: number; failed: number }>);
  
  console.log('RESULTS BY CATEGORY:');
  console.log('-'.repeat(60));
  Object.entries(byCategory).forEach(([category, stats]) => {
    const passRate = ((stats.passed / stats.total) * 100).toFixed(0);
    const icon = stats.failed === 0 ? '✅' : '⚠️';
    console.log(`${icon} ${category.padEnd(15)} ${stats.passed}/${stats.total} (${passRate}%)`);
  });
  console.log('');
}

// Run main function
main().catch((error) => {
  console.error('\n❌ QA Harness failed with error:\n');
  console.error(error);
  process.exit(1);
});



