/**
 * Restaurant Details Page
 * Deep-link: /r/:placeId (human-friendly). Invalid/missing placeId redirects to search.
 */

import { Component, inject, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

const SAFE_PLACE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

@Component({
  selector: 'app-restaurant-details',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="restaurant-details-page">
      <a class="back-link" routerLink="/search">Back to search</a>
      <h1 class="details-title">Restaurant details</h1>
      <p class="details-place-id" dir="ltr">Place ID: {{ placeId }}</p>
    </div>
  `,
  styles: [`
    .restaurant-details-page {
      padding: 1.5rem;
      max-width: 640px;
      margin: 0 auto;
    }
    .back-link {
      display: inline-block;
      margin-bottom: 1rem;
      color: #3b82f6;
      text-decoration: none;
    }
    .back-link:hover { text-decoration: underline; }
    .details-title { margin: 0 0 0.5rem; font-size: 1.5rem; }
    .details-place-id { margin: 0; font-family: monospace; color: #6b7280; }
  `]
})
export class RestaurantDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly placeId: string = this.route.snapshot.paramMap.get('placeId') ?? '';

  ngOnInit(): void {
    const id = this.placeId.trim();
    if (!id || !SAFE_PLACE_ID_REGEX.test(id)) {
      this.router.navigate(['/search'], { replaceUrl: true });
    }
  }
}
