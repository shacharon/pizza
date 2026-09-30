import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-daily-limit-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-limit-card.component.html',
  styleUrl: './daily-limit-card.component.scss'
})
export class DailyLimitCardComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly dir = input<'rtl' | 'ltr'>('ltr');
  readonly lang = input<string>('en');
}
