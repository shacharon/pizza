/**
 * Fetch with Timeout Utility
 * 
 * Wraps native fetch with an AbortController to prevent hanging promises.
 * Ensures proper cleanup via clearTimeout in finally block.
 * 
 * P0 Fix: Reliability - prevents orchestrator crashes from hanging upstream API calls
 */

import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export type FetchErrorKind = 'DNS_FAIL' | 'TIMEOUT' | 'ABORT' | 'HTTP_ERROR' | 'NETWORK_ERROR';

export interface FetchWithTimeoutConfig {
  timeoutMs: number;
  requestId?: string;
  stage?: string;
  provider?: string;
  enableDnsPreflight?: boolean; // Optional DNS check before fetch
  /** Optional request-scoped abort signal; when aborted, the fetch is cancelled. */
  signal?: AbortSignal;
}

export interface TimeoutError extends Error {
  code: 'UPSTREAM_TIMEOUT';
  provider: string;
  timeoutMs: number;
  stage: string;
  requestId?: string;
  errorKind: FetchErrorKind;
  host: string;
}

/**
 * DNS preflight check with timeout
 */
async function checkDns(hostname: string, timeoutMs: number = 1500): Promise<{
  ok: boolean;
  ipsCount?: number;
  errorCode?: string;
  durationMs: number;
}> {
  const startTime = Date.now();
  
  try {
    // Race DNS lookup against timeout
    const result = await Promise.race([
      dnsLookup(hostname, { all: true }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('DNS_TIMEOUT')), timeoutMs)
      )
    ]) as dns.LookupAddress[];
    
    return {
      ok: true,
      ipsCount: result.length,
      durationMs: Date.now() - startTime
    };
  } catch (err) {
    const errorCode = err instanceof Error ? (err.message === 'DNS_TIMEOUT' ? 'ETIMEOUT' : (err as any).code || 'UNKNOWN') : 'UNKNOWN';
    
    return {
      ok: false,
      errorCode,
      durationMs: Date.now() - startTime
    };
  }
}

/**
 * Fetch with automatic timeout using AbortController
 * 
 * @param url - The URL to fetch
 * @param options - Standard fetch options
 * @param config - Timeout configuration
 * @returns Promise<Response>
 * @throws TimeoutError if request exceeds timeoutMs
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  config: FetchWithTimeoutConfig
): Promise<Response> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  const startTime = Date.now();
  let errorKind: FetchErrorKind | undefined;

  try {
    // Parse URL for safe logging (no query params or API keys)
    const urlObj = new URL(url);
    const host = urlObj.host;
    const path = urlObj.pathname;

    // Optional DNS preflight check
    if (config.enableDnsPreflight) {
      const dnsResult = await checkDns(urlObj.hostname);
      
      console.log(`[FETCH] DNS preflight ${urlObj.hostname}: ${dnsResult.ok ? `✓ ${dnsResult.ipsCount} IPs` : `✗ ${dnsResult.errorCode}`} (${dnsResult.durationMs}ms)`);
      
      if (!dnsResult.ok) {
        errorKind = 'DNS_FAIL';
        const dnsError = new Error(
          `DNS lookup failed for ${host}: ${dnsResult.errorCode}`
        ) as TimeoutError;
        
        dnsError.code = 'UPSTREAM_TIMEOUT';
        dnsError.provider = config.provider || 'unknown';
        dnsError.timeoutMs = config.timeoutMs;
        dnsError.stage = config.stage || 'unknown';
        dnsError.errorKind = errorKind;
        dnsError.host = host;
        
        if (config.requestId) {
          dnsError.requestId = config.requestId;
        }
        
        throw dnsError;
      }
    }

    // Log outbound request (safe - no secrets)
    console.log(`[FETCH] ${options.method || 'GET'} ${host}${path} timeout=${config.timeoutMs}ms stage=${config.stage || 'unknown'} requestId=${config.requestId || 'none'}`);

    // Set timeout to abort the request
    timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    // If request-scoped signal provided, abort our controller when it aborts
    let abortListener: (() => void) | undefined;
    if (config.signal) {
      if (config.signal.aborted) {
        controller.abort();
      } else {
        abortListener = () => controller.abort();
        config.signal.addEventListener('abort', abortListener);
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } finally {
      abortListener && config.signal!.removeEventListener('abort', abortListener);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[FETCH] Response ${response.status} from ${host}${path} (${durationMs}ms)`);

    return response;

  } catch (err) {
    const durationMs = Date.now() - startTime;
    const urlObj = new URL(url);
    const host = urlObj.host;
    
    // Determine error kind
    if (!errorKind) {
      if (err instanceof Error && (err.name === 'AbortError' || controller.signal.aborted)) {
        errorKind = 'TIMEOUT';
      } else if (err instanceof Error && (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo'))) {
        errorKind = 'DNS_FAIL';
      } else if (err instanceof Error && (err.message.includes('ECONNREFUSED') || err.message.includes('ECONNRESET'))) {
        errorKind = 'NETWORK_ERROR';
      } else {
        errorKind = 'NETWORK_ERROR';
      }
    }

    // Log error with kind
    console.error(`[FETCH] ${errorKind} ${host} after ${durationMs}ms: ${err instanceof Error ? err.message : String(err)}`);
    
    // Map to structured TimeoutError
    const timeoutError = new Error(
      `${config.provider || 'Upstream API'} ${errorKind.toLowerCase().replace('_', ' ')} after ${durationMs}ms - Check network/DNS access to ${host}`
    ) as TimeoutError;
    
    timeoutError.code = 'UPSTREAM_TIMEOUT';
    timeoutError.provider = config.provider || 'unknown';
    timeoutError.timeoutMs = config.timeoutMs;
    timeoutError.stage = config.stage || 'unknown';
    timeoutError.errorKind = errorKind;
    timeoutError.host = host;
    
    if (config.requestId) {
      timeoutError.requestId = config.requestId;
    }
    
    throw timeoutError;

  } finally {
    // P0 Fix: Always clear timeout to prevent memory leaks
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
