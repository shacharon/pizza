import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GroupedResultsComponent } from './grouped-results.component';
import type { ResultGroup, RestaurantResult } from '../../../../domain/types/search.types';

describe('GroupedResultsComponent', () => {
  let component: GroupedResultsComponent;
  let fixture: ComponentFixture<GroupedResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GroupedResultsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GroupedResultsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show loading state when loading', () => {
    component.loading = true;
    fixture.detectChanges();

    const loadingEl = fixture.nativeElement.querySelector('.loading-state');
    expect(loadingEl).toBeTruthy();
    expect(loadingEl.textContent).toContain('Searching');
  });

  it('should show empty state when no results', () => {
    component.loading = false;
    component.groups = [];
    fixture.detectChanges();

    const emptyEl = fixture.nativeElement.querySelector('.empty-state');
    expect(emptyEl).toBeTruthy();
    expect(emptyEl.textContent).toContain('No results found');
  });

  it('should render groups with results', () => {
    const mockGroups: ResultGroup[] = [
      {
        kind: 'EXACT',
        label: 'אלנבי',
        results: [
          {
            id: '1',
            placeId: 'place-1',
            name: 'Restaurant A',
            address: 'Allenby St',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          }
        ],
        radiusMeters: 200
      }
    ];

    component.groups = mockGroups;
    component.loading = false;
    fixture.detectChanges();

    const groupEls = fixture.nativeElement.querySelectorAll('.result-group');
    expect(groupEls.length).toBe(1);
  });

  it('should display group labels correctly', () => {
    const mockGroups: ResultGroup[] = [
      {
        kind: 'EXACT',
        label: 'אלנבי',
        results: [
          {
            id: '1',
            placeId: 'place-1',
            name: 'Restaurant A',
            address: 'Allenby St',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          }
        ],
        radiusMeters: 200
      },
      {
        kind: 'NEARBY',
        label: 'באיזור',
        results: [
          {
            id: '2',
            placeId: 'place-2',
            name: 'Restaurant B',
            address: 'Near Allenby',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          }
        ],
        distanceLabel: '5 דקות הליכה',
        radiusMeters: 400
      }
    ];

    component.groups = mockGroups;
    fixture.detectChanges();

    const labels = fixture.nativeElement.querySelectorAll('.group-label');
    expect(labels[0].textContent).toContain('אלנבי');
    expect(labels[1].textContent).toContain('באיזור');
  });

  it('should display count badges', () => {
    const mockGroups: ResultGroup[] = [
      {
        kind: 'EXACT',
        label: 'אלנבי',
        results: [
          {
            id: '1',
            placeId: 'place-1',
            name: 'Restaurant A',
            address: 'Allenby St',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          },
          {
            id: '2',
            placeId: 'place-2',
            name: 'Restaurant B',
            address: 'Allenby St',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          }
        ],
        radiusMeters: 200
      }
    ];

    component.groups = mockGroups;
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector('.count-badge');
    expect(badge.textContent.trim()).toBe('2');
  });

  it('should show distance label when provided', () => {
    const mockGroups: ResultGroup[] = [
      {
        kind: 'NEARBY',
        label: 'באיזור',
        results: [
          {
            id: '1',
            placeId: 'place-1',
            name: 'Restaurant A',
            address: 'Near Allenby',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          }
        ],
        distanceLabel: '5 דקות הליכה',
        radiusMeters: 400
      }
    ];

    component.groups = mockGroups;
    fixture.detectChanges();

    const distanceLabel = fixture.nativeElement.querySelector('.distance-label');
    expect(distanceLabel).toBeTruthy();
    expect(distanceLabel.textContent).toContain('5 דקות הליכה');
  });

  it('should emit restaurantClick when card is clicked', () => {
    const mockRestaurant: RestaurantResult = {
      id: '1',
      placeId: 'place-1',
      name: 'Restaurant A',
      address: 'Allenby St',
      location: { lat: 32.0, lng: 34.0 },
      source: 'google_places'
    };

    spyOn(component.restaurantClick, 'emit');

    component.onRestaurantClick(mockRestaurant);

    expect(component.restaurantClick.emit).toHaveBeenCalledWith(mockRestaurant);
  });

  it('should apply correct CSS class based on group kind', () => {
    expect(component.getGroupClass('EXACT')).toBe('group-exact');
    expect(component.getGroupClass('NEARBY')).toBe('group-nearby');
  });

  it('should track groups by kind', () => {
    const group: ResultGroup = {
      kind: 'EXACT',
      label: 'Test',
      results: [],
      radiusMeters: 200
    };

    expect(component.trackByKind(0, group)).toBe('EXACT');
  });

  it('should track results by id', () => {
    const result: RestaurantResult = {
      id: '123',
      placeId: 'place-123',
      name: 'Test',
      address: 'Test St',
      location: { lat: 0, lng: 0 },
      source: 'google_places'
    };

    expect(component.trackById(0, result)).toBe('123');
  });

  it('hasAnyResults should return true when groups have results', () => {
    component.groups = [
      {
        kind: 'EXACT',
        label: 'Test',
        results: [
          {
            id: '1',
            placeId: 'place-1',
            name: 'Restaurant A',
            address: 'Test St',
            location: { lat: 0, lng: 0 },
            source: 'google_places'
          }
        ],
        radiusMeters: 200
      }
    ];

    expect(component.hasAnyResults).toBe(true);
  });

  it('hasAnyResults should return false when all groups are empty', () => {
    component.groups = [
      {
        kind: 'EXACT',
        label: 'Test',
        results: [],
        radiusMeters: 200
      }
    ];

    expect(component.hasAnyResults).toBe(false);
  });

  it('should not render groups with zero results', () => {
    const mockGroups: ResultGroup[] = [
      {
        kind: 'EXACT',
        label: 'אלנבי',
        results: [
          {
            id: '1',
            placeId: 'place-1',
            name: 'Restaurant A',
            address: 'Allenby St',
            location: { lat: 32.0, lng: 34.0 },
            source: 'google_places'
          }
        ],
        radiusMeters: 200
      },
      {
        kind: 'NEARBY',
        label: 'באיזור',
        results: [], // Empty group
        radiusMeters: 400
      }
    ];

    component.groups = mockGroups;
    fixture.detectChanges();

    const groupEls = fixture.nativeElement.querySelectorAll('.result-group');
    expect(groupEls.length).toBe(1); // Only one group rendered
  });
});

