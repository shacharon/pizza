import { Routes } from '@angular/router';
import { unifiedSearchGuard } from './core/guards/feature-flag.guard';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'search' },
    
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
    
    { path: '**', redirectTo: 'search' }
];


