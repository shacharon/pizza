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
    it('should show closing time from currentOpeningHours.nextCloseTime when open', () => {
      const now = new Date();
      const closeTime = new Date(now);
      closeTime.setHours(22, 0, 0, 0); // 22:00 today

      const restaurantWithHours: Restaurant = {
        ...mockRestaurant,
        openNow: true, // CRITICAL: Must be open
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: closeTime.toISOString()
        }
      };

      fixture.componentRef.setInput('restaurant', restaurantWithHours);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBe('22:00');
    });

    it('should HIDE closing time when restaurant is CLOSED', () => {
      const now = new Date();
      const closeTime = new Date(now);
      closeTime.setHours(22, 0, 0, 0);

      const closedRestaurant: Restaurant = {
        ...mockRestaurant,
        openNow: false, // Restaurant is CLOSED
        currentOpeningHours: {
          openNow: false,
          nextCloseTime: closeTime.toISOString()
        }
      };

      fixture.componentRef.setInput('restaurant', closedRestaurant);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should HIDE closing time when openNow status is UNKNOWN', () => {
      const now = new Date();
      const closeTime = new Date(now);
      closeTime.setHours(22, 0, 0, 0);

      const unknownRestaurant: Restaurant = {
        ...mockRestaurant,
        openNow: 'UNKNOWN', // Status is uncertain
        currentOpeningHours: {
          nextCloseTime: closeTime.toISOString()
        }
      };

      fixture.componentRef.setInput('restaurant', unknownRestaurant);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
    });

    it('should show closing time from regularOpeningHours for today when open', () => {
      const now = new Date();
      const today = now.getDay(); // 0-6

      const restaurantWithRegularHours: Restaurant = {
        ...mockRestaurant,
        openNow: true, // Must be open
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

    it('should HIDE when multiple periods for same day (ambiguous)', () => {
      const now = new Date();
      const today = now.getDay();

      const ambiguousRestaurant: Restaurant = {
        ...mockRestaurant,
        openNow: true,
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '0900' },
              close: { day: today, time: '1400' } // Lunch
            },
            {
              open: { day: today, time: '1700' },
              close: { day: today, time: '2200' } // Dinner
            }
          ]
        }
      };

      fixture.componentRef.setInput('restaurant', ambiguousRestaurant);
      fixture.detectChanges();

      // RULE: Multiple periods → ambiguous → hide
      expect(component.closingTimeToday()).toBeNull();
    });

    it('should show after-midnight closing time (e.g., 01:00)', () => {
      const now = new Date();
      now.setHours(23, 30, 0, 0); // 11:30 PM
      const today = now.getDay();

      const lateNightRestaurant: Restaurant = {
        ...mockRestaurant,
        openNow: true,
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '1800' }, // 6 PM
              close: { day: today, time: '0100' }  // 1 AM (next day)
            }
          ]
        }
      };

      fixture.componentRef.setInput('restaurant', lateNightRestaurant);
      fixture.detectChanges();

      // Should show 01:00 even though it's technically "tomorrow"
      expect(component.closingTimeToday()).toBe('01:00');
    });

    it('should hide when nextCloseTime is tomorrow (late)', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(22, 0, 0, 0); // 10 PM tomorrow

      const restaurantWithTomorrowClose: Restaurant = {
        ...mockRestaurant,
        openNow: true,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: tomorrow.toISOString()
        }
      };

      fixture.componentRef.setInput('restaurant', restaurantWithTomorrowClose);
      fixture.detectChanges();

      // Late tomorrow closing (10 PM) shouldn't show for "today"
      expect(component.closingTimeToday()).toBeNull();
    });

    it('should show early morning closing time (within 6 hours, before 6am)', () => {
      const now = new Date();
      now.setHours(23, 0, 0, 0); // 11 PM today

      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0); // 2 AM tomorrow (3 hours from now)

      const earlyMorningRestaurant: Restaurant = {
        ...mockRestaurant,
        openNow: true,
        currentOpeningHours: {
          openNow: true,
          nextCloseTime: tomorrow.toISOString()
        }
      };

      fixture.componentRef.setInput('restaurant', earlyMorningRestaurant);
      fixture.detectChanges();

      // Early morning close (2 AM) should show as part of "today's" session
      expect(component.closingTimeToday()).toBe('02:00');
    });

    it('should format midnight closing time as "24:00"', () => {
      // Set up restaurant with regularOpeningHours that closes at midnight (0000)
      const now = new Date();
      now.setHours(22, 0, 0, 0); // 10 PM - restaurant is still open
      jasmine.clock().mockDate(now);
      
      const today = now.getDay();

      const restaurantWithMidnightClose: Restaurant = {
        ...mockRestaurant,
        openNow: true,
        regularOpeningHours: {
          periods: [
            {
              open: { day: today, time: '0900' },
              close: { day: today, time: '0000' } // Closes at midnight
            }
          ]
        }
      };

      fixture.componentRef.setInput('restaurant', restaurantWithMidnightClose);
      fixture.detectChanges();

      // Should display as "24:00" not "00:00"
      expect(component.closingTimeToday()).toBe('24:00');
    });

    it('should hide when closing time has passed', () => {
      const now = new Date();
      const today = now.getDay();
      const pastHour = Math.max(0, now.getHours() - 1);

      const restaurantWithPastClose: Restaurant = {
        ...mockRestaurant,
        openNow: true, // Even if marked open (might be stale data)
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
        openNow: true,
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

    it('should hide when openNow is missing/undefined', () => {
      const now = new Date();
      const closeTime = new Date(now);
      closeTime.setHours(22, 0, 0, 0);

      const restaurantNoStatus: Restaurant = {
        ...mockRestaurant,
        // openNow is undefined
        currentOpeningHours: {
          nextCloseTime: closeTime.toISOString()
        }
      };

      fixture.componentRef.setInput('restaurant', restaurantNoStatus);
      fixture.detectChanges();

      expect(component.closingTimeToday()).toBeNull();
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
        openNow: true,
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

    describe('Open Until - All Languages', () => {
      const testTime = '23:00';

      it('should render correctly in Hebrew (he)', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('he');

        const openUntilText = component.i18n.t('card.hours.open_until', { time: testTime });
        expect(openUntilText).toBe(`פתוח עד ${testTime}`);
      });

      it('should render correctly in English (en)', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('en');

        const openUntilText = component.i18n.t('card.hours.open_until', { time: testTime });
        expect(openUntilText).toBe(`Open until ${testTime}`);
      });

      it('should render correctly in Arabic (ar)', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('ar');

        const openUntilText = component.i18n.t('card.hours.open_until', { time: testTime });
        expect(openUntilText).toBe(`مفتوح حتى ${testTime}`);
      });

      it('should render correctly in Russian (ru)', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('ru');

        const openUntilText = component.i18n.t('card.hours.open_until', { time: testTime });
        expect(openUntilText).toBe(`Открыто до ${testTime}`);
      });

      it('should render correctly in French (fr)', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('fr');

        const openUntilText = component.i18n.t('card.hours.open_until', { time: testTime });
        expect(openUntilText).toBe(`Ouvert jusqu'à ${testTime}`);
      });

      it('should render correctly in Spanish (es)', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('es');

        const openUntilText = component.i18n.t('card.hours.open_until', { time: testTime });
        expect(openUntilText).toBe(`Abierto hasta ${testTime}`);
      });

      it('should interpolate time value correctly', () => {
        const i18nService = TestBed.inject(I18nService);
        i18nService.setLanguage('en');

        const text1 = component.i18n.t('card.hours.open_until', { time: '22:00' });
        const text2 = component.i18n.t('card.hours.open_until', { time: '01:30' });

        expect(text1).toContain('22:00');
        expect(text2).toContain('01:30');
        expect(text1).not.toBe(text2);
      });
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

  describe('Wolt CTA (Client-Side Deep-Link)', () => {
    it('should build Wolt search URL with restaurant name and city', () => {
      const restaurantWithCity: Restaurant = {
        ...mockRestaurant,
        name: 'Pizza Place',
        address: '123 Main St, Tel Aviv, Israel'
      };

      fixture.componentRef.setInput('restaurant', restaurantWithCity);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.url).toContain('wolt.com');
      expect(cta?.url).toContain('tel-aviv');
      expect(cta?.url).toContain('Pizza%20Place');
      expect(cta?.disabled).toBe(false);
    });

    it('should build Wolt URL with Hebrew language when i18n is Hebrew', () => {
      const i18nService = TestBed.inject(I18nService);
      i18nService.setLanguage('he');

      const restaurantWithCity: Restaurant = {
        ...mockRestaurant,
        name: 'מסעדה',
        address: 'רחוב ראשי 123, תל אביב, ישראל'
      };

      fixture.componentRef.setInput('restaurant', restaurantWithCity);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.url).toContain('wolt.com/he/isr');
    });

    it('should build Wolt URL with English language when i18n is English', () => {
      const i18nService = TestBed.inject(I18nService);
      i18nService.setLanguage('en');

      const restaurantWithCity: Restaurant = {
        ...mockRestaurant,
        name: 'Pizza Place',
        address: '123 Main St, Tel Aviv, Israel'
      };

      fixture.componentRef.setInput('restaurant', restaurantWithCity);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.url).toContain('wolt.com/en/isr');
    });

    it('should fallback to tel-aviv when city cannot be extracted', () => {
      const restaurantNoCity: Restaurant = {
        ...mockRestaurant,
        name: 'Restaurant Name',
        address: 'Just a street'
      };

      fixture.componentRef.setInput('restaurant', restaurantNoCity);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.url).toContain('tel-aviv');
    });

    it('should hide button when restaurant name is missing', () => {
      const restaurantNoName: Restaurant = {
        ...mockRestaurant,
        name: '',
        address: '123 Main St, Tel Aviv, Israel'
      };

      fixture.componentRef.setInput('restaurant', restaurantNoName);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeNull();
    });

    it('should extract correct city slug for Jerusalem', () => {
      const restaurantInJerusalem: Restaurant = {
        ...mockRestaurant,
        name: 'Shawarma King',
        address: 'King David St, Jerusalem, Israel'
      };

      fixture.componentRef.setInput('restaurant', restaurantInJerusalem);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.url).toContain('jerusalem');
    });

    it('should extract correct city slug for Haifa', () => {
      const restaurantInHaifa: Restaurant = {
        ...mockRestaurant,
        name: 'Falafel House',
        address: 'Herzl St, Haifa, Israel'
      };

      fixture.componentRef.setInput('restaurant', restaurantInHaifa);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.url).toContain('haifa');
    });

    it('should use correct i18n labels', () => {
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.label).toBeTruthy();
      expect(cta?.title).toBeTruthy();
      expect(cta?.ariaLabel).toContain(mockRestaurant.name);
    });

    it('should use action-btn-wolt-search CSS class', () => {
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.detectChanges();

      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.className).toBe('action-btn action-btn-wolt-search');
    });

    it('should not show spinner', () => {
      fixture.componentRef.setInput('restaurant', mockRestaurant);
      fixture.detectChanges();      const cta = component.woltCta();
      expect(cta).toBeTruthy();
      expect(cta?.showSpinner).toBe(false);
    });
  });
});
