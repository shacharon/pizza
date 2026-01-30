/**
 * Social Action Executor
 * Handles social/sharing actions
 * 
 * Actions:
 * - SHARE: Share restaurant via Web Share API or clipboard
 * - SAVE_FAVORITE: Save restaurant to favorites
 */

import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SessionStore } from '../../state/session.store';
import type { ActionExecutionResult } from '../../domain/types/action.types';
import type { Restaurant } from '../../domain/types/search.types';
import type { ActionExecutor } from './action-executor.interface';

/**
 * Executor for SHARE action
 * Uses Web Share API if available, falls back to clipboard
 */
@Injectable({ providedIn: 'root' })
export class ShareExecutor implements ActionExecutor {
  execute(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      const shareData = {
        title: restaurant.name,
        text: `Check out ${restaurant.name} at ${restaurant.address}`,
        url: restaurant.website || window.location.href
      };

      if (navigator.share) {
        navigator.share(shareData).catch((error) => {
          console.warn('Share failed:', error);
        });
        return of({ success: true, message: 'Shared successfully' });
      } else {
        // Fallback: copy to clipboard
        const text = `${shareData.title} - ${shareData.text}`;
        navigator.clipboard?.writeText(text);
        return of({ success: true, message: 'Copied to clipboard' });
      }
    } catch (error: any) {
      return of({ success: false, message: 'Failed to share', error: error.message });
    }
  }
}

/**
 * Executor for SAVE_FAVORITE action
 * Saves restaurant to session store and localStorage
 */
@Injectable({ providedIn: 'root' })
export class FavoriteExecutor implements ActionExecutor {
  private readonly sessionStore = inject(SessionStore);

  execute(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      this.sessionStore.addToFavorites(restaurant.id);
      
      // Also save to localStorage as backup
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (!favorites.includes(restaurant.id)) {
        favorites.push(restaurant.id);
        localStorage.setItem('favorites', JSON.stringify(favorites));
      }

      return of({ success: true, message: 'Saved to favorites' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to save favorite', error: error.message });
    }
  }
}
