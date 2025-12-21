import { Routes } from '@angular/router';
import { ChatPageComponent } from './features/basic-chat/chat-page.component';
import { ExplorePageComponent } from './features/explore/explore-page/explore-page.component';
import { unifiedSearchGuard } from './core/guards/feature-flag.guard';


export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'search' },
    { path: 'chat', component: ChatPageComponent },
    
    // Unified Search (Phase 3 - New Architecture)
    {
        path: 'search',
        canActivate: [unifiedSearchGuard],
        loadComponent: () => import('./features/unified-search/search-page/search-page.component')
            .then(m => m.SearchPageComponent)
    },
    // Preview route without feature flag guard (for testing)
    {
        path: 'search-preview',
        loadComponent: () => import('./features/unified-search/search-page/search-page.component')
            .then(m => m.SearchPageComponent)
    },
    
    // Legacy Food UX routes (maintained for gradual migration)
    { path: 'food', loadComponent: () => import('./features/food/food-landing/food-landing.component').then(m => m.FoodLandingComponent) },
    { path: 'food/grid', loadComponent: () => import('./features/food/food-grid/food-grid-page.component').then(m => m.FoodGridPageComponent) },
    { path: 'food/swipe', loadComponent: () => import('./features/food/food-swipe/food-swipe-page.component').then(m => m.FoodSwipePageComponent) },
    { path: 'food/map', loadComponent: () => import('./features/food/food-map/food-map-page.component').then(m => m.FoodMapPageComponent) },
    { path: 'food/original', loadComponent: () => import('./features/food/food-page.component').then(m => m.FoodPageComponent) },
    { path: 'dialogue', loadComponent: () => import('./features/food/food-dialogue/dialogue-page.component').then(m => m.DialoguePageComponent) },
    
    // Other routes
    { path: 'explore', component: ExplorePageComponent },
    { path: 'guardrails', loadComponent: () => import('./guardrails/guardrails.component').then(m => m.GuardrailsComponent) },
    { path: 'places', loadComponent: () => import('./features/places/places-page/places-page.component').then(m => m.PlacesPageComponent) },
    
    { path: '**', redirectTo: 'search' }
];


