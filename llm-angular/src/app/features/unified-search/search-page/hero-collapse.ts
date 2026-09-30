/**
 * Hero collapse thresholds with hysteresis.
 * Collapse and expand use different Y values so Android scroll jitter
 * near one threshold cannot flip the logo state every frame.
 */
export const HERO_COLLAPSE_Y = 160;
export const HERO_EXPAND_Y = 40;

/** How long to ignore the opposite scroll edge after a flip (ms). */
export const HERO_COLLAPSE_LOCK_MS = 320;

/**
 * Next collapsed state for the hero logo swap.
 * When already collapsed, stay collapsed until scroll is near the top.
 * When expanded, collapse only after a real scroll past HERO_COLLAPSE_Y.
 */
export function nextHeroCollapsed(scrollTop: number, collapsed: boolean): boolean {
  if (collapsed) {
    return scrollTop >= HERO_EXPAND_Y;
  }
  return scrollTop > HERO_COLLAPSE_Y;
}
