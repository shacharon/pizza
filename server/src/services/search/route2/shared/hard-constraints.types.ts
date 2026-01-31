/**
 * Hard Constraints Configuration - Route2 Pipeline
 * 
 * Hard constraints are NEVER auto-relaxed by the system.
 * They can only be relaxed with explicit user override flags.
 * 
 * Current hard constraints:
 * - kosher (isKosher=true): Religious dietary requirement
 * - meatDairy (cuisineKey='meat'|'dairy'): Kosher meat/dairy separation
 */

import type { FinalSharedFilters } from './shared-filters.types.js';
import type { PostConstraints } from './post-constraints.types.js';

/**
 * Hard constraint field names
 */
export type HardConstraintField = 'isKosher' | 'meatDairy';

/**
 * Hard constraints configuration
 */
export interface HardConstraints {
  /** List of constraint field names that are hard (never auto-relaxed) */
  fields: HardConstraintField[];

  /** Reason codes for each hard constraint */
  reasons: Record<HardConstraintField, string>;
}

/**
 * User override flags (for future use)
 * By default, all hard constraints are enforced
 */
export interface HardConstraintOverrides {
  /** If true, allow system to relax kosher constraint (default: false) */
  allowRelaxKosher?: boolean;

  /** If true, allow system to relax meat/dairy constraint (default: false) */
  allowRelaxMeatDairy?: boolean;
}

/**
 * Detect which hard constraints are active based on filters
 * 
 * @param filters Current filter configuration (merged base + post)
 * @param cuisineKey Current cuisine key from textsearch mapper
 * @returns Array of active hard constraint field names
 */
export function detectHardConstraints(
  filters: FinalSharedFilters | any,
  cuisineKey?: string | null
): HardConstraintField[] {
  const active: HardConstraintField[] = [];

  // Check kosher constraint
  if (filters.isKosher === true) {
    active.push('isKosher');
  }

  // Check meat/dairy cuisine constraint
  if (cuisineKey === 'meat' || cuisineKey === 'dairy') {
    active.push('meatDairy');
  }

  return active;
}

/**
 * Check if a specific constraint field is hard (never auto-relaxed)
 * 
 * @param field Field name to check
 * @param activeHardConstraints List of currently active hard constraints
 * @returns True if field is a hard constraint and currently active
 */
export function isHardConstraint(
  field: string,
  activeHardConstraints: HardConstraintField[]
): boolean {
  return activeHardConstraints.includes(field as HardConstraintField);
}

/**
 * Get reason code for denying relaxation of a hard constraint
 * 
 * @param field Hard constraint field name
 * @returns Reason code for logging
 */
export function getHardConstraintReason(field: HardConstraintField): string {
  const reasons: Record<HardConstraintField, string> = {
    isKosher: 'religious_dietary_requirement',
    meatDairy: 'kosher_meat_dairy_separation'
  };

  return reasons[field];
}

/**
 * Build hard constraints metadata for logging
 * 
 * @param activeHardConstraints List of active hard constraint field names
 * @returns Metadata object for structured logging
 */
export function buildHardConstraintsMetadata(
  activeHardConstraints: HardConstraintField[]
): {
  active: HardConstraintField[];
  count: number;
  hasKosher: boolean;
  hasMeatDairy: boolean;
} {
  return {
    active: activeHardConstraints,
    count: activeHardConstraints.length,
    hasKosher: activeHardConstraints.includes('isKosher'),
    hasMeatDairy: activeHardConstraints.includes('meatDairy')
  };
}

/**
 * Check if user has explicitly allowed relaxation of a hard constraint
 * 
 * @param field Hard constraint field name
 * @param overrides User override flags (optional)
 * @returns True if user explicitly allowed relaxation (default: false)
 */
export function isRelaxationAllowed(
  field: HardConstraintField,
  overrides?: HardConstraintOverrides
): boolean {
  if (!overrides) {
    return false; // No overrides = strict enforcement
  }

  switch (field) {
    case 'isKosher':
      return overrides.allowRelaxKosher === true;
    case 'meatDairy':
      return overrides.allowRelaxMeatDairy === true;
    default:
      return false;
  }
}
