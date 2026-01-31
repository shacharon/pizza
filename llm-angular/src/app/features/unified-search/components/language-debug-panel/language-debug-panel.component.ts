/**
 * Language Debug Panel Component
 * DEV-ONLY: Shows language separation (uiLanguage / assistantLanguage / searchLanguage)
 */

import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
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
      <div class="debug-panel">
        <div class="debug-title">🔍 Language Debug (DEV)</div>
        <div class="debug-grid">
          <div class="debug-item">
            <span class="label">UI Language:</span>
            <span class="value ui">{{ uiLanguage() }}</span>
          </div>
          <div class="debug-item">
            <span class="label">Assistant Language:</span>
            <span class="value assistant">{{ assistantLanguage() }}</span>
          </div>
          <div class="debug-item">
            <span class="label">Search Language:</span>
            <span class="value search">{{ searchLanguage() }}</span>
          </div>
          @if (languageContext()) {
            <div class="debug-item full-width">
              <span class="label">Context Sources:</span>
              <span class="value sources">
                assistant: {{ languageContext()?.sources?.assistantLanguage || 'n/a' }},
                search: {{ languageContext()?.sources?.searchLanguage || 'n/a' }}
              </span>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .debug-panel {
      position: fixed;
      bottom: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #00ff00;
      border-radius: 8px;
      padding: 12px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #00ff00;
      z-index: 9999;
      min-width: 320px;
      box-shadow: 0 4px 12px rgba(0, 255, 0, 0.3);
    }

    .debug-title {
      font-weight: bold;
      margin-bottom: 8px;
      border-bottom: 1px solid #00ff00;
      padding-bottom: 4px;
    }

    .debug-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
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
      padding-top: 8px;
      border-top: 1px dashed #00ff00;
    }

    .label {
      color: #00ffff;
      font-weight: bold;
    }

    .value {
      color: #00ff00;
    }

    .value.ui {
      color: #ffaa00;
    }

    .value.assistant {
      color: #00aaff;
    }

    .value.search {
      color: #ff00ff;
    }

    .value.sources {
      color: #888;
      font-size: 10px;
    }
  `]
})
export class LanguageDebugPanelComponent {
  readonly response = input<SearchResponse | null>();
  
  readonly isProd = computed(() => environment.production);
  
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
}
