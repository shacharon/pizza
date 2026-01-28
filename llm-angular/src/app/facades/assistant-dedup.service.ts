/**
 * Assistant Message Deduplication Service
 * Handles client-side deduplication with messageId generation
 * 
 * MessageId format: ${requestId}:${type}:${seq ?? ts ?? hash(message)}
 */

import { Injectable } from '@angular/core';

@Injectable()
export class AssistantDedupService {
  // Seen messages per requestId
  private readonly seenByRequest = new Map<string, Set<string>>();
  
  /**
   * Generate stable messageId for deduplication
   */
  generateMessageId(
    requestId: string,
    type: string,
    payload: {
      seq?: number;
      ts?: number;
      message?: string;
    }
  ): string {
    // Use seq if available (most reliable)
    if (payload.seq !== undefined) {
      return `${requestId}:${type}:seq-${payload.seq}`;
    }
    
    // Use timestamp if available
    if (payload.ts) {
      return `${requestId}:${type}:ts-${payload.ts}`;
    }
    
    // Fallback: hash of message content
    const hash = this.simpleHash(payload.message || '');
    return `${requestId}:${type}:hash-${hash}`;
  }
  
  /**
   * Check if message is duplicate and mark as seen
   * Returns true if duplicate (should drop), false if new (should process)
   */
  checkAndMarkSeen(requestId: string, messageId: string): boolean {
    // Get or create seen set for this request
    let seen = this.seenByRequest.get(requestId);
    if (!seen) {
      seen = new Set();
      this.seenByRequest.set(requestId, seen);
    }
    
    // Check if already seen
    if (seen.has(messageId)) {
      return true; // Duplicate
    }
    
    // Mark as seen
    seen.add(messageId);
    return false; // New message
  }
  
  /**
   * Clear seen messages for a requestId
   */
  clearRequest(requestId: string): void {
    this.seenByRequest.delete(requestId);
  }
  
  /**
   * Clear all seen messages
   */
  clearAll(): void {
    this.seenByRequest.clear();
  }
  
  /**
   * Simple string hash (FNV-1a algorithm)
   */
  private simpleHash(str: string): string {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }
    return (hash >>> 0).toString(36); // Convert to base36
  }
}
