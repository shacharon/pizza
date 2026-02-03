/**
 * Assistant Bottom Placeholder Component
 * Persistent bottom placeholder for subtitle-style assistant messages
 * 
 * FEATURES:
 * - Fixed-height placeholder that always reserves layout space
 * - Text-only display (no buttons/interaction)
 * - Fade/slide up animation for messages
 * - One message at a time
 * - Deduplication by (requestId + type + message hash)
 */

import { Component, input, computed, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AssistantCardMessage } from '../../../../facades/assistant-routing.types';

@Component({
  selector: 'app-assistant-bottom-placeholder',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-bottom-placeholder.component.html',
  styleUrl: './assistant-bottom-placeholder.component.scss'
})
export class AssistantBottomPlaceholderComponent {
  // Card messages from assistant stream
  readonly cardMessages = input<AssistantCardMessage[]>([]);

  // UI Language for RTL support
  readonly locale = input<string>('en');

  // Track seen message IDs to prevent duplicates
  private seenMessages = signal<Set<string>>(new Set());

  // Get the latest UNIQUE message to display (one at a time)
  readonly currentMessage = computed(() => {
    const messages = this.cardMessages();
    if (messages.length === 0) return null;

    // Deduplicate: Find the latest message that hasn't been seen yet
    const seen = this.seenMessages();
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgId = this.generateMessageId(msg);

      if (!seen.has(msgId)) {
        // Mark as seen and return
        this.markAsSeen(msgId);
        return msg;
      }
    }

    // All messages seen, show the latest one
    return messages[messages.length - 1];
  });

  // Check if there's content to display
  readonly hasContent = computed(() => !!this.currentMessage());

  // RTL support for Hebrew/Arabic
  readonly isRTL = computed(() => {
    const msg = this.currentMessage();
    if (!msg) return false;

    const lang = msg.language || this.locale();
    return ['he', 'ar'].includes(lang);
  });

  /**
   * Get message text (strip any HTML/formatting for text-only display)
   */
  getMessageText(): string {
    const msg = this.currentMessage();
    if (!msg) return '';

    // Use message content directly
    return msg.message || '';
  }

  /**
   * Get message type class for styling
   */
  getMessageTypeClass(): string {
    const msg = this.currentMessage();
    if (!msg) return '';

    return `message-${msg.type.toLowerCase()}`;
  }

  /**
   * Generate unique message ID for deduplication
   * Format: requestId:type:hash
   */
  private generateMessageId(msg: AssistantCardMessage): string {
    const hash = this.simpleHash(msg.message || '');
    return `${msg.requestId}:${msg.type}:${hash}`;
  }

  /**
   * Mark message as seen
   */
  private markAsSeen(msgId: string): void {
    this.seenMessages.update(seen => {
      const newSeen = new Set(seen);
      newSeen.add(msgId);

      // Limit seen set size to prevent memory leak (keep last 50)
      if (newSeen.size > 50) {
        const arr = Array.from(newSeen);
        this.seenMessages.set(new Set(arr.slice(-50)));
      } else {
        this.seenMessages.set(newSeen);
      }

      return newSeen;
    });
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
