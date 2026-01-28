/**
 * Assistant Panel Component
 * Persistent panel showing assistant progress messages from WebSocket
 * UX-only narration (no chips/filters/state changes)
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { Subscription } from 'rxjs';

/**
 * Assistant message interface
 */
interface AssistantMessage {
  requestId: string;
  seq: number;
  message: string;
  type: 'assistant_progress' | 'assistant_suggestion';
  timestamp: number;
}

@Component({
  selector: 'app-assistant-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assistant-panel.component.html',
  styleUrl: './assistant-panel.component.scss'
})
export class AssistantPanelComponent implements OnInit, OnDestroy {
  // All messages for current requestId
  private allMessages = signal<AssistantMessage[]>([]);
  
  // Visible messages (last 3 only)
  readonly messages = computed(() => {
    const all = this.allMessages();
    return all.slice(-3); // Show only last 3
  });
  
  // Current requestId being tracked
  private currentRequestId = signal<string | null>(null);
  
  // Track seen messages to deduplicate
  private seenMessages = new Set<string>();
  
  // WebSocket subscription
  private wsSubscription?: Subscription;
  
  constructor(private wsClient: WsClientService) {}
  
  ngOnInit(): void {
    this.subscribeToWebSocket();
  }
  
  ngOnDestroy(): void {
    this.wsSubscription?.unsubscribe();
  }
  
  /**
   * Subscribe to WebSocket messages
   */
  private subscribeToWebSocket(): void {
    this.wsSubscription = this.wsClient.messages$.subscribe((message: any) => {
      // Handle both old format (assistant_progress/suggestion) and new format (assistant_message)
      if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
        this.handleAssistantMessage(message);
      } else if (message.type === 'assistant_message' && message.narrator) {
        this.handleNarratorMessage(message);
      }
    });
  }
  
  /**
   * Handle incoming assistant message (old format)
   */
  private handleAssistantMessage(msg: any): void {
    // Validate message structure
    if (!msg.requestId || typeof msg.seq !== 'number' || !msg.message) {
      console.warn('[AssistantPanel] Invalid message structure:', msg);
      return;
    }
    
    const { requestId, seq, message, type } = msg;
    
    // Check if this is a new requestId
    if (this.currentRequestId() !== requestId) {
      // New search started - clear old messages
      this.clearMessages();
      this.currentRequestId.set(requestId);
    }
    
    // Deduplicate: check if we've already seen this (requestId, seq)
    const messageKey = `${requestId}-${seq}`;
    if (this.seenMessages.has(messageKey)) {
      return; // Duplicate - ignore
    }
    
    // Add message
    this.seenMessages.add(messageKey);
    
    const assistantMsg: AssistantMessage = {
      requestId,
      seq,
      message,
      type: type as 'assistant_progress' | 'assistant_suggestion',
      timestamp: Date.now()
    };
    
    // Insert message in correct position (sorted by seq)
    const currentMessages = this.allMessages();
    const newMessages = [...currentMessages, assistantMsg].sort((a, b) => a.seq - b.seq);
    this.allMessages.set(newMessages);
  }
  
  /**
   * Handle narrator message (new format from backend)
   */
  private handleNarratorMessage(msg: any): void {
    // Validate message structure
    if (!msg.requestId || !msg.narrator || !msg.narrator.message) {
      console.warn('[AssistantPanel] Invalid narrator message structure:', msg);
      return;
    }
    
    const { requestId, narrator, timestamp } = msg;
    
    // Check if this is a new requestId
    if (this.currentRequestId() !== requestId) {
      // New search started - clear old messages
      this.clearMessages();
      this.currentRequestId.set(requestId);
    }
    
    // Generate seq based on narrator type (GATE_FAIL=1, CLARIFY=2, SUMMARY=3)
    const seq = narrator.type === 'GATE_FAIL' ? 1 : narrator.type === 'CLARIFY' ? 2 : 3;
    
    // Deduplicate: check if we've already seen this (requestId, seq)
    const messageKey = `${requestId}-${seq}`;
    if (this.seenMessages.has(messageKey)) {
      return; // Duplicate - ignore
    }
    
    // Add message
    this.seenMessages.add(messageKey);
    
    // Determine type: SUMMARY -> suggestion, others -> progress
    const type = narrator.type === 'SUMMARY' ? 'assistant_suggestion' : 'assistant_progress';
    
    // Prefer question over message for CLARIFY
    const displayMessage = narrator.question || narrator.message;
    
    const assistantMsg: AssistantMessage = {
      requestId,
      seq,
      message: displayMessage,
      type: type as 'assistant_progress' | 'assistant_suggestion',
      timestamp: timestamp || Date.now()
    };
    
    console.log('[AssistantPanel] Narrator message added:', narrator.type, displayMessage);
    
    // Insert message in correct position (sorted by seq)
    const currentMessages = this.allMessages();
    const newMessages = [...currentMessages, assistantMsg].sort((a, b) => a.seq - b.seq);
    this.allMessages.set(newMessages);
  }
  
  /**
   * Clear all messages (user action)
   */
  clearMessages(): void {
    this.allMessages.set([]);
    this.seenMessages.clear();
  }
  
  /**
   * Get icon for message type
   */
  getIcon(type: string): string {
    switch (type) {
      case 'assistant_progress':
        return '🔄';
      case 'assistant_suggestion':
        return '💡';
      default:
        return '📝';
    }
  }
}
