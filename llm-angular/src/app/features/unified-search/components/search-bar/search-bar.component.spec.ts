/**
 * Search Bar Component Tests
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SearchBarComponent } from './search-bar.component';

describe('SearchBarComponent', () => {
  let component: SearchBarComponent;
  let fixture: ComponentFixture<SearchBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchBarComponent, FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default placeholder', () => {
    const input = fixture.nativeElement.querySelector('.search-input');
    expect(input.placeholder).toBe('Search for restaurants...');
  });

  it('should accept custom placeholder', () => {
    fixture.componentRef.setInput('placeholder', 'Find food...');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.search-input');
    expect(input.placeholder).toBe('Find food...');
  });

  it('should emit search event on button click', () => {
    spyOn(component.search, 'emit');

    component.query.set('pizza');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.search-button');
    button.click();

    expect(component.search.emit).toHaveBeenCalledWith('pizza');
  });

  it('should emit search event on Enter key', () => {
    spyOn(component.search, 'emit');

    component.query.set('sushi');
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeydown(event);

    expect(component.search.emit).toHaveBeenCalledWith('sushi');
  });

  it('should not emit search for empty query', () => {
    spyOn(component.search, 'emit');

    component.query.set('   ');
    component.onSearch();

    expect(component.search.emit).not.toHaveBeenCalled();
  });

  it('should trim whitespace from query', () => {
    spyOn(component.search, 'emit');

    component.query.set('  pizza  ');
    component.onSearch();

    expect(component.search.emit).toHaveBeenCalledWith('pizza');
  });

  it('should show clear button when query is not empty', () => {
    component.query.set('');
    fixture.detectChanges();

    let clearButton = fixture.nativeElement.querySelector('.clear-button');
    expect(clearButton).toBeNull();

    component.query.set('pizza');
    fixture.detectChanges();

    clearButton = fixture.nativeElement.querySelector('.clear-button');
    expect(clearButton).not.toBeNull();
  });

  it('should clear query on clear button click', () => {
    spyOn(component.clear, 'emit');

    component.query.set('pizza');
    component.onClear();

    expect(component.query()).toBe('');
    expect(component.clear.emit).toHaveBeenCalled();
  });

  it('should show loading spinner when loading', () => {
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    let spinner = fixture.nativeElement.querySelector('.loading-spinner');
    expect(spinner).toBeNull();

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    spinner = fixture.nativeElement.querySelector('.loading-spinner');
    expect(spinner).not.toBeNull();
  });

  it('should disable input when disabled', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('.search-input');
    expect(input.disabled).toBe(true);
  });

  it('should disable search button when disabled or query is empty', () => {
    const button = fixture.nativeElement.querySelector('.search-button');

    component.query.set('');
    fixture.detectChanges();
    expect(button.disabled).toBe(true);

    component.query.set('pizza');
    fixture.detectChanges();
    expect(button.disabled).toBe(false);

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });
});


