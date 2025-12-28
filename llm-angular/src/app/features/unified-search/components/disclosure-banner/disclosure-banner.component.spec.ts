import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DisclosureBannerComponent } from './disclosure-banner.component';

describe('DisclosureBannerComponent', () => {
  let component: DisclosureBannerComponent;
  let fixture: ComponentFixture<DisclosureBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DisclosureBannerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DisclosureBannerComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('visibility', () => {
    it('should be visible when filterActive is "closed" and closed count > 0', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = 'closed';
      expect(component.visible).toBe(true);
    });

    it('should NOT be visible when filterActive is null', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = null;
      expect(component.visible).toBe(false);
    });

    it('should NOT be visible when filterActive is "open"', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = 'open';
      expect(component.visible).toBe(false);
    });

    it('should NOT be visible when closed count is 0', () => {
      component.summary = { open: 5, closed: 0, unknown: 2, total: 7 };
      component.filterActive = 'closed';
      expect(component.visible).toBe(false);
    });
  });

  describe('message', () => {
    it('should show correct Hebrew message for closed filter', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = 'closed';
      expect(component.message).toBe('מציג רק מקומות סגורים (3 מתוך 10 תוצאות)');
    });

    it('should show empty message when filterActive is null', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = null;
      expect(component.message).toBe('');
    });
  });

  describe('explanation', () => {
    it('should show Hebrew explanation for closed filter', () => {
      component.filterActive = 'closed';
      expect(component.explanation).toContain('Google Places');
      expect(component.explanation).toContain('לא תומך בסינון סגור');
    });

    it('should show empty explanation when filterActive is null', () => {
      component.filterActive = null;
      expect(component.explanation).toBe('');
    });
  });

  describe('DOM rendering', () => {
    it('should render banner when visible', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = 'closed';
      fixture.detectChanges();
      
      const banner = fixture.nativeElement.querySelector('.disclosure-banner');
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain('מציג רק מקומות סגורים');
    });

    it('should NOT render banner when not visible', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = null;
      fixture.detectChanges();
      
      const banner = fixture.nativeElement.querySelector('.disclosure-banner');
      expect(banner).toBeFalsy();
    });

    it('should include info icon', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = 'closed';
      fixture.detectChanges();
      
      const icon = fixture.nativeElement.querySelector('.disclosure-icon');
      expect(icon).toBeTruthy();
      expect(icon.textContent).toContain('ℹ️');
    });

    it('should have explanation as title attribute', () => {
      component.summary = { open: 5, closed: 3, unknown: 2, total: 10 };
      component.filterActive = 'closed';
      fixture.detectChanges();
      
      const banner = fixture.nativeElement.querySelector('.disclosure-banner');
      expect(banner.getAttribute('title')).toContain('Google Places');
    });
  });
});

