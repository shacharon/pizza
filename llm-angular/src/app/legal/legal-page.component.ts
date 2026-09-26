import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <article class="legal">
      <a class="back" routerLink="/search">Back to search</a>
      <h1>{{ title() }}</h1>
      <ng-content />
    </article>
  `,
  styles: `
    .legal {
      max-width: 40rem;
      margin: 0 auto;
      padding: 1.5rem 0 2rem;
      color: #111827;
    }
    .back {
      display: inline-block;
      margin-bottom: 1rem;
      color: #4b5563;
      text-decoration: none;
    }
    .back:hover { text-decoration: underline; }
    h1 {
      margin: 0 0 1rem;
      font-size: 1.75rem;
      letter-spacing: -0.03em;
    }
    :host ::ng-deep p {
      margin: 0 0 0.85rem;
      line-height: 1.5;
      color: #374151;
    }
  `,
})
export class LegalPageComponent {
  readonly title = input.required<string>();
}
