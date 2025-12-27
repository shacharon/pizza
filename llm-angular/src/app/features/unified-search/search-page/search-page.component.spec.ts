/**
 * Search Page Component Tests
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';

describe('SearchPageComponent', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let facade: jasmine.SpyObj<SearchFacade>;

  beforeEach(async () => {
    const facadeSpy = jasmine.createSpyObj('SearchFacade', [
      'search',
      'reset',
      'selectRestaurant',
      'proposeAction',
      'approveAction',
      'rejectAction',
      'onChipClick',
      'onAssistActionClick',
      'cleanupExpiredActions',
      'retry'
    ]);

    // Mock signal properties
    facadeSpy.loading = jasmine.createSpy().and.returnValue(false);
    facadeSpy.error = jasmine.createSpy().and.returnValue(null);
    facadeSpy.hasResults = jasmine.createSpy().and.returnValue(false);
    facadeSpy.results = jasmine.createSpy().and.returnValue([]);
    facadeSpy.chips = jasmine.createSpy().and.returnValue([]);
    facadeSpy.assist = jasmine.createSpy().and.returnValue(null);
    facadeSpy.meta = jasmine.createSpy().and.returnValue(null);
    facadeSpy.selectedRestaurant = jasmine.createSpy().and.returnValue(null);
    facadeSpy.pendingActions = jasmine.createSpy().and.returnValue([]);

    await TestBed.configureTestingModule({
      imports: [SearchPageComponent, HttpClientTestingModule],
      providers: [
        { provide: SearchFacade, useValue: facadeSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
    facade = TestBed.inject(SearchFacade) as jasmine.SpyObj<SearchFacade>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have popular searches', () => {
    expect(component.popularSearches.length).toBeGreaterThan(0);
  });

  it('should call facade.search on search', () => {
    component.onSearch('pizza');
    expect(facade.search).toHaveBeenCalledWith('pizza');
  });

  it('should call facade.reset on clear', () => {
    component.onClear();
    expect(facade.reset).toHaveBeenCalled();
  });

  it('should setup cleanup interval on init', () => {
    spyOn(window, 'setInterval').and.returnValue(123 as any);
    component.ngOnInit();
    expect(window.setInterval).toHaveBeenCalled();
  });

  it('should clear cleanup interval on destroy', () => {
    component['cleanupInterval'] = 123;
    spyOn(window, 'clearInterval');
    component.ngOnDestroy();
    expect(window.clearInterval).toHaveBeenCalledWith(123);
  });

  it('should track restaurant by id', () => {
    const restaurant = {
      id: 'test-1',
      placeId: 'place-1',
      name: 'Test',
      address: '123 Main St',
      location: { lat: 0, lng: 0 }
    };
    const trackId = component.trackByRestaurant(0, restaurant);
    expect(trackId).toBe('test-1');
  });

  it('should call facade methods for actions', () => {
    const mockRestaurant = {
      id: '1',
      placeId: 'place-1',
      name: 'Test',
      address: '123 Main St',
      location: { lat: 0, lng: 0 }
    };

    component.onCardClick(mockRestaurant);
    expect(facade.selectRestaurant).toHaveBeenCalledWith(mockRestaurant);

    component.onActionClick({ type: 'SAVE_FAVORITE', level: 1 }, mockRestaurant);
    expect(facade.proposeAction).toHaveBeenCalledWith('SAVE_FAVORITE', 1, mockRestaurant);

    component.onApproveAction('action-1');
    expect(facade.approveAction).toHaveBeenCalledWith('action-1');

    component.onRejectAction('action-2');
    expect(facade.rejectAction).toHaveBeenCalledWith('action-2');
  });

  it('should call facade for chip and assist actions', () => {
    component.onChipClick('chip-1');
    expect(facade.onChipClick).toHaveBeenCalledWith('chip-1');

    component.onAssistActionClick('italian restaurant');
    expect(facade.onAssistActionClick).toHaveBeenCalledWith('italian restaurant');
  });

  it('should call retry on facade', () => {
    component.retry();
    expect(facade.retry).toHaveBeenCalled();
  });
});








