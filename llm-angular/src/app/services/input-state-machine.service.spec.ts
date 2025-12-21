import { TestBed } from '@angular/core/testing';
import { InputStateMachine } from './input-state-machine.service';

describe('InputStateMachine', () => {
  let service: InputStateMachine;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InputStateMachine);
  });

  afterEach(() => {
    service.reset();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Initial State', () => {
    it('should start in EMPTY state', () => {
      expect(service.state()).toBe('EMPTY');
    });

    it('should have empty query', () => {
      expect(service.query()).toBe('');
    });

    it('should show recent searches when empty', () => {
      expect(service.showRecentSearches()).toBe(true);
    });

    it('should not show clear button when empty', () => {
      expect(service.showClearButton()).toBe(false);
    });
  });

  describe('input()', () => {
    it('should transition from EMPTY to TYPING when user types', () => {
      service.input('p');
      expect(service.state()).toBe('TYPING');
      expect(service.query()).toBe('p');
    });

    it('should update query as user types', () => {
      service.input('piz');
      expect(service.query()).toBe('piz');
      service.input('pizza');
      expect(service.query()).toBe('pizza');
    });

    it('should transition back to EMPTY when input is cleared', () => {
      service.input('pizza');
      expect(service.state()).toBe('TYPING');
      service.input('');
      expect(service.state()).toBe('EMPTY');
    });

    it('should transition from RESULTS to EDITING when user edits', () => {
      service.input('pizza');
      service.submit();
      service.searchComplete();
      expect(service.state()).toBe('RESULTS');

      service.input('pizza in tel aviv');
      expect(service.state()).toBe('EDITING');
    });

    it('should show clear button when query has text', () => {
      service.input('pizza');
      expect(service.showClearButton()).toBe(true);
    });

    it('should hide recent searches when typing', () => {
      service.input('pizza');
      expect(service.showRecentSearches()).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should clear query and reset to EMPTY', () => {
      service.input('pizza');
      service.clear();
      expect(service.state()).toBe('EMPTY');
      expect(service.query()).toBe('');
    });

    it('should work from any state', () => {
      service.input('pizza');
      service.submit();
      service.clear();
      expect(service.state()).toBe('EMPTY');
    });
  });

  describe('submit()', () => {
    it('should transition from TYPING to SEARCHING', () => {
      service.input('pizza');
      service.submit();
      expect(service.state()).toBe('SEARCHING');
    });

    it('should store previous query', () => {
      service.input('pizza');
      service.submit();
      expect(service.previousQuery()).toBe('pizza');
    });

    it('should not submit empty query', () => {
      service.input('   ');
      service.submit();
      expect(service.state()).not.toBe('SEARCHING');
    });

    it('should not submit when already searching', () => {
      service.input('pizza');
      service.submit();
      const firstPreviousQuery = service.previousQuery();
      
      service.submit(); // Try to submit again
      expect(service.previousQuery()).toBe(firstPreviousQuery);
    });

    it('should set isSearching to true', () => {
      service.input('pizza');
      service.submit();
      expect(service.isSearching()).toBe(true);
    });
  });

  describe('searchComplete()', () => {
    it('should transition from SEARCHING to RESULTS', () => {
      service.input('pizza');
      service.submit();
      service.searchComplete();
      expect(service.state()).toBe('RESULTS');
    });

    it('should set hasResults to true', () => {
      service.input('pizza');
      service.submit();
      service.searchComplete();
      expect(service.hasResults()).toBe(true);
    });

    it('should not transition if not in SEARCHING state', () => {
      service.input('pizza');
      service.searchComplete();
      expect(service.state()).toBe('TYPING');
    });
  });

  describe('searchFailed()', () => {
    it('should transition from SEARCHING to TYPING on failure', () => {
      service.input('pizza');
      service.submit();
      service.searchFailed();
      expect(service.state()).toBe('TYPING');
    });

    it('should allow retry after failure', () => {
      service.input('pizza');
      service.submit();
      service.searchFailed();
      expect(service.canSubmit()).toBe(true);
    });
  });

  describe('selectRecent()', () => {
    it('should set query and transition to SEARCHING', () => {
      service.selectRecent('pizza in tel aviv');
      expect(service.query()).toBe('pizza in tel aviv');
      expect(service.state()).toBe('SEARCHING');
    });

    it('should store as previous query', () => {
      service.selectRecent('sushi');
      expect(service.previousQuery()).toBe('sushi');
    });
  });

  describe('selectChip()', () => {
    it('should set new query and transition to SEARCHING', () => {
      service.input('pizza');
      service.submit();
      service.searchComplete();

      service.selectChip('pizza open now');
      expect(service.query()).toBe('pizza open now');
      expect(service.state()).toBe('SEARCHING');
    });
  });

  describe('Computed signals', () => {
    it('canSubmit should be true when query is valid and not searching', () => {
      service.input('pizza');
      expect(service.canSubmit()).toBe(true);
    });

    it('canSubmit should be false when searching', () => {
      service.input('pizza');
      service.submit();
      expect(service.canSubmit()).toBe(false);
    });

    it('canSubmit should be false when query is empty', () => {
      service.input('   ');
      expect(service.canSubmit()).toBe(false);
    });
  });

  describe('getSnapshot()', () => {
    it('should return current state snapshot', () => {
      service.input('pizza');
      service.submit();

      const snapshot = service.getSnapshot();
      expect(snapshot.state).toBe('SEARCHING');
      expect(snapshot.query).toBe('pizza');
      expect(snapshot.previousQuery).toBe('pizza');
    });
  });

  describe('Complex workflows', () => {
    it('should handle full search workflow', () => {
      // 1. Start empty
      expect(service.state()).toBe('EMPTY');

      // 2. User types
      service.input('pizza');
      expect(service.state()).toBe('TYPING');

      // 3. User submits
      service.submit();
      expect(service.state()).toBe('SEARCHING');

      // 4. Search completes
      service.searchComplete();
      expect(service.state()).toBe('RESULTS');

      // 5. User edits
      service.input('pizza in tel aviv');
      expect(service.state()).toBe('EDITING');

      // 6. User submits refinement
      service.submit();
      expect(service.state()).toBe('SEARCHING');
    });

    it('should handle search failure and retry', () => {
      service.input('pizza');
      service.submit();
      expect(service.state()).toBe('SEARCHING');

      service.searchFailed();
      expect(service.state()).toBe('TYPING');

      service.submit();
      expect(service.state()).toBe('SEARCHING');

      service.searchComplete();
      expect(service.state()).toBe('RESULTS');
    });

    it('should handle recent search selection', () => {
      service.selectRecent('italian in tel aviv');
      expect(service.state()).toBe('SEARCHING');

      service.searchComplete();
      expect(service.state()).toBe('RESULTS');
    });

    it('should handle chip refinement', () => {
      service.input('pizza');
      service.submit();
      service.searchComplete();

      service.selectChip('pizza open now');
      expect(service.state()).toBe('SEARCHING');
      expect(service.query()).toBe('pizza open now');
    });
  });
});

