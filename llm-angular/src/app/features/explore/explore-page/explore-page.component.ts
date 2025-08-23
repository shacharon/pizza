import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultsTableComponent } from '../../../shared/components/results-table/results-table.component';
import { ChatService } from '../../../chat.service';
import { signal } from '@angular/core';

@Component({
  selector: 'app-explore-page',
  standalone: true,
  imports: [CommonModule, ResultsTableComponent],
  templateUrl: './explore-page.component.html',
  styleUrl: './explore-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExplorePageComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chat = inject(ChatService);

  vendors = signal<any[]>([]);
  pending = signal(false);

  async ngOnInit() {
    const qp = this.route.snapshot.queryParamMap;
    const dto: any = {
      city: qp.get('city') || undefined,
      type: qp.get('type') || undefined,
      maxPrice: qp.get('maxPrice') ? Number(qp.get('maxPrice')) : undefined,
      deliveryEtaMinutes: qp.get('eta') ? Number(qp.get('eta')) : undefined
    };
    this.pending.set(true);
    try {
      const { action } = await this.chat.clarify(dto, 'mirror');
      if (action?.action === 'results') {
        this.vendors.set(action.data.vendors || []);
      } else {
        this.vendors.set([]);
      }
    } finally {
      this.pending.set(false);
    }
  }
}
