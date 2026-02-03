/**
 * Restaurant Card Action Tests
 * Tests all quick actions (directions, call, favorite)
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RestaurantCardComponent } from './restaurant-card.component';
import { I18nService } from '../../../../core/services/i18n.service';
import { signal } from '@angular/core';
import type { Restaurant } from '../../../../domain/types/search.types';

describe('RestaurantCardComponent - Quick Actions', () => {
  let component: RestaurantCardComponent;
  let fixture: ComponentFixture<RestaurantCardComponent>;
  let i18nService: I18nService;

  const mockRestaurant: Restaurant = {
    id: '1',
    placeId: 'place1',
    name: 'Test Restaurant',
    address: '123 Test St, Tel Aviv',
    location: { lat: 32.0853, lng: 34.7818 },
    rating: 4.5,
    userRatingsTotal: 250,
    priceLevel: 2,
    phoneNumber: '+972-12-3456789',
    openNow: true
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestaurantCardComponent],
      providers: [I18nService]
    }).compileComponents();

    fixture = TestBed.createComponent(RestaurantCardComponent);
    component = fixture.componentInstance;
    i18nService = TestBed.inject(I18nService);
    // Ensure English is set for consistent tests
    i18nService.setLanguage('en');
    component.restaurant = signal(mockRestaurant);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('GET_DIRECTIONS Action', () => {
    it('should emit GET_DIRECTIONS action when directions button clicked', () => {
      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'GET_DIRECTIONS');

      expect(component.action.emit).toHaveBeenCalledWith({
        type: 'GET_DIRECTIONS',
        restaurant: mockRestaurant
      });
    });

    it('should stop event propagation on directions click', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');

      component.onAction(event, 'GET_DIRECTIONS');

      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should prevent default on directions click', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'preventDefault');

      component.onAction(event, 'GET_DIRECTIONS');

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should render directions button as always enabled', () => {
      const button = fixture.nativeElement.querySelector('[title="Get directions"]');
      expect(button).toBeTruthy();
      expect(button.disabled).toBe(false);
    });

    it('should render directions button with correct icon', () => {
      const button = fixture.nativeElement.querySelector('[title="Get directions"]');
      expect(button.textContent).toContain('📍');
    });

    it('should have aria-label for directions button', () => {
      const button = fixture.nativeElement.querySelector('[title="Get directions"]');
      expect(button.getAttribute('aria-label')).toBe('Get directions to restaurant');
    });
  });

  describe('CALL_RESTAURANT Action', () => {
    it('should emit CALL_RESTAURANT action when call button clicked', () => {
      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'CALL_RESTAURANT');

      expect(component.action.emit).toHaveBeenCalledWith({
        type: 'CALL_RESTAURANT',
        restaurant: mockRestaurant
      });
    });

    it('should stop event propagation on call click', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');

      component.onAction(event, 'CALL_RESTAURANT');

      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should disable call button when no phone number', () => {
      component.restaurant = signal({ ...mockRestaurant, phoneNumber: undefined });
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[title="Call restaurant"]');
      expect(button.disabled).toBe(true);
    });

    it('should enable call button when phone number exists', () => {
      const button = fixture.nativeElement.querySelector('[title="Call restaurant"]');
      expect(button.disabled).toBe(false);
    });

    it('should render call button with correct icon', () => {
      const button = fixture.nativeElement.querySelector('[title="Call restaurant"]');
      expect(button.textContent).toContain('📞');
    });

    it('should have aria-label for call button', () => {
      const button = fixture.nativeElement.querySelector('[title="Call restaurant"]');
      expect(button.getAttribute('aria-label')).toBe('Call restaurant');
    });

    it('should handle empty phone number string', () => {
      component.restaurant = signal({ ...mockRestaurant, phoneNumber: '' });
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('[title="Call restaurant"]');
      expect(button.disabled).toBe(true);
    });
  });

  describe('SAVE_FAVORITE Action', () => {
    it('should emit SAVE_FAVORITE action when favorite button clicked', () => {
      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'SAVE_FAVORITE');

      expect(component.action.emit).toHaveBeenCalledWith({
        type: 'SAVE_FAVORITE',
        restaurant: mockRestaurant
      });
    });

    it('should stop event propagation on favorite click', () => {
      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');

      component.onAction(event, 'SAVE_FAVORITE');

      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should render favorite button as always enabled', () => {
      const button = fixture.nativeElement.querySelector('[title="Save to favorites"]');
      expect(button).toBeTruthy();
      expect(button.disabled).toBe(false);
    });

    it('should render favorite button with correct icon', () => {
      const button = fixture.nativeElement.querySelector('[title="Save to favorites"]');
      expect(button.textContent).toContain('❤️');
    });

    it('should have aria-label for favorite button', () => {
      const button = fixture.nativeElement.querySelector('[title="Save to favorites"]');
      expect(button.getAttribute('aria-label')).toBe('Save to favorites');
    });
  });

  describe('Action Button Count and Order', () => {
    it('should render exactly 3 quick action buttons', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');
      expect(buttons.length).toBe(3);
    });

    it('should have directions, call, and favorite buttons in that order', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');

      expect(buttons[0].textContent?.includes('📍')).toBe(true); // Directions
      expect(buttons[1].textContent?.includes('📞')).toBe(true); // Call
      expect(buttons[2].textContent?.includes('❤️')).toBe(true); // Favorite
    });

    it('should all be button elements', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');

      buttons.forEach((button: HTMLElement) => {
        expect(button.tagName.toLowerCase()).toBe('button');
        expect(button.getAttribute('type')).toBe('button');
      });
    });
  });

  describe('Multiple Action Clicks', () => {
    it('should handle clicking all actions sequentially', () => {
      spyOn(component.action, 'emit');

      const event1 = new MouseEvent('click');
      const event2 = new MouseEvent('click');
      const event3 = new MouseEvent('click');

      component.onAction(event1, 'GET_DIRECTIONS');
      component.onAction(event2, 'CALL_RESTAURANT');
      component.onAction(event3, 'SAVE_FAVORITE');

      expect(component.action.emit).toHaveBeenCalledTimes(3);
    });

    it('should handle clicking the same action multiple times', () => {
      spyOn(component.action, 'emit');

      const event1 = new MouseEvent('click');
      const event2 = new MouseEvent('click');

      component.onAction(event1, 'SAVE_FAVORITE');
      component.onAction(event2, 'SAVE_FAVORITE');

      expect(component.action.emit).toHaveBeenCalledTimes(2);
      expect(component.action.emit).toHaveBeenCalledWith({
        type: 'SAVE_FAVORITE',
        restaurant: mockRestaurant
      });
    });
  });

  describe('Event Propagation', () => {
    it('should NOT trigger card click when action clicked', () => {
      spyOn(component.restaurantClick, 'emit');

      const event = new MouseEvent('click');
      spyOn(event, 'stopPropagation');

      component.onAction(event, 'GET_DIRECTIONS');

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.restaurantClick.emit).not.toHaveBeenCalled();
    });

    it('should stop propagation for all action types', () => {
      const actions: Array<'GET_DIRECTIONS' | 'CALL_RESTAURANT' | 'SAVE_FAVORITE'> = [
        'GET_DIRECTIONS',
        'CALL_RESTAURANT',
        'SAVE_FAVORITE'
      ];

      actions.forEach(actionType => {
        const event = new MouseEvent('click');
        spyOn(event, 'stopPropagation');

        component.onAction(event, actionType);

        expect(event.stopPropagation).toHaveBeenCalled();
      });
    });
  });

  describe('Restaurant Data Binding', () => {
    it('should use current restaurant data in action emit', () => {
      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'GET_DIRECTIONS');

      const emittedRestaurant = (component.action.emit as jasmine.Spy).calls.mostRecent().args[0].restaurant;
      expect(emittedRestaurant.id).toBe('1');
      expect(emittedRestaurant.name).toBe('Test Restaurant');
    });

    it('should update action payload when restaurant changes', () => {
      const newRestaurant: Restaurant = {
        ...mockRestaurant,
        id: '2',
        name: 'Updated Restaurant'
      };

      component.restaurant = signal(newRestaurant);
      fixture.detectChanges();

      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'SAVE_FAVORITE');

      const emittedRestaurant = (component.action.emit as jasmine.Spy).calls.mostRecent().args[0].restaurant;
      expect(emittedRestaurant.id).toBe('2');
      expect(emittedRestaurant.name).toBe('Updated Restaurant');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button types', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');

      buttons.forEach((button: HTMLElement) => {
        expect(button.getAttribute('type')).toBe('button');
      });
    });

    it('should have title attributes for tooltips', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');

      expect(buttons[0].getAttribute('title')).toBe('Get directions');
      expect(buttons[1].getAttribute('title')).toBe('Call restaurant');
      expect(buttons[2].getAttribute('title')).toBe('Save to favorites');
    });

    it('should have aria-labels', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');

      expect(buttons[0].getAttribute('aria-label')).toBeTruthy();
      expect(buttons[1].getAttribute('aria-label')).toBeTruthy();
      expect(buttons[2].getAttribute('aria-label')).toBeTruthy();
    });

    it('should be keyboard accessible', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');

      buttons.forEach((button: HTMLElement) => {
        // Buttons should not have negative tabindex
        const tabindex = button.getAttribute('tabindex');
        expect(tabindex === null || parseInt(tabindex) >= 0).toBe(true);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle restaurant without rating', () => {
      component.restaurant = signal({ ...mockRestaurant, rating: undefined });
      fixture.detectChanges();

      expect(() => {
        const event = new MouseEvent('click');
        component.onAction(event, 'SAVE_FAVORITE');
      }).not.toThrow();
    });

    it('should handle restaurant without price level', () => {
      component.restaurant = signal({ ...mockRestaurant, priceLevel: undefined });
      fixture.detectChanges();

      expect(() => {
        const event = new MouseEvent('click');
        component.onAction(event, 'GET_DIRECTIONS');
      }).not.toThrow();
    });

    it('should handle minimal restaurant data', () => {
      const minimalRestaurant: Restaurant = {
        id: 'min1',
        placeId: 'minPlace1',
        name: 'Minimal Restaurant',
        address: 'Minimal Address',
        location: { lat: 32, lng: 34 }
      };

      component.restaurant = signal(minimalRestaurant);
      fixture.detectChanges();

      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'GET_DIRECTIONS');

      expect(component.action.emit).toHaveBeenCalled();
    });

    it('should handle rapid successive action clicks', () => {
      spyOn(component.action, 'emit');

      // Simulate rapid clicking
      for (let i = 0; i < 10; i++) {
        const event = new MouseEvent('click');
        component.onAction(event, 'SAVE_FAVORITE');
      }

      expect(component.action.emit).toHaveBeenCalledTimes(10);
    });
  });

  describe('Visual Feedback', () => {
    it('should have CSS class for action buttons', () => {
      const buttons = fixture.nativeElement.querySelectorAll('.action-button');
      expect(buttons.length).toBeGreaterThan(0);

      buttons.forEach((button: HTMLElement) => {
        expect(button.classList.contains('action-button')).toBe(true);
      });
    });

    it('should have special class for favorite button', () => {
      const favoriteButton = fixture.nativeElement.querySelector('.action-button.favorite');
      expect(favoriteButton).toBeTruthy();
    });
  });

  describe('Integration with Card', () => {
    it('should NOT emit restaurantClick when action clicked', () => {
      spyOn(component.restaurantClick, 'emit');
      spyOn(component.action, 'emit');

      const event = new MouseEvent('click');
      component.onAction(event, 'GET_DIRECTIONS');

      expect(component.action.emit).toHaveBeenCalled();
      expect(component.restaurantClick.emit).not.toHaveBeenCalled();
    });

    it('should emit restaurantClick when card body clicked', () => {
      spyOn(component.restaurantClick, 'emit');

      component.onCardClick();

      expect(component.restaurantClick.emit).toHaveBeenCalledWith(mockRestaurant);
    });

    it('should have separate click handlers for card and actions', () => {
      spyOn(component.restaurantClick, 'emit');
      spyOn(component.action, 'emit');

      // Click card
      component.onCardClick();
      expect(component.restaurantClick.emit).toHaveBeenCalledTimes(1);
      expect(component.action.emit).not.toHaveBeenCalled();

      // Click action
      const event = new MouseEvent('click');
      component.onAction(event, 'SAVE_FAVORITE');
      expect(component.action.emit).toHaveBeenCalledTimes(1);
      expect(component.restaurantClick.emit).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });
});

