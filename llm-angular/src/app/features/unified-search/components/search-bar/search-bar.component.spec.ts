/**
 * Search Bar Component Tests
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SearchBarComponent, stepTypewriter } from './search-bar.component';

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

  it('should type an example, hold, then delete into the next example', () => {
    let state = { exampleIndex: 0, charIndex: 0, phase: 'typing' as const, text: '' };
    let delay = 0;
    const first = 'pizza near me, open now';
    for (let i = 0; i < first.length; i++) {
      const next = stepTypewriter(state, [first, 'quiet sushi for two']);
      state = next.state;
      delay = next.delay;
    }
    expect(state.text).toBe(first);
    expect(state.phase).toBe('holding');
    expect(delay).toBe(5000);

    const afterHold = stepTypewriter(state, [first, 'quiet sushi for two']);
    expect(afterHold.state.phase).toBe('deleting');

    state = afterHold.state;
    while (state.text.length > 0 || state.phase === 'deleting') {
      const next = stepTypewriter(state, [first, 'quiet sushi for two']);
      state = next.state;
      if (state.phase === 'typing' && state.text === '') break;
    }
    const typed = stepTypewriter(state, [first, 'quiet sushi for two']);
    expect(typed.state.text).toBe('q');
    expect(typed.state.exampleIndex).toBe(1);
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

  // REGRESSION TEST: Send button should react immediately on first page load
  it('should enable send button immediately when user types on first load', () => {
    // Simulate fresh component mount (first page load)
    const freshFixture = TestBed.createComponent(SearchBarComponent);
    freshFixture.detectChanges();

    const sendButton = freshFixture.nativeElement.querySelector('.send-button');
    const textarea = freshFixture.nativeElement.querySelector('.search-input');

    // Initial state: button should be disabled (empty query)
    expect(sendButton.disabled).toBe(true);

    // User types text
    textarea.value = 'pizza';
    textarea.dispatchEvent(new Event('input'));
    freshFixture.detectChanges();

    // CRITICAL: Button should be enabled immediately after typing
    expect(sendButton.disabled).toBe(false);
  });
});













