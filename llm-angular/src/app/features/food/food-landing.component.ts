import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-food-landing',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div style="padding: 2rem; text-align: center; font-family: sans-serif;">
      <h1 style="font-size: 2.5rem; margin-bottom: 2rem; color: #333;">Choose Your Food Discovery Experience</h1>
      <div style="display: flex; justify-content: center; gap: 2rem; flex-wrap: wrap;">
        
        <a routerLink="/food/grid" style="border: 1px solid #ddd; border-radius: 12px; padding: 2rem; width: 280px; text-decoration: none; color: inherit; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🖼️</div>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: #111;">Enhanced Grid</h2>
          <p style="color: #666;">Browse restaurants in a rich, Pinterest-style grid.</p>
        </a>

        <a routerLink="/food/swipe" style="border: 1px solid #ddd; border-radius: 12px; padding: 2rem; width: 280px; text-decoration: none; color: inherit; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">👉</div>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: #111;">Swipe & Decide</h2>
          <p style="color: #666;">A fun, Tinder-like experience for quick choices.</p>
        </a>

        <a routerLink="/food/map" style="border: 1px solid #ddd; border-radius: 12px; padding: 2rem; width: 280px; text-decoration: none; color: inherit; transition: all 0.3s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🗺️</div>
          <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem; color: #111;">Map Explorer</h2>
          <p style="color: #666;">Discover places visually on an interactive map.</p>
        </a>

      </div>
    </div>
  `,
  styles: [
    `
      a:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 16px rgba(0,0,0,0.1);
      }
    `,
  ],
})
export class FoodLandingComponent {}
