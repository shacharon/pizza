import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';


@Component({
  selector: 'app-food-landing',
  standalone: true,
  imports: [
    CommonModule
  ],
  template: `
    <div class="food-landing">
      <div class="hero-section">
        <h1 class="hero-title">🍕 Find Your Perfect Meal</h1>
        <p class="hero-subtitle">Choose how you want to explore restaurants</p>
      </div>

      <div class="ux-options">
        <div class="option-card grid-option" (click)="navigateTo('/food/grid')">
          <div class="option-header">
            <div class="option-icon">📱</div>
            <h3>Grid View</h3>
          </div>

          <p class="option-description">
            Browse and compare restaurants in a beautiful Pinterest-style grid layout.
            Perfect for exploring options and seeing the big picture.
          </p>

          <div class="preview-section">
            <div class="grid-preview">
              <div class="preview-card featured">
                <div class="preview-image">
                  <div class="image-placeholder">🍕</div>
                  <div class="price-badge">$</div>
                </div>
                <div class="preview-content">
                  <div class="preview-title">Pizza Place</div>
                  <div class="preview-meta">★★★★☆ (4.5)</div>
                </div>
              </div>
              <div class="preview-card">
                <div class="preview-image">
                  <div class="image-placeholder">🍣</div>
                  <div class="price-badge">$$$</div>
                </div>
                <div class="preview-content">
                  <div class="preview-title">Sushi Bar</div>
                  <div class="preview-meta">★★★☆☆ (3.8)</div>
                </div>
              </div>
              <div class="preview-card">
                <div class="preview-image">
                  <div class="image-placeholder">🍔</div>
                  <div class="price-badge">$$</div>
                </div>
                <div class="preview-content">
                  <div class="preview-title">Burger Joint</div>
                  <div class="preview-meta">★★★★☆ (4.2)</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button class="select-btn">▦ Try Grid View</button>
          </div>
        </div>

        <div class="option-card swipe-option" (click)="navigateTo('/food/swipe')">
          <div class="option-header">
            <div class="option-icon">👆</div>
            <h3>Swipe Cards</h3>
          </div>

          <p class="option-description">
            Swipe through restaurants like a dating app. Quick and fun way to find
            your next meal. Right for like, left for pass.
          </p>

          <div class="preview-section">
            <div class="swipe-preview">
              <div class="stack-container">
                <div class="stack-card active">
                  <div class="card-background">
                    <div class="bg-placeholder">🍜</div>
                  </div>
                  <div class="card-content">
                    <h4>Amazing Ramen</h4>
                    <div class="rating">★★★★★ (4.9)</div>
                    <div class="location">📍 <span>Downtown</span></div>
                  </div>
                </div>
                <div class="stack-card">
                  <div class="card-background">
                    <div class="bg-placeholder">🥗</div>
                  </div>
                </div>
                <div class="stack-card">
                  <div class="card-background">
                    <div class="bg-placeholder">🍝</div>
                  </div>
                </div>
              </div>

              <div class="swipe-actions">
                <button class="action-btn dislike" disabled>✖</button>
                <button class="action-btn like" disabled>♥</button>
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button class="select-btn">👆 Try Swipe Cards</button>
          </div>
        </div>

        <div class="option-card map-option" (click)="navigateTo('/food/map')">
          <div class="option-header">
            <div class="option-icon">🗺️</div>
            <h3>Map View</h3>
          </div>

          <p class="option-description">
            Discover restaurants on an interactive map. Perfect for location-based
            exploration and finding places near you.
          </p>

          <div class="preview-section">
            <div class="map-preview">
              <div class="map-placeholder">
                <div class="map-background">
                  <div class="street-lines"></div>
                  <div class="restaurant-marker featured" style="left: 30%; top: 40%;">🍽️ <div class="marker-label">Pizza Palace</div></div>
                  <div class="restaurant-marker" style="left: 60%; top: 35%;">🍽️</div>
                  <div class="restaurant-marker" style="left: 45%; top: 60%;">🍽️</div>
                </div>
              </div>

              <div class="results-panel">
                <div class="result-item">
                  <div class="item-image">
                    <div class="image-placeholder">🍕</div>
                  </div>
                  <div class="item-content">
                    <h4>Pizza Palace</h4>
                    <div class="item-meta">
                      <span>★★★★☆ (4.5)</span>
                      <span>• 2.3km away</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button class="select-btn">🗺️ Try Map View</button>
          </div>
        </div>
      </div>

      <div class="features-section">
        <h2>✨ All Views Include</h2>
        <div class="features-grid">
          <div class="feature-item">🔎 <span>Smart Search</span></div>
          <div class="feature-item">
            📍 <span>Location Aware</span>
          </div>
          <div class="feature-item">♥ <span>Favorites</span></div>
          <div class="feature-item">🧭 <span>Directions</span></div>
          <div class="feature-item">📞 <span>Call Directly</span></div>
          <div class="feature-item">⭐ <span>Real Reviews</span></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .food-landing {
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .hero-section {
      text-align: center;
      margin-bottom: 40px;
      color: white;
    }

    .hero-title {
      font-size: 3rem;
      font-weight: 800;
      margin: 0 0 16px 0;
      text-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    }

    .hero-subtitle {
      font-size: 1.25rem;
      opacity: 0.9;
      margin: 0;
      max-width: 600px;
    }

    .ux-options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 30px;
      max-width: 1200px;
      width: 100%;
      margin-bottom: 60px;
    }

    .option-card {
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 16px;
      overflow: hidden;
      position: relative;

      &:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      }
    }

    .option-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .option-icon {
      font-size: 2rem;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
    }

    .option-header h3 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
      color: #333;
    }

    .option-description {
      color: #666;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .preview-section {
      margin-bottom: 24px;
    }

    /* Grid Preview */
    .grid-preview {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 20px;
    }

    .preview-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s ease;

      &:hover {
        transform: scale(1.05);
      }

      &.featured {
        border: 2px solid #ff6b35;
        position: relative;
      }
    }

    .preview-image {
      height: 80px;
      background: #f8f9fa;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      position: relative;
    }

    .image-placeholder {
      opacity: 0.7;
    }

    .price-badge {
      position: absolute;
      top: 4px;
      left: 4px;
      background: rgba(255, 255, 255, 0.9);
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: 600;
      color: #333;
    }

    .preview-content {
      padding: 8px;
    }

    .preview-title {
      font-size: 12px;
      font-weight: 600;
      color: #333;
      margin-bottom: 4px;
    }

    .preview-meta {
      font-size: 10px;
      color: #666;
    }

    /* Swipe Preview */
    .swipe-preview {
      position: relative;
      height: 200px;
      margin-top: 20px;
    }

    .stack-container {
      position: relative;
      height: 150px;
    }

    .stack-card {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 120px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);

      &:nth-child(1) {
        z-index: 3;
        transform: translateY(0) scale(1);
      }

      &:nth-child(2) {
        z-index: 2;
        transform: translateY(8px) scale(0.95);
        opacity: 0.8;
      }

      &:nth-child(3) {
        z-index: 1;
        transform: translateY(16px) scale(0.9);
        opacity: 0.6;
      }
    }

    .card-background {
      height: 80px;
      background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bg-placeholder {
      font-size: 2rem;
      opacity: 0.8;
    }

    .card-content {
      padding: 8px;
      background: white;
    }

    .card-content h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .rating {
      font-size: 12px;
      color: #ffb400;
      margin-bottom: 4px;
    }

    .location {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: #666;
    }

    .swipe-actions {
      display: flex;
      justify-content: space-around;
      margin-top: 16px;
    }

    .action-btn {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

      &.dislike {
        background: linear-gradient(135deg, #ea4335, #ff6b6b);
        color: white;
      }

      &.like {
        background: linear-gradient(135deg, #34a853, #4ade80);
        color: white;
      }
    }

    /* Map Preview */
    .map-preview {
      display: flex;
      gap: 16px;
      margin-top: 20px;
    }

    .map-placeholder {
      flex: 1;
      height: 150px;
      background: #e3f2fd;
      border-radius: 8px;
      position: relative;
      overflow: hidden;
    }

    .map-background {
      position: relative;
      width: 100%;
      height: 100%;
      background: linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
                  linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
                  linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
    }

    .street-lines::before {
      content: '';
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 2px;
      background: #4285f4;
      opacity: 0.3;
    }

    .restaurant-marker {
      position: absolute;
      transform: translate(-50%, -100%);
      display: flex;
      flex-direction: column;
      align-items: center;

      mat-icon {
        color: #ff6b35;
        font-size: 24px;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
      }

      &.featured mat-icon {
        color: #34a853;
        transform: scale(1.2);
      }

      .marker-label {
        background: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 600;
        color: #333;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        white-space: nowrap;
        margin-top: 2px;
      }
    }

    .results-panel {
      width: 200px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .result-item {
      padding: 12px;
      display: flex;
      gap: 8px;
      border-bottom: 1px solid #f0f0f0;

      &:last-child {
        border-bottom: none;
      }
    }

    .item-image {
      width: 40px;
      height: 40px;
      border-radius: 6px;
      background: #f8f9fa;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .item-content h4 {
      margin: 0 0 4px 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .item-meta {
      font-size: 12px;
      color: #666;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-actions {
      padding: 16px;
      display: flex;
      justify-content: center;
    }

    .select-btn {
      width: 100%;
      font-weight: 600;
      text-transform: none;
    }

    .features-section {
      text-align: center;
      color: white;
      max-width: 800px;
    }

    .features-section h2 {
      font-size: 2rem;
      font-weight: 700;
      margin-bottom: 32px;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      backdrop-filter: blur(10px);

      mat-icon {
        color: #4ade80;
        font-size: 24px;
      }

      span {
        font-weight: 600;
        font-size: 1rem;
      }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-title {
        font-size: 2rem;
      }

      .ux-options {
        grid-template-columns: 1fr;
        gap: 20px;
      }

      .map-preview {
        flex-direction: column;
      }

      .results-panel {
        width: 100%;
        height: 100px;
      }

      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class FoodLandingComponent {
  constructor(private router: Router) { }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}
