/**
 * Feature Flag Guard Tests
 */

import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { featureFlagGuard, unifiedSearchGuard } from './feature-flag.guard';
import { FlagsStore } from '../../state/flags.store';

describe('featureFlagGuard', () => {
  let flagsStore: FlagsStore;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FlagsStore,
        {
          provide: Router,
          useValue: {
            createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({} as UrlTree)
          }
        }
      ]
    });

    flagsStore = TestBed.inject(FlagsStore);
    router = TestBed.inject(Router);
  });

  it('should allow access when flag is enabled', () => {
    flagsStore.setFlag('testFeature', true);

    const guard = featureFlagGuard('testFeature');
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(result).toBe(true);
  });

  it('should redirect when flag is disabled', () => {
    flagsStore.setFlag('testFeature', false);

    const guard = featureFlagGuard('testFeature');
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/food/grid']);
    expect(result).toBeTruthy();
  });

  it('should redirect to custom path when specified', () => {
    flagsStore.setFlag('testFeature', false);

    const guard = featureFlagGuard('testFeature', '/custom-path');
    TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/custom-path']);
  });

  it('should default to false when flag does not exist', () => {
    const guard = featureFlagGuard('nonExistentFeature');
    const result = TestBed.runInInjectionContext(() => guard({} as any, {} as any));

    expect(router.createUrlTree).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});

describe('unifiedSearchGuard', () => {
  let flagsStore: FlagsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FlagsStore,
        {
          provide: Router,
          useValue: {
            createUrlTree: jasmine.createSpy('createUrlTree').and.returnValue({} as UrlTree)
          }
        }
      ]
    });

    flagsStore = TestBed.inject(FlagsStore);
  });

  it('should check unifiedSearch flag', () => {
    flagsStore.setFlag('unifiedSearch', true);

    const result = TestBed.runInInjectionContext(() => unifiedSearchGuard({} as any, {} as any));

    expect(result).toBe(true);
  });
});








