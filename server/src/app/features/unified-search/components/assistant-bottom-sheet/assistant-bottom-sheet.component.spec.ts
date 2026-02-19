import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssistantBottomSheetComponent } from './assistant-bottom-sheet.component';
import { Restaurant } from '../../../../domain/types/search.types';

describe('AssistantBottomSheetComponent', () => {
  let component: AssistantBottomSheetComponent;
  let fixture: ComponentFixture<AssistantBottomSheetComponent>;

  const mockRestaurant: Restaurant = {
    id: '1',
    placeId: 'place1',
    name: 'Test Restaurant',
    address: '123 Test St',
    location: { lat: 1, lng: 1 },
    rating: 4.5,
    userRatingsTotal: 100
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssistantBottomSheetComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(AssistantBottomSheetComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render when visible is false', () => {
    component.visible = false;
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.bottom-sheet-overlay');
    expect(overlay).toBeFalsy();
  });

  it('should render when visible is true', () => {
    component.visible = true;
    fixture.detectChanges();

    const overlay = fixture.nativeElement.querySelector('.bottom-sheet-overlay');
    const sheet = fixture.nativeElement.querySelector('.bottom-sheet');
    
    expect(overlay).toBeTruthy();
    expect(sheet).toBeTruthy();
  });

  it('should render max 3 cards', () => {
    const fiveResults = Array(5).fill(null).map((_, i) => ({
      ...mockRestaurant,
      id: `${i}`,
      placeId: `place${i}`,
      name: `Restaurant ${i}`
    }));

    component.highlightedResults = fiveResults;
    component.visible = true;
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('app-restaurant-card');
    expect(cards.length).toBe(3);
  });

  it('should emit close on backdrop click', () => {
    component.visible = true;
    fixture.detectChanges();

    spyOn(component.close, 'emit');

    const overlay = fixture.nativeElement.querySelector('.bottom-sheet-overlay');
    overlay.click();

    expect(component.close.emit).toHaveBeenCalled();
  });

  it('should not emit close when clicking inside sheet', () => {
    component.visible = true;
    fixture.detectChanges();

    spyOn(component.close, 'emit');

    const sheet = fixture.nativeElement.querySelector('.bottom-sheet');
    sheet.click();

    expect(component.close.emit).not.toHaveBeenCalled();
  });

  it('should emit restaurantClick when card is clicked', () => {
    component.highlightedResults = [mockRestaurant];
    component.visible = true;
    fixture.detectChanges();

    spyOn(component.restaurantClick, 'emit');
    component.onRestaurantClick(mockRestaurant);

    expect(component.restaurantClick.emit).toHaveBeenCalledWith(mockRestaurant);
  });

  it('should display custom title', () => {
    component.title = 'My Custom Title';
    component.visible = true;
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('.sheet-title');
    expect(title.textContent).toBe('My Custom Title');
  });

  it('should have sheet handle for UX', () => {
    component.visible = true;
    fixture.detectChanges();

    const handle = fixture.nativeElement.querySelector('.sheet-handle');
    expect(handle).toBeTruthy();
  });
});

