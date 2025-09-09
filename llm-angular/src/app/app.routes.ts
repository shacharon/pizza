import { Routes } from '@angular/router';
import { ChatPageComponent } from './features/basic-chat/chat-page.component';
import { ExplorePageComponent } from './features/explore/explore-page/explore-page.component';


export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'chat' },
    { path: 'chat', component: ChatPageComponent },

    // Food routes with multiple UX approaches

    { path: 'food', loadComponent: () => import('./features/food/food-landing.component').then(m => m.FoodLandingComponent) },
    { path: 'food1', loadComponent: () => import('./features/food/food-page.component').then(m => m.FoodPageComponent) },
    { path: 'food/grid', loadComponent: () => import('./features/food/food-grid-page.component').then(m => m.FoodGridPageComponent) },
    { path: 'food/swipe', loadComponent: () => import('./features/food/food-landing.component').then(m => m.FoodLandingComponent) },
    { path: 'food/map', loadComponent: () => import('./features/food/food-landing.component').then(m => m.FoodLandingComponent) },

    { path: 'explore', component: ExplorePageComponent },
    { path: 'guardrails', loadComponent: () => import('./guardrails/guardrails.component').then(m => m.GuardrailsComponent) },
    { path: '**', redirectTo: 'chat' }
];


