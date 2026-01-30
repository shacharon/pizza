/**
 * Search Results with Load More - Example Component
 * 
 * Demonstrates the "Load More 5" UX with ranking-based assistant nudges.
 * 
 * Features:
 * - Client-side pagination (no new search)
 * - Stable ordering (from backend ranking)
 * - Assistant suggestions on "load more" (via WebSocket)
 * - Truthful copy ("More from same results")
 */

import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil, filter } from 'rxjs';

// Types (adjust imports based on your project structure)
interface RestaurantResult {
  id: string;
  name: string;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  // ... other fields
}

interface RankingSignals {
  profile: 'NEARBY' | 'QUALITY' | 'OPEN_FOCUS' | 'BALANCED';
  dominantFactor: 'DISTANCE' | 'RATING' | 'REVIEWS' | 'OPEN' | 'NONE';
  triggers: {
    lowResults: boolean;
    relaxUsed: boolean;
    manyOpenUnknown: boolean;
    dominatedByOneFactor: boolean;
  };
  facts: {
    shownNow: number;
    totalPool: number;
    hasUserLocation: boolean;
  };
}

interface RankingSuggestion {
  message: string;
  suggestion: string | null;
  suggestedAction: 'REFINE_LOCATION' | 'ADD_MIN_RATING' | 'REMOVE_OPEN_NOW' | 'REMOVE_PRICE' | 'NONE';
}

interface SearchResponse {
  requestId: string;
  results: RestaurantResult[];
  meta: {
    pagination?: {
      shownNow: number;
      totalPool: number;
      offset: number;
      hasMore: boolean;
    };
    rankingSignals?: RankingSignals;
  };
}

@Component({
  selector: 'app-search-results-with-load-more',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="search-results-container">
      <!-- Pagination Info -->
      <div class="pagination-info">
        @if (totalPool() > 0) {
          <p class="info-text">
            מציג {{ displayedResults().length }} מתוך {{ totalPool() }}
          </p>
        }
      </div>

      <!-- Results List -->
      <div class="results-list">
        @for (result of displayedResults(); track result.id) {
          <div class="result-card">
            <h3>{{ result.name }}</h3>
            @if (result.rating) {
              <div class="rating">
                ⭐ {{ result.rating }} 
                @if (result.userRatingCount) {
                  <span class="count">({{ result.userRatingCount }})</span>
                }
              </div>
            }
            @if (result.openNow !== undefined) {
              <div class="open-status" [class.open]="result.openNow">
                {{ result.openNow ? 'פתוח עכשיו' : 'סגור' }}
              </div>
            }
          </div>
        }
      </div>

      <!-- Load More Button -->
      @if (hasMore()) {
        <button 
          class="load-more-btn"
          (click)="loadMore()"
          [disabled]="loading()"
        >
          @if (loading()) {
            <span class="spinner"></span>
          } @else {
            טען עוד 5 תוצאות
          }
        </button>
        <p class="load-more-hint">עוד מאותה תוצאה</p>
      }

      <!-- Assistant Suggestion Panel -->
      @if (assistantSuggestion(); as suggestion) {
        <div class="assistant-panel" [class.show]="showSuggestion()">
          <button class="close-btn" (click)="dismissSuggestion()">×</button>
          
          <div class="assistant-content">
            <div class="icon">💡</div>
            <p class="message">{{ suggestion.message }}</p>
            
            @if (suggestion.suggestion && suggestion.suggestedAction !== 'NONE') {
              <div class="suggestion">
                <span class="suggestion-text">{{ suggestion.suggestion }}</span>
                <button 
                  class="action-btn"
                  (click)="applySuggestion(suggestion.suggestedAction)"
                >
                  נסה
                </button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Empty State -->
      @if (totalPool() === 0 && !loading()) {
        <div class="empty-state">
          <p>לא נמצאו תוצאות</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .search-results-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }

    .pagination-info {
      margin-bottom: 16px;
      text-align: center;
    }

    .info-text {
      color: #666;
      font-size: 14px;
    }

    .results-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }

    .result-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: box-shadow 0.2s;
    }

    .result-card:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }

    .result-card h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .rating {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
      font-size: 14px;
    }

    .count {
      color: #666;
    }

    .open-status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      background: #f5f5f5;
      color: #666;
    }

    .open-status.open {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .load-more-btn {
      display: block;
      width: 100%;
      padding: 12px 24px;
      margin: 0 auto 8px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .load-more-btn:hover:not(:disabled) {
      background: #1565c0;
    }

    .load-more-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .load-more-hint {
      text-align: center;
      color: #999;
      font-size: 12px;
      margin: 0;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .assistant-panel {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      max-width: 600px;
      width: 90%;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      opacity: 0;
      transition: all 0.3s ease-out;
      z-index: 1000;
    }

    .assistant-panel.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      background: transparent;
      border: none;
      font-size: 24px;
      color: #999;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }

    .close-btn:hover {
      color: #333;
    }

    .assistant-content {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .icon {
      font-size: 32px;
      text-align: center;
    }

    .message {
      margin: 0;
      font-size: 16px;
      color: #333;
      text-align: center;
      line-height: 1.5;
    }

    .suggestion {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: center;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .suggestion-text {
      font-size: 14px;
      font-weight: 500;
      color: #555;
    }

    .action-btn {
      padding: 8px 24px;
      background: #4caf50;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .action-btn:hover {
      background: #45a049;
    }

    .empty-state {
      text-align: center;
      padding: 48px 24px;
      color: #999;
    }
  `]
})
export class SearchResultsWithLoadMoreComponent implements OnInit, OnDestroy {
  // TODO: Inject your actual services
  // private readonly searchService = inject(SearchService);
  // private readonly wsService = inject(WebSocketService);

  private readonly destroy$ = new Subject<void>();

  // Full result pool from backend
  private readonly resultPool = signal<RestaurantResult[]>([]);

  // Current pagination limit
  private readonly currentLimit = signal<number>(10);

  // Ranking signals (for load_more event)
  private readonly rankingSignals = signal<RankingSignals | null>(null);

  // Current request ID
  private readonly requestId = signal<string>('');

  // Loading state
  readonly loading = signal<boolean>(false);

  // Assistant suggestion
  readonly assistantSuggestion = signal<RankingSuggestion | null>(null);
  readonly showSuggestion = signal<boolean>(false);

  // Computed: Results to display (first N from pool)
  readonly displayedResults = computed(() => {
    const pool = this.resultPool();
    const limit = this.currentLimit();
    return pool.slice(0, limit);
  });

  // Computed: Total pool size
  readonly totalPool = computed(() => this.resultPool().length);

  // Computed: Has more results to load
  readonly hasMore = computed(() =>
    this.currentLimit() < this.totalPool()
  );

  ngOnInit(): void {
    // TODO: Subscribe to WebSocket ranking suggestions
    // this.wsService.onRankingSuggestion()
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe(suggestion => {
    //     this.onRankingSuggestion(suggestion);
    //   });

    // Example: Simulate search response
    this.simulateSearchResponse();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load more results (append next 5)
   */
  loadMore(): void {
    if (!this.hasMore() || this.loading()) {
      return;
    }

    const newLimit = Math.min(
      this.currentLimit() + 5,
      this.totalPool()
    );

    // Update limit (triggers re-render via computed)
    this.currentLimit.set(newLimit);

    // Send WS event to backend
    this.sendLoadMoreEvent({
      requestId: this.requestId(),
      newOffset: this.currentLimit(),
      totalShown: newLimit
    });
  }

  /**
   * Send load_more event via WebSocket
   */
  private sendLoadMoreEvent(params: {
    requestId: string;
    newOffset: number;
    totalShown: number;
  }): void {
    // TODO: Implement with your WebSocket service
    // this.wsService.send({
    //   type: 'load_more',
    //   requestId: params.requestId,
    //   newOffset: params.newOffset,
    //   totalShown: params.totalShown
    // });

    console.log('[LOAD_MORE] Sending WS event:', params);

    // Simulate ranking suggestion after 1 second
    setTimeout(() => {
      this.onRankingSuggestion({
        message: 'מצאנו רק מעט תוצאות. אפשר לנסות ללא הדרישה "פתוח עכשיו"?',
        suggestion: 'הסר את הסינון "פתוח עכשיו"',
        suggestedAction: 'REMOVE_OPEN_NOW'
      });
    }, 1000);
  }

  /**
   * Handle search response
   */
  onSearchResponse(response: SearchResponse): void {
    // Store full pool
    this.resultPool.set(response.results);

    // Store ranking signals
    this.rankingSignals.set(response.meta.rankingSignals || null);

    // Store request ID
    this.requestId.set(response.requestId);

    // Reset pagination to first 10
    this.currentLimit.set(10);

    // Clear any previous suggestion
    this.dismissSuggestion();
  }

  /**
   * Handle ranking suggestion from WebSocket
   */
  onRankingSuggestion(suggestion: RankingSuggestion): void {
    this.assistantSuggestion.set(suggestion);

    // Show with animation after short delay
    setTimeout(() => {
      this.showSuggestion.set(true);
    }, 100);
  }

  /**
   * Dismiss assistant suggestion
   */
  dismissSuggestion(): void {
    this.showSuggestion.set(false);

    // Clear after animation
    setTimeout(() => {
      this.assistantSuggestion.set(null);
    }, 300);
  }

  /**
   * Apply suggested action
   */
  applySuggestion(action: RankingSuggestion['suggestedAction']): void {
    console.log('[SUGGESTION] Applying action:', action);

    switch (action) {
      case 'REMOVE_OPEN_NOW':
        // TODO: Remove openNow filter and trigger new search
        // this.searchService.removeFilter('openNow');
        // this.searchService.search();
        alert('הסרת סינון "פתוח עכשיו" - יש לחפש מחדש');
        break;

      case 'ADD_MIN_RATING':
        // TODO: Add minRating=4.0 filter and trigger new search
        // this.searchService.addFilter('minRating', 4.0);
        // this.searchService.search();
        alert('הוספת סינון דירוג מינימלי 4.0 - יש לחפש מחדש');
        break;

      case 'REFINE_LOCATION':
        // TODO: Open location refinement dialog
        // this.dialogService.openLocationDialog();
        alert('פתיחת תיבת דו-שיח לחידוד מיקום');
        break;

      case 'REMOVE_PRICE':
        // TODO: Remove price filter and trigger new search
        // this.searchService.removeFilter('price');
        // this.searchService.search();
        alert('הסרת סינון מחיר - יש לחפש מחדש');
        break;

      case 'NONE':
        // Just dismiss
        this.dismissSuggestion();
        break;
    }

    this.dismissSuggestion();
  }

  /**
   * DEMO: Simulate search response with 30 results
   */
  private simulateSearchResponse(): void {
    const mockResults: RestaurantResult[] = Array.from({ length: 30 }, (_, i) => ({
      id: `result-${i}`,
      name: `מסעדה ${i + 1}`,
      rating: 3.5 + Math.random() * 1.5,
      userRatingCount: Math.floor(Math.random() * 500) + 50,
      openNow: Math.random() > 0.3
    }));

    const mockResponse: SearchResponse = {
      requestId: 'req-demo-123',
      results: mockResults,
      meta: {
        pagination: {
          shownNow: 30,
          totalPool: 30,
          offset: 0,
          hasMore: false
        },
        rankingSignals: {
          profile: 'BALANCED',
          dominantFactor: 'NONE',
          triggers: {
            lowResults: false,
            relaxUsed: false,
            manyOpenUnknown: true,  // Trigger active for demo
            dominatedByOneFactor: false
          },
          facts: {
            shownNow: 30,
            totalPool: 30,
            hasUserLocation: true
          }
        }
      }
    };

    this.onSearchResponse(mockResponse);
  }
}
