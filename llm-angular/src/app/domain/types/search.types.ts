/**
 * Search Domain Types
 * Mirror backend response contracts
 */

export interface SearchRequest {
  query: string;
  sessionId?: string;
  userLocation?: Coordinates;
  filters?: SearchFilters;
  locale?: string;
  region?: string;
}

export interface SearchResponse {
  sessionId: string;
  query: ParsedQuery;
  results: Restaurant[];
  groups?: ResultGroup[];  // NEW: Phase B - Street grouping
  chips: RefinementChip[];
  assist?: MicroAssist;
  proposedActions?: ProposedActions;
  meta: SearchMeta;
}

export interface Restaurant {
  id: string;
  placeId: string;
  name: string;
  address: string;
  location: Coordinates;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  openNow?: boolean;
  photoUrl?: string;
  phoneNumber?: string;
  website?: string;
  tags?: string[];
  source?: string;  // NEW: Phase B
  groupKind?: 'EXACT' | 'NEARBY';  // NEW: Phase B
  distanceMeters?: number;  // NEW: Phase B
}

// Alias for backward compatibility
export type RestaurantResult = Restaurant;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SearchFilters {
  openNow?: boolean;
  priceLevel?: number;
  dietary?: string[];
  mustHave?: string[];
}

export interface RefinementChip {
  id: string;
  emoji: string;
  label: string;
  action: 'filter' | 'sort' | 'map';
  filter?: string;
}

export interface MicroAssist {
  type: 'clarify' | 'suggest' | 'guide';
  message: string;
  suggestedActions: { label: string; query: string }[];
}

export interface ParsedQuery {
  original: string;
  parsed: any;
  language: string;
}

export interface SearchMeta {
  tookMs: number;
  mode: string;
  appliedFilters: string[];
  confidence: number;
  source: string;
}

export interface ProposedActions {
  perResult: ActionDefinition[];
  selectedItem: ActionDefinition[];
}

export interface ActionDefinition {
  id: string;
  type: ActionType;
  level: ActionLevel;
  label: string;
  icon: string;
  requiresSelection?: boolean;
  enabled?: boolean;
}

// Re-export from action.types for convenience
export type ActionType =
  | 'VIEW_DETAILS'
  | 'GET_DIRECTIONS'
  | 'CALL_RESTAURANT'
  | 'SAVE_FAVORITE'
  | 'SHARE'
  | 'VIEW_MENU';

export type ActionLevel = 0 | 1 | 2;

// NEW: Phase B - Result Grouping Types
export type GroupKind = 'EXACT' | 'NEARBY';

export interface ResultGroup {
  kind: GroupKind;
  label: string;
  results: Restaurant[];
  distanceLabel?: string;
  radiusMeters?: number;
}


