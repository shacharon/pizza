import { Component, ChangeDetectionStrategy, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { ChatService } from '../../../chat.service';
import { signal } from '@angular/core';
import { VendorCardComponent } from '../../../shared/components/vendor-card/vendor-card.component';
import { FilterPanelComponent } from '../../../shared/components/filter-panel/filter-panel.component';
import { Subscription, switchMap } from 'rxjs';
import { MapDisplayComponent } from '../../../shared/components/map-display/map-display.component';

@Component({
  selector: 'app-explore-page',
  standalone: true,
  imports: [CommonModule, VendorCardComponent, FilterPanelComponent, MapDisplayComponent],
  templateUrl: './explore-page.component.html',
  styleUrl: './explore-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorePageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chat = inject(ChatService);
  private querySub?: Subscription;

  vendors = signal<any[]>([]);
  pending = signal(false);

  ngOnInit() {
    this.querySub = this.route.queryParamMap.pipe(
      switchMap(qp => this.fetchData(qp))
    ).subscribe();
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
  }

  private async fetchData(qp: ParamMap) {
    const q = qp.get('q') || undefined;
    const dto: any = {
      city: qp.get('city') || undefined,
      type: qp.get('type') || undefined,
      maxPrice: qp.get('maxPrice') ? Number(qp.get('maxPrice')) : undefined,
      deliveryEtaMinutes: qp.get('eta') ? Number(qp.get('eta')) : undefined
    };
    this.pending.set(true);
    try {
      let action: any = null;
      if (q) {
        const res = await this.chat.ask(q, 'mirror');
        action = res.action;
      } else {
        const res = await this.chat.clarify(dto, 'mirror');
        action = res.action;
      }
      if (action?.action === 'results') {
        this.vendors.set(action.data.vendors || []);
      } else {
        this.vendors.set([]);
      }
    } finally {
      this.pending.set(false);
    }
  }

  getMarker(index: number): string {
    return String.fromCharCode(65 + index);
  }

  onFiltersChange(filters: any) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: filters.query },
      queryParamsHandling: 'merge',
    });
  }
}
