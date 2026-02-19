/**
 * Unit tests for polling-strategy
 * Tests polling configuration and delegation to ResultWaiter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollingStrategy } from '../polling-strategy.js';

// Mock dependencies
vi.mock('../result-waiter.js', () => ({
  ResultWaiter: vi.fn().mockImplementation((jobStore, logger, pollInterval, timeout) => ({
    waitForResults: vi.fn().mockResolvedValue({
      resultsReady: true,
      latestStatus: 'DONE',
      polledCount: 3,
      elapsedMs: 450
    })
  }))
}));

vi.mock('../../../../services/search/job-store/job-store.interface.js', () => ({}));

vi.mock('../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('PollingStrategy', () => {
  let mockJobStore: any;
  let mockLogger: any;

  beforeEach(async () => {
    const loggerModule = await import('../../../../lib/logger/structured-logger.js');
    mockLogger = loggerModule.logger;
    mockJobStore = {};
    vi.clearAllMocks();
  });

  it('should initialize with correct configuration', () => {
    const config = {
      pollIntervalMs: 150,
      timeoutMs: 5000
    };

    const strategy = new PollingStrategy(mockJobStore, mockLogger, config);

    expect(strategy).toBeDefined();
  });

  it('should delegate to ResultWaiter with correct parameters', async () => {
    const { ResultWaiter } = await import('../result-waiter.js');

    const config = {
      pollIntervalMs: 200,
      timeoutMs: 6000
    };

    const strategy = new PollingStrategy(mockJobStore, mockLogger, config);

    // Verify ResultWaiter was constructed with correct config
    expect(ResultWaiter).toHaveBeenCalledWith(
      mockJobStore,
      mockLogger,
      200,  // pollIntervalMs
      6000  // timeoutMs
    );
  });

  it('should return poll result from ResultWaiter', async () => {
    const strategy = new PollingStrategy(mockJobStore, mockLogger, {
      pollIntervalMs: 150,
      timeoutMs: 5000
    });

    const abortController = new AbortController();
    const isClientDisconnected = () => false;

    const result = await strategy.waitForResults(
      'req-123',
      'PROCESSING',
      abortController.signal,
      isClientDisconnected
    );

    expect(result).toMatchObject({
      resultsReady: true,
      latestStatus: 'DONE'
    });
  });

  it('should pass through abort signal and disconnect checker', async () => {
    const { ResultWaiter } = await import('../result-waiter.js');
    const mockWaitForResults = vi.fn().mockResolvedValue({ resultsReady: false, latestStatus: null });
    (ResultWaiter as any).mockImplementation(() => ({
      waitForResults: mockWaitForResults
    }));

    const strategy = new PollingStrategy(mockJobStore, mockLogger, {
      pollIntervalMs: 150,
      timeoutMs: 5000
    });

    const abortController = new AbortController();
    const isClientDisconnected = vi.fn(() => false);

    await strategy.waitForResults(
      'req-456',
      'PROCESSING',
      abortController.signal,
      isClientDisconnected
    );

    // Verify parameters passed through
    expect(mockWaitForResults).toHaveBeenCalledWith(
      'req-456',
      'PROCESSING',
      abortController.signal,
      isClientDisconnected
    );
  });

  it('should support different polling configurations', async () => {
    const { ResultWaiter } = await import('../result-waiter.js');

    // Fast polling
    const fastStrategy = new PollingStrategy(mockJobStore, mockLogger, {
      pollIntervalMs: 50,
      timeoutMs: 2000
    });

    expect(ResultWaiter).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      50,
      2000
    );

    // Slow polling
    const slowStrategy = new PollingStrategy(mockJobStore, mockLogger, {
      pollIntervalMs: 500,
      timeoutMs: 10000
    });

    expect(ResultWaiter).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      500,
      10000
    );
  });
});
