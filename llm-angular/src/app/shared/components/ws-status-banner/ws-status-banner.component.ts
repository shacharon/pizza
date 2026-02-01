/**
 * WebSocket Status Banner - Phase 6 + Silent Reconnect
 * Shows minimal connection status - only after 30s of disconnection
 * NO error UI for transient failures
 */

import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WsClientService } from '../../../core/services/ws-client.service';
import { t, type Lang } from '../../../i18n/search-narration.i18n';

@Component({
  selector: 'app-ws-status-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (showBanner()) {
      <div class="ws-banner reconnecting">
        <span class="icon">⟳</span>
        <span>{{ t('en', 'ws.reconnecting') }}</span>
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

    .icon {
      font-size: 1.2rem;
      animation: rotate 1s linear infinite;
    }

    @keyframes rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `]
})
export class WsStatusBannerComponent {
  private wsClient = inject(WsClientService);

  // Expose t function for template
  readonly t = t;

  readonly status = this.wsClient.connectionStatus;
  readonly showBanner = signal(false);

  private disconnectTimer?: number;

  constructor() {
    // Only show banner after 30s of being disconnected/reconnecting
    effect(() => {
      const currentStatus = this.status();

      if (currentStatus === 'connected') {
        // Clear timer and hide banner immediately on connect
        if (this.disconnectTimer) {
          clearTimeout(this.disconnectTimer);
          this.disconnectTimer = undefined;
        }
        this.showBanner.set(false);
      } else if (currentStatus === 'disconnected' || currentStatus === 'reconnecting') {
        // Start 30s timer if not already running
        if (!this.disconnectTimer) {
          this.disconnectTimer = window.setTimeout(() => {
            this.showBanner.set(true);
          }, 30_000); // 30 seconds
        }
      }
    });
  }
}
