/**
 * Restaurant Card Component Tests
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RestaurantCardComponent } from './restaurant-card.component';
import { I18nService } from '../../../../core/services/i18n.service';
import type { Restaurant } from '../../../../domain/types/search.types';

describe('RestaurantCardComponent', () => {
  let component: RestaurantCardComponent;
  let fixture: ComponentFixture<RestaurantCardComponent>;
  let i18nService: I18nService;

  const mockRestaurant: Restaurant = {
    id: '1',
    placeId: 'place-1',
    name: 'Test Restaurant',
    address: '123 Main St, City',
    location: { lat: 48.8566, lng: 2.3522 },
    rating: 4.5,
    userRatingsTotal: 250,
    priceLevel: 2,
    openNow: true,
    phoneNumber: '+33123456789',
    website: 'https://example.com',
    photoReference: 'places/ChIJ123/photos/ABC456',
    tags: ['Italian', 'Pizza']
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
    fixture.componentRef.setInput('restaurant', mockRestaurant);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display restaurant name', () => {
    const name = fixture.nativeElement.querySelector('.restaurant-name');
    expect(name.textContent).toBe('Test Restaurant');
  });

  it('should display restaurant address', () => {
    const address = fixture.nativeElement.querySelector('.restaurant-address');
    expect(address.textContent).toBe('123 Main St, City');
  });

  it('should display rating', () => {
    const rating = fixture.nativeElement.querySelector('.rating-value');
    expect(rating.textContent.trim()).toBe('4.5');
  });

  it('should display rating stars', () => {
    const stars = component.getRatingStars(4.5);
    expect(stars).toContain('⭐');
  });

  it('should display rating count', () => {
    const count = fixture.nativeElement.querySelector('.rating-count');
    expect(count.textContent).toContain('250');
  });

  it('should display price level', () => {
    const priceLevel = component.getPriceLevel(2);
    expect(priceLevel).toBe('$$');
  });

  it('should display open status', () => {
    const openStatus = fixture.nativeElement.querySelector('.open-status.open');
    expect(openStatus).not.toBeNull();
    expect(openStatus.textContent.trim()).toBe('Open');
  });

  it('should display closed status', () => {
    const closedRestaurant = { ...mockRestaurant, openNow: false };
    fixture.componentRef.setInput('restaurant', closedRestaurant);
    fixture.detectChanges();

    const closedStatus = fixture.nativeElement.querySelector('.open-status.closed');
    expect(closedStatus).not.toBeNull();
    expect(closedStatus.textContent.trim()).toBe('Closed');
  });

  it('should display photo via proxy', () => {
    const photo = fixture.nativeElement.querySelector('.restaurant-photo');
    expect(photo).not.toBeNull();
    // Photo should use backend proxy URL
    expect(photo.src).toContain('/photos/places/');
    expect(photo.src).toContain('maxWidthPx=');
  });

  it('should display placeholder when no photoReference', () => {
    const noPhotoRestaurant = { ...mockRestaurant, photoReference: undefined };
    fixture.componentRef.setInput('restaurant', noPhotoRestaurant);
    fixture.detectChanges();

    const placeholder = fixture.nativeElement.querySelector('.restaurant-photo-placeholder');
    expect(placeholder).not.toBeNull();
  });

  it('should display tags', () => {
    const tags = fixture.nativeElement.querySelectorAll('.tag');
    expect(tags.length).toBe(2);
    expect(tags[0].textContent).toBe('Italian');
    expect(tags[1].textContent).toBe('Pizza');
  });

  it('should emit cardClick on card click', () => {
    spyOn(component.cardClick, 'emit');

    const card = fixture.nativeElement.querySelector('.restaurant-card');
    card.click();

    expect(component.cardClick.emit).toHaveBeenCalledWith(mockRestaurant);
  });

  it('should emit actionClick on action button click', () => {
    spyOn(component.actionClick, 'emit');

    const directionsButton = fixture.nativeElement.querySelectorAll('.action-button')[0];
    directionsButton.click();

    expect(component.actionClick.emit).toHaveBeenCalledWith({
      type: 'GET_DIRECTIONS',
      level: 0
    });
  });

  it('should not emit cardClick when action button is clicked', () => {
    spyOn(component.cardClick, 'emit');
    spyOn(component.actionClick, 'emit');

    const actionButton = fixture.nativeElement.querySelector('.action-button');
    actionButton.click();

    expect(component.actionClick.emit).toHaveBeenCalled();
    expect(component.cardClick.emit).not.toHaveBeenCalled();
  });

  it('should disable call button when no phone number', () => {
    const noPhoneRestaurant = { ...mockRestaurant, phoneNumber: undefined };
    fixture.componentRef.setInput('restaurant', noPhoneRestaurant);
    fixture.detectChanges();

    const callButton = fixture.nativeElement.querySelectorAll('.action-button')[1];
    expect(callButton.disabled).toBe(true);
  });

  it('should apply selected class when selected', () => {
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();

    const card = fixture.nativeElement.querySelector('.restaurant-card');
    expect(card.classList.contains('selected')).toBe(true);
  });

  it('should determine correct action level for SAVE_FAVORITE', () => {
    const level = component['getActionLevel']('SAVE_FAVORITE');
    expect(level).toBe(1);
  });

  it('should determine correct action level for GET_DIRECTIONS', () => {
    const level = component['getActionLevel']('GET_DIRECTIONS');
    expect(level).toBe(0);
  });
});













