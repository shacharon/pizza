/**
 * Action Service Tests
 */

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ActionService } from './action.service';
import { ActionsStore } from '../state/actions.store';
import { SessionStore } from '../state/session.store';
import { AnalyticsService } from './analytics.service';
import type { Restaurant } from '../domain/types/search.types';

describe('ActionService', () => {
  let service: ActionService;
  let actionsStore: ActionsStore;
  let sessionStore: SessionStore;
  let analyticsService: jasmine.SpyObj<AnalyticsService>;

  const mockRestaurant: Restaurant = {
    id: 'restaurant-1',
    placeId: 'place-1',
    name: 'Test Restaurant',
    address: '123 Main St',
    location: { lat: 48.8566, lng: 2.3522 },
    phoneNumber: '+33123456789',
    website: 'https://example.com'
  };

  beforeEach(() => {
    const analyticsSpy = jasmine.createSpyObj('AnalyticsService', ['track', 'trackTiming', 'trackError']);

    sessionStorage.clear();
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ActionService,
        ActionsStore,
        SessionStore,
        { provide: AnalyticsService, useValue: analyticsSpy }
      ]
    });

    service = TestBed.inject(ActionService);
    actionsStore = TestBed.inject(ActionsStore);
    sessionStore = TestBed.inject(SessionStore);
    analyticsService = TestBed.inject(AnalyticsService) as jasmine.SpyObj<AnalyticsService>;
  });

  afterEach(() => {
    actionsStore.clearAll();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should execute L0 action immediately', (done) => {
    service.proposeAction('GET_DIRECTIONS', 0, mockRestaurant).subscribe({
      next: (proposal) => {
        expect(proposal.status).toBe('EXECUTED');
        expect(proposal.level).toBe(0);
        expect(analyticsService.track).toHaveBeenCalledWith('action_proposed', jasmine.any(Object));
        expect(analyticsService.track).toHaveBeenCalledWith('action_l0_auto_execute', jasmine.any(Object));
        expect(analyticsService.track).toHaveBeenCalledWith('action_executed', jasmine.any(Object));
        done();
      }
    });
  });

  it('should add L1 action to pending', (done) => {
    expect(actionsStore.pending().length).toBe(0);

    service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe({
      next: (proposal) => {
        expect(proposal.status).toBe('PENDING');
        expect(proposal.level).toBe(1);
        expect(actionsStore.pending().length).toBe(1);
        expect(analyticsService.track).toHaveBeenCalledWith('action_pending_approval', jasmine.any(Object));
        done();
      }
    });
  });

  it('should approve and execute L1 action', (done) => {
    service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe((proposal) => {
      expect(actionsStore.pending().length).toBe(1);

      service.approveAction(proposal.id).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(actionsStore.pending().length).toBe(0);
          expect(actionsStore.executed().length).toBe(1);
          expect(analyticsService.track).toHaveBeenCalledWith('action_approved', jasmine.any(Object));
          expect(analyticsService.track).toHaveBeenCalledWith('action_executed', jasmine.any(Object));
          done();
        }
      });
    });
  });

  it('should reject action', fakeAsync(() => {
    service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe((proposal) => {
      service.rejectAction(proposal.id);

      const action = actionsStore.allPending().find(a => a.id === proposal.id);
      expect(action?.status).toBe('REJECTED');
      expect(analyticsService.track).toHaveBeenCalledWith('action_rejected', jasmine.any(Object));

      tick(1100); // Wait for removal
      expect(actionsStore.allPending().find(a => a.id === proposal.id)).toBeUndefined();
    });

    tick();
  }));

  it('should fail to approve non-existent action', (done) => {
    service.approveAction('non-existent').subscribe({
      error: (error) => {
        expect(error.message).toContain('not found');
        done();
      }
    });
  });

  it('should fail to approve expired action', fakeAsync(() => {
    service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe((proposal) => {
      // Manually expire the action
      const action = actionsStore.pending()[0];
      action.expiresAt = new Date(Date.now() - 1000); // 1 second ago

      service.approveAction(proposal.id).subscribe({
        error: (error) => {
          expect(error.message).toContain('expired');
          expect(analyticsService.track).toHaveBeenCalledWith('action_expired', jasmine.any(Object));
        }
      });

      tick(1100);
    });

    tick();
  }));

  it('should save favorite to session store', (done) => {
    service.proposeAction('SAVE_FAVORITE', 0, mockRestaurant).subscribe({
      next: () => {
        expect(sessionStore.preferences().savedFavorites).toContain(mockRestaurant.id);

        // Also check localStorage backup
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        expect(favorites).toContain(mockRestaurant.id);
        done();
      }
    });
  });

  it('should handle actions without phone number', (done) => {
    const restaurantNoPhone = { ...mockRestaurant, phoneNumber: undefined };

    service.proposeAction('CALL_RESTAURANT', 0, restaurantNoPhone).subscribe({
      next: (result) => {
        expect(result.success).toBe(false);
        expect(result.error).toContain('not available');
        done();
      }
    });
  });

  it('should handle actions without website gracefully', (done) => {
    const restaurantNoWebsite = { ...mockRestaurant, website: undefined };

    service.proposeAction('VIEW_MENU', 0, restaurantNoWebsite).subscribe({
      next: (result) => {
        // Should fallback to Google search
        expect(result.success).toBe(true);
        done();
      }
    });
  });

  it('should generate unique IDs for actions', (done) => {
    const ids = new Set<string>();

    service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe((proposal1) => {
      ids.add(proposal1.id);

      service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe((proposal2) => {
        ids.add(proposal2.id);
        expect(ids.size).toBe(2); // Both IDs should be unique
        done();
      });
    });
  });

  it('should cleanup expired actions', fakeAsync(() => {
    service.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe((proposal) => {
      // Manually expire the action
      const action = actionsStore.allPending().find(a => a.id === proposal.id);
      if (action) {
        action.expiresAt = new Date(Date.now() - 1000);
      }

      service.cleanupExpired();

      const expiredAction = actionsStore.allPending().find(a => a.id === proposal.id);
      expect(expiredAction?.status).toBe('EXPIRED');
      expect(analyticsService.track).toHaveBeenCalledWith('action_expired_cleanup', jasmine.any(Object));

      tick(1100);
      expect(actionsStore.allPending().find(a => a.id === proposal.id)).toBeUndefined();
    });

    tick();
  }));

  it('should track all analytics events', (done) => {
    service.proposeAction('GET_DIRECTIONS', 0, mockRestaurant).subscribe({
      next: () => {
        expect(analyticsService.track).toHaveBeenCalledWith('action_proposed', jasmine.any(Object));
        expect(analyticsService.track).toHaveBeenCalledWith('action_l0_auto_execute', jasmine.any(Object));
        expect(analyticsService.track).toHaveBeenCalledWith('action_executing', jasmine.any(Object));
        expect(analyticsService.track).toHaveBeenCalledWith('action_executed', jasmine.any(Object));
        done();
      }
    });
  });
});

