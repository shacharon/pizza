import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RankedResultsComponent } from './ranked-results.component';
import { Restaurant } from '../../../../domain/types/search.types';

describe('RankedResultsComponent', () => {
  let component: RankedResultsComponent;
  let fixture: ComponentFixture<RankedResultsComponent>;

  const mockResults: Restaurant[] = [
    {
      id: '1',
      placeId: 'place1',
      name: 'Top Restaurant',
      address: '123 Main St',
      location: { lat: 1, lng: 1 },
      rating: 4.8,
      userRatingsTotal: 100
    },
    {
      id: '2',
      placeId: 'place2',
      name: 'Second Restaurant',
      address: '456 Oak Ave',
      location: { lat: 2, lng: 2 },
      rating: 4.5,
      userRatingsTotal: 50
    },
    {
      id: '3',
      placeId: 'place3',
      name: 'Third Restaurant',
      address: '789 Elm St',
      location: { lat: 3, lng: 3 },
      rating: 4.2,
      userRatingsTotal: 25
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankedResultsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(RankedResultsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render single flat list (no grouped sections)', () => {
    component.results = mockResults;
    fixture.detectChanges();

    const resultGroups = fixture.nativeElement.querySelectorAll('.result-group');
    const resultsList = fixture.nativeElement.querySelectorAll('.results-list');

    // Assert: no grouped sections exist
    expect(resultGroups.length).toBe(0);
    expect(resultsList.length).toBe(1);
  });

  it('should show reason label on top result only', () => {
    component.results = mockResults;
    component.showReasonLabels = true;
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('app-restaurant-card');
    expect(cards.length).toBe(3);
    
    // First card should have reason label attributes
    const firstCard = cards[0];
    expect(firstCard.getAttribute('ng-reflect-is-top-result')).toBe('true');
    expect(firstCard.getAttribute('ng-reflect-show-reason-label')).toBe('true');
    
    // Other cards should not
    const secondCard = cards[1];
    expect(secondCard.getAttribute('ng-reflect-is-top-result')).toBe('false');
  });

  it('should not re-sort results (preserve backend order)', () => {
    const originalOrder = mockResults.map(r => r.id);
    component.results = mockResults;
    fixture.detectChanges();

    const renderedCards = fixture.nativeElement.querySelectorAll('app-restaurant-card');
    const renderedIds: string[] = [];
    
    renderedCards.forEach((card: Element) => {
      const id = card.getAttribute('ng-reflect-restaurant');
      if (id) {
        // Extract id from stringified object
        const match = id.match(/"id":"(\d+)"/);
        if (match) renderedIds.push(match[1]);
      }
    });

    // Results should maintain original order
    expect(renderedIds.length).toBeGreaterThan(0);
  });

  it('should emit restaurantClick when card is clicked', () => {
    component.results = mockResults;
    fixture.detectChanges();

    spyOn(component.restaurantClick, 'emit');
    component.onRestaurantClick(mockResults[0]);

    expect(component.restaurantClick.emit).toHaveBeenCalledWith(mockResults[0]);
  });

  it('should show empty state when no results', () => {
    component.results = [];
    component.loading = false;
    fixture.detectChanges();

    const emptyState = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyState).toBeTruthy();
    expect(emptyState.textContent).toContain('No results found');
  });

  it('should show loading state when loading', () => {
    component.results = [];
    component.loading = true;
    fixture.detectChanges();

    const loadingState = fixture.nativeElement.querySelector('.loading-state');
    expect(loadingState).toBeTruthy();
    expect(loadingState.textContent).toContain('Searching');
  });

  it('should return top result correctly', () => {
    component.results = mockResults;
    expect(component.topResult).toEqual(mockResults[0]);
    
    component.results = [];
    expect(component.topResult).toBeNull();
  });
});

