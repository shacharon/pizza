/**
 * Provider Audit Store - DynamoDB Persistence
 * Stores lightweight metadata for provider calls with TTL
 * 
 * In dev: No-op stub
 * In prod: Writes to DynamoDB table with 90-day TTL
 */

import type { ProviderTraceEvent } from '../telemetry/providerTrace.js';

const isDev = process.env.NODE_ENV !== 'production';
const tableName = process.env.PROVIDER_AUDIT_TABLE_NAME;
const enableAudit = process.env.ENABLE_PROVIDER_AUDIT === 'true';
const shouldAwait = process.env.PROVIDER_AUDIT_AWAIT === 'true';
const awaitTimeoutMs = parseInt(process.env.PROVIDER_AUDIT_AWAIT_TIMEOUT_MS || '250', 10);

// Lazy-load AWS SDK only in production when needed
let dynamoDB: any = null;
let initPromise: Promise<void> | null = null; // Prevent double-init

/**
 * Initialize DynamoDB client (async, single initialization per runtime)
 */
async function initDynamoDBClient(): Promise<void> {
  // Return existing init if in progress or complete
  if (initPromise) {
    return initPromise;
  }
  
  // Skip init if not needed
  if (isDev || !enableAudit || !tableName || dynamoDB !== null) {
    return;
  }
  
  // Create shared init promise
  initPromise = (async () => {
    try {
      // Use AWS SDK v3 with dynamic ESM import
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
      
      const client = new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      
      dynamoDB = DynamoDBDocumentClient.from(client);
      
      console.log(`[ProviderAudit] DynamoDB client initialized (table: ${tableName})`);
    } catch (error) {
      console.warn('[ProviderAudit] Failed to initialize DynamoDB client:', error);
      dynamoDB = null;
    }
  })();
  
  return initPromise;
}

/**
 * Get initialized DynamoDB client
 */
async function getDynamoDBClient() {
  await initDynamoDBClient();
  return dynamoDB;
}

/**
 * Timeout promise helper for Lambda-safe writes
 */
function timeoutPromise(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Record provider call to DynamoDB audit table
 * 
 * Table schema:
 * - PK: traceId (String)
 * - SK: timestamp#provider#operation (String) - for querying by time
 * - ttl: Unix timestamp (Number) - DynamoDB TTL attribute
 * - All other fields from ProviderTraceEvent
 * 
 * Lambda-safe: Optionally awaits with timeout if PROVIDER_AUDIT_AWAIT=true
 */
export async function recordProviderCall(event: ProviderTraceEvent): Promise<void> {
  // Skip in dev or if not enabled
  if (isDev || !enableAudit || !tableName) {
    return;
  }

  const writePromise = (async () => {
    const client = await getDynamoDBClient();
    if (!client) {
      return; // DynamoDB not available
    }

    try {
      // Calculate TTL (90 days from now)
      const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);
      
      // Build composite sort key for time-based queries
      const sk = `${event.timestamp}#${event.provider}#${event.operation}`;
      
      // Build item (only store metadata, not large payloads)
      const item = {
        traceId: event.traceId || 'unknown',
        sk,
        ttl,
        type: event.type,
        sessionId: event.sessionId,
        provider: event.provider,
        operation: event.operation,
        latencyMs: event.latencyMs,
        success: event.success,
        retryCount: event.retryCount,
        statusCode: event.statusCode,
        errorCode: event.errorCode,
        errorReason: event.errorReason,
        model: event.model,
        tokensIn: event.tokensIn,
        tokensOut: event.tokensOut,
        totalTokens: event.totalTokens,
        estimatedCostUsd: event.estimatedCostUsd,
        costUnknown: event.costUnknown,
        timestamp: event.timestamp,
        // Store small metadata only (skip large objects)
        metadataKeys: event.metadata ? Object.keys(event.metadata).join(',') : undefined,
      };

      // Import PutCommand dynamically
      const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
      
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        })
      );
    } catch (error) {
      // Log but don't throw - audit is best-effort
      console.error('[ProviderAudit] Failed to record call:', error);
    }
  })();

  if (shouldAwait) {
    // Lambda: await with configurable timeout (default 250ms)
    await Promise.race([writePromise, timeoutPromise(awaitTimeoutMs)]);
  } else {
    // Fire-and-forget with error logging
    writePromise.catch((err) => {
      console.error('[ProviderAudit] Failed to record call (fire-and-forget):', err);
    });
  }
}

/**
 * Query provider calls by traceId (for debugging)
 * Returns all provider calls for a given request
 */
export async function queryProviderCallsByTraceId(traceId: string): Promise<ProviderTraceEvent[]> {
  if (isDev || !enableAudit || !tableName) {
    return [];
  }

  const client = await getDynamoDBClient();
  if (!client) {
    return [];
  }

  try {
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
    
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'traceId = :traceId',
        ExpressionAttributeValues: {
          ':traceId': traceId,
        },
      })
    );

    return (result.Items || []) as ProviderTraceEvent[];
  } catch (error) {
    console.error('[ProviderAudit] Failed to query calls:', error);
    return [];
  }
}
