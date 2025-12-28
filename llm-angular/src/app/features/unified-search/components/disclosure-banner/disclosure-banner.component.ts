import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface OpenNowSummary {
  open: number;
  closed: number;
  unknown: number;
  total: number;
}

/**
 * Disclosure Banner Component
 * Shows transparency message when using derived filters
 * 
 * Purpose: Inform users that "closed now" is a derived filter
 * (not a native Google Places API filter)
 */
@Component({
  selector: 'app-disclosure-banner',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './disclosure-banner.component.html',
  styleUrl: './disclosure-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DisclosureBannerComponent {
  @Input() summary!: OpenNowSummary;
  @Input() filterActive: 'open' | 'closed' | null = null;
  
  /**
   * Get the disclosure message based on the active filter
   */
  get message(): string {
    if (this.filterActive === 'closed') {
      return `מציג רק מקומות סגורים (${this.summary.closed} מתוך ${this.summary.total} תוצאות)`;
    }
    return '';
  }
  
  /**
   * Get the explanation message (optional, for hover/tooltip)
   */
  get explanation(): string {
    if (this.filterActive === 'closed') {
      return 'Google Places לא תומך בסינון סגור - מסננים תוצאות בצד שלנו';
    }
    return '';
  }
  
  /**
   * Should the banner be visible?
   */
  get visible(): boolean {
    return this.filterActive === 'closed' && this.summary && this.summary.closed > 0;
  }
}

