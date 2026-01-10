/**
 * WebSocket Status Banner - Phase 6
 * Shows connection status and reconnection UI
 */

import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../core/services/ws-client.service';

@Component({
  selector: 'app-ws-status-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (status() === 'reconnecting') {
      <div class="ws-banner reconnecting">
        <span class="icon">⟳</span>
        <span>Reconnecting to server...</span>
      </div>
    }
    @if (status() === 'disconnected') {
      <div class="ws-banner disconnected">
        <span class="icon">⚠️</span>
        <span>Connection lost. Results may be outdated.</span>
        <button class="retry-btn" (click)="retry()">Retry</button>
      </div>
    }
  `,
  styles: [`
    .ws-banner {
      position: sticky;
      top: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      font-size: 0.9rem;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .reconnecting {
      background: #fff3cd;
      color: #856404;
      border-bottom: 1px solid #ffc107;
    }

    .disconnected {
      background: #f8d7da;
      color: #721c24;
      border-bottom: 1px solid #f5c6cb;
    }

    .icon {
      font-size: 1.2rem;
    }

    .retry-btn {
      margin-left: auto;
      padding: 0.25rem 0.75rem;
      background: white;
      border: 1px solid currentColor;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
      }
    }
  `]
})
export class WsStatusBannerComponent {
  private wsClient = inject(WsClientService);
  
  readonly status = this.wsClient.connectionStatus;
  
  retry() {
    this.wsClient.connect();
  }
}
