/**
 * Session Domain Types
 * User session and preference management
 */

import type { Restaurant } from './search.types';

export interface SessionState {
  conversationId: string;
  locale: string;
  region: string;
  selectedRestaurant: Restaurant | null;
  preferences: UserPreferences;
}

export interface UserPreferences {
  savedFavorites: string[];
  recentSearches: string[];
}











