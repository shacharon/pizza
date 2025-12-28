import { TestBed } from '@angular/core/testing';
import { RecentSearchesService } from './recent-searches.service';

describe('RecentSearchesService', () => {
  let service: RecentSearchesService;

  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    
    TestBed.configureTestingModule({});
    service = TestBed.inject(RecentSearchesService);
  });

  afterEach(() => {
    service.reset();
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Initial State', () => {
    it('should start with empty searches', () => {
      expect(service.searches()).toEqual([]);
    });

    it('should have hasSearches as false', () => {
      expect(service.hasSearches()).toBe(false);
    });

    it('should have count as 0', () => {
      expect(service.count()).toBe(0);
    });
  });

  describe('add()', () => {
    it('should add a search query', () => {
      service.add('pizza');
      expect(service.searches()).toEqual(['pizza']);
    });

    it('should add multiple searches', () => {
      service.add('pizza');
      service.add('sushi');
      service.add('burger');
      expect(service.searches()).toEqual(['burger', 'sushi', 'pizza']);
    });

    it('should trim whitespace', () => {
      service.add('  pizza  ');
      expect(service.searches()).toEqual(['pizza']);
    });

    it('should ignore empty queries', () => {
      service.add('');
      service.add('   ');
      expect(service.searches()).toEqual([]);
    });

    it('should deduplicate searches', () => {
      service.add('pizza');
      service.add('sushi');
      service.add('pizza'); // Duplicate
      expect(service.searches()).toEqual(['pizza', 'sushi']);
    });

    it('should move duplicate to top', () => {
      service.add('pizza');
      service.add('sushi');
      service.add('burger');
      service.add('sushi'); // Move sushi to top
      expect(service.searches()).toEqual(['sushi', 'burger', 'pizza']);
    });

    it('should limit to 5 searches', () => {
      service.add('pizza');
      service.add('sushi');
      service.add('burger');
      service.add('pasta');
      service.add('salad');
      service.add('falafel'); // 6th item, should drop oldest
      
      expect(service.searches()).toEqual(['falafel', 'salad', 'pasta', 'burger', 'sushi']);
      expect(service.count()).toBe(5);
    });

    it('should persist to sessionStorage', () => {
      service.add('pizza');
      
      const stored = sessionStorage.getItem('recent_searches');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(['pizza']);
    });

    it('should update hasSearches', () => {
      expect(service.hasSearches()).toBe(false);
      service.add('pizza');
      expect(service.hasSearches()).toBe(true);
    });
  });

  describe('remove()', () => {
    beforeEach(() => {
      service.add('pizza');
      service.add('sushi');
      service.add('burger');
    });

    it('should remove a specific search', () => {
      service.remove('sushi');
      expect(service.searches()).toEqual(['burger', 'pizza']);
    });

    it('should persist removal to sessionStorage', () => {
      service.remove('sushi');
      
      const stored = sessionStorage.getItem('recent_searches');
      expect(JSON.parse(stored!)).toEqual(['burger', 'pizza']);
    });

    it('should do nothing if query does not exist', () => {
      service.remove('nonexistent');
      expect(service.count()).toBe(3);
    });
  });

  describe('clear()', () => {
    beforeEach(() => {
      service.add('pizza');
      service.add('sushi');
    });

    it('should clear all searches', () => {
      service.clear();
      expect(service.searches()).toEqual([]);
    });

    it('should clear sessionStorage', () => {
      service.clear();
      const stored = sessionStorage.getItem('recent_searches');
      expect(stored).toBeNull();
    });

    it('should update hasSearches', () => {
      expect(service.hasSearches()).toBe(true);
      service.clear();
      expect(service.hasSearches()).toBe(false);
    });
  });

  describe('has()', () => {
    beforeEach(() => {
      service.add('pizza');
      service.add('sushi');
    });

    it('should return true if query exists', () => {
      expect(service.has('pizza')).toBe(true);
    });

    it('should return false if query does not exist', () => {
      expect(service.has('burger')).toBe(false);
    });

    it('should trim whitespace when checking', () => {
      expect(service.has('  pizza  ')).toBe(true);
    });
  });

  describe('getAll()', () => {
    it('should return all searches as array', () => {
      service.add('pizza');
      service.add('sushi');
      expect(service.getAll()).toEqual(['sushi', 'pizza']);
    });
  });

  describe('sessionStorage persistence', () => {
    it('should load searches from sessionStorage on initialization', () => {
      // Manually set sessionStorage
      sessionStorage.setItem('recent_searches', JSON.stringify(['pizza', 'sushi']));
      
      // Create new service instance
      const newService = new RecentSearchesService();
      expect(newService.searches()).toEqual(['pizza', 'sushi']);
    });

    it('should handle corrupted sessionStorage data', () => {
      // Set invalid JSON
      sessionStorage.setItem('recent_searches', 'invalid json');
      
      // Should not throw and should start with empty array
      const newService = new RecentSearchesService();
      expect(newService.searches()).toEqual([]);
    });

    it('should handle non-array sessionStorage data', () => {
      // Set non-array data
      sessionStorage.setItem('recent_searches', JSON.stringify({ foo: 'bar' }));
      
      // Should not throw and should start with empty array
      const newService = new RecentSearchesService();
      expect(newService.searches()).toEqual([]);
    });

    it('should enforce limit when loading from storage', () => {
      // Set more than MAX_SEARCHES in storage
      sessionStorage.setItem('recent_searches', JSON.stringify([
        'query1', 'query2', 'query3', 'query4', 'query5', 'query6', 'query7'
      ]));
      
      const newService = new RecentSearchesService();
      expect(newService.count()).toBe(5);
    });
  });

  describe('Computed signals', () => {
    it('count should update when searches change', () => {
      expect(service.count()).toBe(0);
      
      service.add('pizza');
      expect(service.count()).toBe(1);
      
      service.add('sushi');
      expect(service.count()).toBe(2);
      
      service.clear();
      expect(service.count()).toBe(0);
    });

    it('hasSearches should reflect presence of searches', () => {
      expect(service.hasSearches()).toBe(false);
      
      service.add('pizza');
      expect(service.hasSearches()).toBe(true);
      
      service.remove('pizza');
      expect(service.hasSearches()).toBe(false);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle typical user search flow', () => {
      // User searches multiple times
      service.add('pizza in tel aviv');
      service.add('sushi near me');
      service.add('italian restaurant');
      
      expect(service.count()).toBe(3);
      expect(service.searches()[0]).toBe('italian restaurant'); // Most recent first
      
      // User searches for pizza again
      service.add('pizza in tel aviv');
      expect(service.searches()[0]).toBe('pizza in tel aviv'); // Moved to top
      expect(service.count()).toBe(3); // Still 3, no duplicate
    });

    it('should handle max capacity gracefully', () => {
      // Fill to capacity
      for (let i = 1; i <= 5; i++) {
        service.add(`query ${i}`);
      }
      expect(service.count()).toBe(5);
      
      // Add one more
      service.add('query 6');
      expect(service.count()).toBe(5); // Still 5
      expect(service.has('query 1')).toBe(false); // Oldest dropped
      expect(service.has('query 6')).toBe(true); // Newest added
    });
  });
});










