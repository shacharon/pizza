/**
 * Flags Store Tests
 */

import { TestBed } from '@angular/core/testing';
import { FlagsStore } from './flags.store';

describe('FlagsStore', () => {
  let store: FlagsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FlagsStore]
    });
    store = TestBed.inject(FlagsStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should have empty initial state', () => {
    expect(store.flags()).toEqual({});
    expect(store.unifiedSearchEnabled()).toBe(false);
    expect(store.actionProposalsEnabled()).toBe(false);
  });

  it('should set multiple flags', () => {
    const flags = {
      unifiedSearch: true,
      actionProposals: false,
      newFeature: true
    };

    store.setFlags(flags);

    expect(store.flags()).toEqual(flags);
    expect(store.isEnabled('unifiedSearch')).toBe(true);
    expect(store.isEnabled('actionProposals')).toBe(false);
    expect(store.isEnabled('newFeature')).toBe(true);
  });

  it('should set individual flag', () => {
    store.setFlag('unifiedSearch', true);

    expect(store.isEnabled('unifiedSearch')).toBe(true);
    expect(store.unifiedSearchEnabled()).toBe(true);
  });

  it('should update existing flag', () => {
    store.setFlags({ unifiedSearch: false });
    expect(store.isEnabled('unifiedSearch')).toBe(false);

    store.setFlag('unifiedSearch', true);
    expect(store.isEnabled('unifiedSearch')).toBe(true);
  });

  it('should return false for non-existent flag', () => {
    expect(store.isEnabled('nonExistentFlag')).toBe(false);
  });

  it('should have computed signals for common flags', () => {
    store.setFlags({
      unifiedSearch: true,
      actionProposals: true
    });

    expect(store.unifiedSearchEnabled()).toBe(true);
    expect(store.actionProposalsEnabled()).toBe(true);
  });

  it('should reset flags', () => {
    store.setFlags({
      unifiedSearch: true,
      actionProposals: true
    });

    expect(store.flags()).not.toEqual({});

    store.reset();

    expect(store.flags()).toEqual({});
    expect(store.unifiedSearchEnabled()).toBe(false);
  });

  it('should preserve other flags when setting individual flag', () => {
    store.setFlags({
      flag1: true,
      flag2: false
    });

    store.setFlag('flag3', true);

    expect(store.isEnabled('flag1')).toBe(true);
    expect(store.isEnabled('flag2')).toBe(false);
    expect(store.isEnabled('flag3')).toBe(true);
  });
});













