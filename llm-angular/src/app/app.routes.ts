import { Routes } from '@angular/router';
import { ChatPageComponent } from './features/basic-chat/chat-page.component';
import { ExplorePageComponent } from './features/explore/explore-page/explore-page.component';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'chat' },
    { path: 'chat', component: ChatPageComponent },
    // New Food UX routes
    { path: 'food', loadComponent: () => import('./features/food/food-landing.component').then(m => m.FoodLandingComponent) },
    { path: 'food/grid', loadComponent: () => import('./features/food/food-grid-page.component').then(m => m.FoodGridPageComponent) },
    { path: 'food/swipe', loadComponent: () => import('./features/food/food-swipe-page.component').then(m => m.FoodSwipePageComponent) },
    { path: 'food/map', loadComponent: () => import('./features/food/food-map-page.component').then(m => m.FoodMapPageComponent) },
    { path: 'food/original', loadComponent: () => import('./features/food/food-page.component').then(m => m.FoodPageComponent) },
    { path: 'explore', component: ExplorePageComponent },
    { path: 'guardrails', loadComponent: () => import('./guardrails/guardrails.component').then(m => m.GuardrailsComponent) },
    { path: '**', redirectTo: 'chat' }
];


