/**
 * PWA Install Service
 * 
 * Detects and handles PWA installation:
 * - Shows install prompt ONLY when:
 *   1. App is not in standalone mode (not already installed)
 *   2. Browser supports beforeinstallprompt event
 *   3. User hasn't dismissed the prompt
 * - Provides method to trigger install prompt
 * - Tracks installation state
 */

import { Injectable, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaInstallService {
  // Install prompt event (captured when browser fires beforeinstallprompt)
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  // Signals for reactive UI
  readonly canInstall = signal(false);
  readonly isInstalled = signal(false);

  constructor() {
    this.initializeInstallDetection();
  }

  private initializeInstallDetection(): void {
    // Check if already installed (standalone mode)
    if (this.isStandaloneMode()) {
      this.isInstalled.set(true);
      this.canInstall.set(false);
      return;
    }

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      console.log('[PWA] beforeinstallprompt event fired');

      // Prevent default browser install prompt
      e.preventDefault();

      // Store the event for later use
      this.deferredPrompt = e as BeforeInstallPromptEvent;

      // Show our custom install UI
      this.canInstall.set(true);
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed successfully');
      this.isInstalled.set(true);
      this.canInstall.set(false);
      this.deferredPrompt = null;
    });
  }

  /**
   * Check if app is running in standalone mode (already installed)
   */
  private isStandaloneMode(): boolean {
    // Check if running as PWA (display-mode: standalone)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // iOS Safari fallback
    const isIosStandalone = (window.navigator as any).standalone === true;

    return isStandalone || isIosStandalone;
  }

  /**
   * Trigger the browser's install prompt
   * Returns true if install was accepted, false if dismissed
   */
  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) {
      console.warn('[PWA] No install prompt available');
      return false;
    }

    try {
      // Show the browser's install prompt
      await this.deferredPrompt.prompt();

      // Wait for the user's response
      const { outcome } = await this.deferredPrompt.userChoice;

      console.log('[PWA] Install prompt outcome:', outcome);

      if (outcome === 'accepted') {
        // User accepted - hide our UI
        this.canInstall.set(false);
        return true;
      } else {
        // User dismissed - keep UI visible (they might change their mind)
        return false;
      }
    } catch (error) {
      console.error('[PWA] Error showing install prompt:', error);
      return false;
    } finally {
      // Clear the deferred prompt (can only be used once)
      this.deferredPrompt = null;
    }
  }

  /**
   * Manually hide the install prompt (if user dismisses our UI)
   */
  hidePrompt(): void {
    this.canInstall.set(false);
  }
}
