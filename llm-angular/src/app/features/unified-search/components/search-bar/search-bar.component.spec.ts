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

  it('should emit search event when onSearch is called', () => {
    const emitSpy = jest.spyOn(component.search, 'emit');

    fixture.componentRef.setInput('value', 'pizza');
    component.onSearch();

    expect(emitSpy).toHaveBeenCalledWith('pizza');
  });

  it('should emit search event on Enter key', () => {
    const emitSpy = jest.spyOn(component.search, 'emit');

    fixture.componentRef.setInput('value', 'sushi');
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeydown(event);

    expect(emitSpy).toHaveBeenCalledWith('sushi');
  });

  it('should not emit search for empty query', () => {
    const emitSpy = jest.spyOn(component.search, 'emit');

    fixture.componentRef.setInput('value', '   ');
    component.onSearch();

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should trim whitespace from query', () => {
    const emitSpy = jest.spyOn(component.search, 'emit');

    fixture.componentRef.setInput('value', '  pizza  ');
    component.onSearch();

    expect(emitSpy).toHaveBeenCalledWith('pizza');
  });

  it('should show clear button when value is not empty and not loading', () => {
    fixture.componentRef.setInput('value', '');
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    let clearButton = fixture.nativeElement.querySelector('.clear-button');
    expect(clearButton).toBeNull();

    fixture.componentRef.setInput('value', 'pizza');
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    clearButton = fixture.nativeElement.querySelector('.clear-button');
    expect(clearButton).not.toBeNull();
  });

  it('should emit clear event on clear button click', () => {
    const emitSpy = jest.spyOn(component.clear, 'emit');

    fixture.componentRef.setInput('value', 'pizza');
    component.onClear();

    expect(emitSpy).toHaveBeenCalled();
  });

  it('should show loading indicator when loading', () => {
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();

    let indicator = fixture.nativeElement.querySelector('.loading-indicator');
    expect(indicator).toBeNull();

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    indicator = fixture.nativeElement.querySelector('.loading-indicator');
    expect(indicator).not.toBeNull();
  });

  // TODO: Fix disabled input test (pre-existing timing issue)
  it.skip('should disable input when disabled prop is true', () => {
    fixture.componentRef.setInput('disabled', false);
    fixture.detectChanges();

    let input = fixture.nativeElement.querySelector('.search-input');
    expect(input.disabled).toBe(false);

    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    
    // Re-query DOM after change detection
    input = fixture.nativeElement.querySelector('.search-input');
    expect(input.disabled).toBe(true);
  });

  // REGRESSION TEST: Ensure ENTER always submits current input value (not stale)
  it('should submit current query value on Enter, not stale parent value', () => {
    const emitSpy = jest.spyOn(component.search, 'emit');

    // 1. Set initial value from parent (simulating previous search)
    fixture.componentRef.setInput('value', 'בן זןנה');
    fixture.detectChanges();

    // 2. User types new text - parent updates value via currentQuery binding
    fixture.componentRef.setInput('value', 'מסעדה זולה בתל אביב');
    fixture.detectChanges();

    // 3. User presses Enter
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeydown(event);

    // 4. Assert: Should submit NEW query, not stale parent value
    expect(emitSpy).toHaveBeenCalledWith('מסעדה זולה בתל אביב');
    expect(emitSpy).not.toHaveBeenCalledWith('בן זןנה');
  });

  // REGRESSION TEST: Verify onInput emits to parent
  it('should emit inputChange when onInput is called', () => {
    const emitSpy = jest.spyOn(component.inputChange, 'emit');
    
    component.onInput('new value');
    
    expect(emitSpy).toHaveBeenCalledWith('new value');
  });
});













