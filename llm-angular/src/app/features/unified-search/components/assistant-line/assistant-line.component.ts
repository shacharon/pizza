/**
 * Assistant Line Component
 * Single-line status showing the latest assistant message
 * Replaces the multi-message AssistantPanel with a calm inline status
 */

import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { Subscription } from 'rxjs';

interface AssistantMessage {
  requestId: string;
  seq: number;
  message: string;
  type: 'assistant_progress' | 'assistant_suggestion';
}

@Component({
  selector: 'app-assistant-line',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (displayMessage()) {
    <div class="assistant-line">
      <span class="assistant-text">{{ displayMessage() }}</span>
      <button class="clear-btn" (click)="clearMessage()" type="button" aria-label="Clear">✕</button>
    </div>
    }
  `,
  styles: [`
    .assistant-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 0;
    }

    .assistant-text {
      flex: 1;
      color: #9ca3af;
      font-size: 0.8125rem;
      line-height: 1.3;
      font-style: normal;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .clear-btn {
      flex-shrink: 0;
      background: transparent;
      border: none;
      color: #9ca3af;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.25rem;
      border-radius: 3px;
      transition: all 0.15s ease;

      &:hover {
        color: #6b7280;
        background: #e5e7eb;
      }

      &:active {
        background: #d1d5db;
      }
    }

    @media (max-width: 767px) {
      .assistant-text {
        font-size: 0.75rem;
      }

      .clear-btn {
        font-size: 0.9375rem;
      }
    }
  `]
})
export class AssistantLineComponent implements OnInit, OnDestroy {
  // Currently displayed message
  readonly displayMessage = signal<string | null>(null);
  
  // Current requestId being tracked
  private currentRequestId: string | null = null;
  
  // Queue for staggered updates
  private messageQueue: AssistantMessage[] = [];
  private isProcessingQueue = false;
  
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
      // Only process assistant_progress and assistant_suggestion events
      if (message.type === 'assistant_progress' || message.type === 'assistant_suggestion') {
        this.handleAssistantMessage(message);
      }
    });
  }
  
  /**
   * Handle incoming assistant message
   */
  private handleAssistantMessage(msg: any): void {
    // Validate message structure
    if (!msg.requestId || typeof msg.seq !== 'number' || !msg.message) {
      return;
    }
    
    const { requestId, seq, message, type } = msg;
    
    // Check if this is a new requestId
    if (this.currentRequestId !== requestId) {
      // New search - clear queue and display
      this.messageQueue = [];
      this.currentRequestId = requestId;
      this.isProcessingQueue = false;
    }
    
    // Add to queue
    this.messageQueue.push({
      requestId,
      seq,
      message,
      type: type as 'assistant_progress' | 'assistant_suggestion'
    });
    
    // Sort queue by seq
    this.messageQueue.sort((a, b) => a.seq - b.seq);
    
    // Process queue if not already processing
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }
  
  /**
   * Process message queue with staggered updates (250ms delay)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg && msg.requestId === this.currentRequestId) {
        // Update display
        this.displayMessage.set(msg.message);
        
        // Wait 250ms before next update (stagger effect)
        if (this.messageQueue.length > 0) {
          await this.delay(250);
        }
      }
    }
    
    this.isProcessingQueue = false;
  }
  
  /**
   * Delay helper for staggered updates
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Clear message (user action)
   */
  clearMessage(): void {
    this.displayMessage.set(null);
    this.messageQueue = [];
  }
}
