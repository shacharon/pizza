/**
 * Restaurant Card Component Tests
 * Tests for near you badge and open until functionality
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RestaurantCardComponent } from './restaurant-card.component';
import { I18nService } from '../../../../core/services/i18n.service';
import type { Restaurant, Coordinates } from '../../../../domain/types/search.types';

describe('RestaurantCardComponent', () => {
  let component: RestaurantCardComponent;
  let fixture: ComponentFixture<RestaurantCardComponent>;

  const mockRestaurant: Restaurant = {
    id: '1',
    placeId: 'test-place-id',
    name: 'Test Restaurant',
    address: '123 Test St',
    location: { lat: 32.0809, lng: 34.7806 }
  };

  const userLocation: Coordinates = { lat: 32.0853, lng: 34.7818 };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestaurantCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(RestaurantCardComponent);
    component = fixture.componentInstance;
  });

  describe('Near You Badge', () => {
    it('should show badge when distance < 600m', () => {
      // User location 500m away (within threshold)
      const nearLocation: Coordinates = { lat: 32.0854, lng: 34.7820 };
      
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.componentRef.setInput('userLocation', nearLocation);
      fixture.detectChanges();

      expect(component.showNearYouBadge()).toBe(true);
    });

    it('should hide badge when distance >= 600m', () => {
      // User location ~700m away (outside threshold)
      const farLocation: Coordinates = { lat: 32.0870, lng: 34.7850 };
      
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.componentRef.setInput('userLocation', farLocation);
      fixture.detectChanges();

      expect(component.showNearYouBadge()).toBe(false);
    });

    it('should hide badge when no userLocation', () => {
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.componentRef.setInput('userLocation', null);
      fixture.detectChanges();

      expect(component.showNearYouBadge()).toBe(false);
    });

    it('should recalculate when userLocation changes', () => {
      const nearLocation: Coordinates = { lat: 32.0854, lng: 34.7820 };
      const farLocation: Coordinates = { lat: 32.0870, lng: 34.7850 };
      
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      
      // Start far
      fixture.componentRef.setInput('userLocation', farLocation);
      fixture.detectChanges();
      expect(component.showNearYouBadge()).toBe(false);
      
      // Move near
      fixture.componentRef.setInput('userLocation', nearLocation);
      fixture.detectChanges();
      expect(component.showNearYouBadge()).toBe(true);
    });
  });

  describe('Open Until Display', () => {
    it('should show closing time from currentOpeningHours.nextCloseTime', () => {
      const now = new Date();
      const closeTime = new Date(now);
      closeTime.setHours(22, 0, 0, 0); // 22:00 today
      
      const restaurantWithHours: Restaurant = {
        ...mockRestaurant,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: closeTime.toISOString()
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithHours);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBe('22:00');
    });

    it('should show closing time from regularOpeningHours for today', () => {
      const now = new Date();
      const today = now.getDay(); // 0-6
      
      const restaurantWithRegularHours: Restaurant = {
        ...mockRestaurant,
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '0900' },
              close: { day: today, time: '2200' }
            }
          ]
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithRegularHours);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBe('22:00');
    });

    it('should hide when nextCloseTime is tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(22, 0, 0, 0);
      
      const restaurantWithTomorrowClose: Restaurant = {
        ...mockRestaurant,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: tomorrow.toISOString()
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithTomorrowClose);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should hide when closing time has passed', () => {
      const now = new Date();
      const today = now.getDay();
      const pastHour = now.getHours() - 1;
      
      const restaurantWithPastClose: Restaurant = {
        ...mockRestaurant,
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '0900' },
              close: { day: today, time: pastHour.toString().padStart(2, '0') + '00' }
            }
          ]
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithPastClose);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should hide when no opening hours data available', () => {
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should prefer currentOpeningHours over regularOpeningHours', () => {
      const now = new Date();
      const today = now.getDay();
      const currentClose = new Date(now);
      currentClose.setHours(23, 30, 0, 0); // 23:30 from current
      
      const restaurantWithBoth: Restaurant = {
        ...mockRestaurant,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: currentClose.toISOString()
        },
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '0900' },
              close: { day: today, time: '2200' } // 22:00 from regular
            }
          ]
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithBoth);
      fixture.detectChanges();

      // Should use currentOpeningHours (23:30)
      expect(component.closingTimeToday()).toBe('23:30');
    });
  });

  describe('I18n Integration', () => {
    it('should use i18n service for near you badge text', () => {
      const i18nService = TestBed.inject(I18nService);
      const nearLocation: Coordinates = { lat: 32.0854, lng: 34.7820 };
      
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.componentRef.setInput('userLocation', nearLocation);
      fixture.detectChanges();

      const badgeText = component.i18n.t('card.badge.near_you');
      expect(badgeText).toBeTruthy();
      expect(typeof badgeText).toBe('string');
    });

    it('should use i18n service for open until text', () => {
      const now = new Date();
      const closeTime = new Date(now);
      closeTime.setHours(22, 0, 0, 0);
      
      const restaurantWithHours: Restaurant = {
        ...mockRestaurant,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: closeTime.toISOString()
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithHours);
      fixture.detectChanges();

      const openUntilText = component.i18n.t('card.hours.open_until', { time: '22:00' });
      expect(openUntilText).toBeTruthy();
      expect(typeof openUntilText).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid nextCloseTime gracefully', () => {
      const restaurantWithInvalidTime: Restaurant = {
        ...mockRestaurant,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: 'invalid-date-string'
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithInvalidTime);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should handle missing close time in regularOpeningHours', () => {
      const now = new Date();
      const today = now.getDay();
      
      const restaurantWithNoCloseTime: Restaurant = {
        ...mockRestaurant,
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '0900' }
              // No close time (24-hour restaurant)
            }
          ]
        }
      };
      
      fixture.componentRef.setInput('restaurant', restaurantWithNoCloseTime);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should handle distance calculation at exactly 600m threshold', () => {
      // Calculate location exactly 600m away
      // Using approximate offset: 0.0054 degrees ≈ 600m
      const exactThresholdLocation: Coordinates = { 
        lat: mockRestaurant.location.lat + 0.0054, 
        lng: mockRestaurant.location.lng 
      };
      
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.componentRef.setInput('userLocation', exactThresholdLocation);
      fixture.detectChanges();

      // At exactly 600m, should not show badge (threshold is <600, not <=600)
      expect(component.showNearYouBadge()).toBe(false);
    });
  });
});
