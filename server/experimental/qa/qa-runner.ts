/**
 * QA Runner
 * Phase 6: Executes QA dataset and generates results
 * 
 * Runs all test queries through SearchOrchestrator and validates
 * responses against expected behaviors.
 */

import type { QAEntry, QAResult, QASummary } from './qa.types.js';
import type { SearchOrchestrator } from '../orchestrator/search.orchestrator.js';
import type { QAAssertionEngine } from './qa.assertions.js';
import type { SearchRequest } from '../types/search-request.dto.js';
import type { Session } from '../../places/session/session-manager.js';

export class QARunner {
  constructor(
    private orchestrator: SearchOrchestrator,
    private assertions: QAAssertionEngine
  ) {}
  
  /**
   * Run all test queries in the dataset
   * Returns summary with pass/fail counts and detailed results
   */
  async run(dataset: QAEntry[]): Promise<QASummary> {
    const startTime = Date.now();
    const results: QAResult[] = [];
    
    console.log(`\n🧪 Running ${dataset.length} test queries...\n`);
    
    for (const entry of dataset) {
      const result = await this.runSingleQuery(entry);
      results.push(result);
      
      // Log progress
      const status = result.passed ? '✅' : '❌';
      const timeStr = `${result.executionTimeMs}ms`;
      console.log(`${status} ${entry.id.padEnd(40)} ${timeStr.padStart(8)}`);
      
      // Log failures inline for immediate visibility
      if (!result.passed && result.failures.length > 0) {
        result.failures.forEach(f => {
          console.log(`   ⚠️  ${f.rule}: ${f.message}`);
        });
      }
    }
    
    const summary: QASummary = {
      totalQueries: dataset.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      executionTimeMs: Date.now() - startTime,
      results,
      timestamp: new Date().toISOString()
    };
    
    return summary;
  }
  
  /**
   * Run a single test query
   * Executes search and validates response against assertions
   */
  private async runSingleQuery(entry: QAEntry): Promise<QAResult> {
    const startTime = Date.now();
    
    try {
      // Build search request
      const request: SearchRequest = {
        query: entry.query,
        language: entry.language,
        sessionId: `qa-${entry.id}`,
        debug: true  // Enable diagnostics for inspection
      };
      
      // Create minimal session object
      // QA doesn't need real session persistence
      const session: Session = {
        id: request.sessionId,
        context: {
          language: entry.language,
          location: undefined,
          history: []
        },
        createdAt: new Date(),
        lastAccessedAt: new Date()
      };
      
      // Execute search through orchestrator
      const response = await this.orchestrator.search(request, session);
      
      // Run assertions
      const failures = this.assertions.validate(entry, response);
      
      return {
        entry,
        response,
        passed: failures.length === 0,
        failures,
        executionTimeMs: Date.now() - startTime
      };
    } catch (error: any) {
      // Query execution failed (exception thrown)
      return {
        entry,
        response: null,
        passed: false,
        failures: [{
          rule: 'execution.error',
          expected: 'Successful execution',
          actual: error?.message || String(error),
          message: `Query execution failed: ${error?.message || String(error)}`
        }],
        executionTimeMs: Date.now() - startTime
      };
    }
  }
}





