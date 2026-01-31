/**
 * Language Debug Panel Component
 * DEV-ONLY: Shows language separation (uiLanguage / assistantLanguage / searchLanguage)
 * Compact collapsible mode - expands on hover
 */

import { Component, input, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { SearchResponse } from '../../../../domain/types/search.types';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-language-debug-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!isProd() && response()) {
      <div class="debug-panel" 
           [class.expanded]="isExpanded()"
           (mouseenter)="onExpand()" 
           (mouseleave)="onCollapse()">
        
        <!-- Collapsed: Single line summary -->
        <div class="debug-collapsed">
          <span class="debug-icon" title="Language Debug (DEV only)">🌐</span>
          <span class="debug-summary">
            UI={{ uiLanguage() }} | Asst={{ assistantLanguage() }} | Search={{ searchLanguage() }}
          </span>
        </div>

        <!-- Expanded: Full details -->
        @if (isExpanded()) {
          <div class="debug-expanded">
            <div class="debug-title">Language Debug (DEV)</div>
            <div class="debug-grid">
              <div class="debug-item">
                <span class="label">UI:</span>
                <span class="value ui">{{ uiLanguage() }}</span>
              </div>
              <div class="debug-item">
                <span class="label">Assistant:</span>
                <span class="value assistant">{{ assistantLanguage() }}</span>
              </div>
              <div class="debug-item">
                <span class="label">Search:</span>
                <span class="value search">{{ searchLanguage() }}</span>
              </div>
              @if (languageContext()) {
                <div class="debug-item full-width">
                  <span class="label">Sources:</span>
                  <span class="value sources">
                    asst: {{ languageContext()?.sources?.assistantLanguage || 'n/a' }},
                    search: {{ languageContext()?.sources?.searchLanguage || 'n/a' }}
                  </span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .debug-panel {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.75);
      border: 1px dashed rgba(128, 128, 128, 0.4);
      border-radius: 4px;
      padding: 4px 8px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #aaa;
      z-index: 100;
      max-height: 40px;
      overflow: hidden;
      transition: all 0.2s ease-in-out;
      opacity: 0.6;
      cursor: pointer;
    }

    .debug-panel:hover,
    .debug-panel.expanded {
      opacity: 1;
      max-height: 200px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.9);
      border-color: rgba(128, 128, 128, 0.6);
    }

    .debug-collapsed {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .debug-icon {
      font-size: 14px;
      opacity: 0.8;
    }

    .debug-summary {
      font-size: 11px;
      color: #999;
    }

    .debug-expanded {
      margin-top: 8px;
      animation: fadeIn 0.2s ease-in-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .debug-title {
      font-weight: bold;
      margin-bottom: 6px;
      padding-bottom: 3px;
      border-bottom: 1px dashed rgba(128, 128, 128, 0.4);
      font-size: 11px;
      color: #bbb;
    }

    .debug-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 4px 8px;
      align-items: center;
    }

    .debug-item {
      display: contents;
    }

    .debug-item.full-width {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: subgrid;
      margin-top: 4px;
      padding-top: 4px;
      border-top: 1px dashed rgba(128, 128, 128, 0.3);
    }

    .label {
      color: #888;
      font-weight: bold;
      font-size: 10px;
    }

    .value {
      color: #aaa;
      font-size: 11px;
    }

    .value.ui {
      color: #d4a574;
    }

    .value.assistant {
      color: #6fa8dc;
    }

    .value.search {
      color: #c27ba0;
    }

    .value.sources {
      color: #777;
      font-size: 9px;
    }
  `]
})
export class LanguageDebugPanelComponent {
  readonly response = input<SearchResponse | null>();
  
  readonly isProd = computed(() => environment.production);
  readonly isExpanded = signal(false);
  
  // Extract language info from response
  readonly uiLanguage = computed(() => {
    const meta = this.response()?.meta;
    return meta?.languageContext?.uiLanguage || 
           this.response()?.query?.language || 
           'unknown';
  });
  
  readonly assistantLanguage = computed(() => {
    const meta = this.response()?.meta;
    return meta?.languageContext?.assistantLanguage || 'unknown';
  });
  
  readonly searchLanguage = computed(() => {
    const meta = this.response()?.meta;
    return meta?.languageContext?.searchLanguage || 'unknown';
  });
  
  readonly languageContext = computed(() => {
    return this.response()?.meta?.languageContext;
  });

  onExpand(): void {
    this.isExpanded.set(true);
  }

  onCollapse(): void {
    this.isExpanded.set(false);
  }
}
