/**
 * Navigation Action Executor
 * Handles navigation-related actions: maps, dialer, website
 * 
 * Actions:
 * - GET_DIRECTIONS: Opens Google Maps
 * - CALL_RESTAURANT: Opens phone dialer
 * - VIEW_MENU: Opens restaurant website
 * - VIEW_DETAILS: Opens restaurant website or search
 */

import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import type { ActionExecutionResult } from '../../domain/types/action.types';
import type { Restaurant } from '../../domain/types/search.types';
import type { ActionExecutor } from './action-executor.interface';

/**
 * Executor for GET_DIRECTIONS action
 * Opens Google Maps with restaurant location
 */
@Injectable({ providedIn: 'root' })
export class DirectionsExecutor implements ActionExecutor {
  execute(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      const url = `https://www.google.com/maps/search/?api=1&query=${restaurant.location.lat},${restaurant.location.lng}&query_place_id=${restaurant.placeId}`;
      window.open(url, '_blank');
      return of({ success: true, message: 'Opened Google Maps' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to open maps', error: error.message });
    }
  }
}

/**
 * Executor for CALL_RESTAURANT action
 * Opens phone dialer with restaurant phone number
 */
@Injectable({ providedIn: 'root' })
export class CallExecutor implements ActionExecutor {
  execute(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      if (restaurant.phoneNumber) {
        window.location.href = `tel:${restaurant.phoneNumber}`;
        return of({ success: true, message: 'Opened phone dialer' });
      }
      return of({ success: false, message: 'No phone number', error: 'Phone number not available' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to open dialer', error: error.message });
    }
  }
}

/**
 * Executor for VIEW_MENU and VIEW_DETAILS actions
 * Opens restaurant website or falls back to Google search
 */
@Injectable({ providedIn: 'root' })
export class WebsiteExecutor implements ActionExecutor {
  execute(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      if (restaurant.website) {
        window.open(restaurant.website, '_blank');
        return of({ success: true, message: 'Opened website' });
      }
      // Fallback: Google search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(restaurant.name)}`;
      window.open(searchUrl, '_blank');
      return of({ success: true, message: 'Opened search results' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to open website', error: error.message });
    }
  }
}
