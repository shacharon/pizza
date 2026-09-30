import { HERO_COLLAPSE_Y, HERO_EXPAND_Y, nextHeroCollapsed } from './hero-collapse';

describe('nextHeroCollapsed', () => {
  it('stays expanded below and at the collapse threshold', () => {
    expect(nextHeroCollapsed(0, false)).toBe(false);
    expect(nextHeroCollapsed(HERO_COLLAPSE_Y, false)).toBe(false);
  });

  it('collapses only after scrolling past the collapse threshold', () => {
    expect(nextHeroCollapsed(HERO_COLLAPSE_Y + 1, false)).toBe(true);
  });

  it('stays collapsed in the hysteresis band between expand and collapse', () => {
    expect(nextHeroCollapsed(HERO_EXPAND_Y, true)).toBe(true);
    expect(nextHeroCollapsed(100, true)).toBe(true);
    expect(nextHeroCollapsed(HERO_COLLAPSE_Y, true)).toBe(true);
  });

  it('expands only when scroll is near the top', () => {
    expect(nextHeroCollapsed(HERO_EXPAND_Y - 1, true)).toBe(false);
    expect(nextHeroCollapsed(0, true)).toBe(false);
  });
});
