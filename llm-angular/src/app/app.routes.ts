import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'search' },
    {
        path: 'search',
        loadComponent: () => import('./features/unified-search/search-page/search-page.component')
            .then(m => m.SearchPageComponent)
    },
    {
        path: 'q',
        loadComponent: () => import('./features/unified-search/search-page/search-page.component')
            .then(m => m.SearchPageComponent)
    },
    {
        path: 'search-preview',
        loadComponent: () => import('./features/unified-search/search-page/search-page.component')
            .then(m => m.SearchPageComponent)
    },
    {
        path: 'r/:placeId',
        loadComponent: () => import('./features/restaurant-details/restaurant-details.component')
            .then(m => m.RestaurantDetailsComponent)
    },
    {
        path: 'privacy',
        loadComponent: () => import('./legal/privacy-page.component')
            .then(m => m.PrivacyPageComponent)
    },
    {
        path: 'terms',
        loadComponent: () => import('./legal/terms-page.component')
            .then(m => m.TermsPageComponent)
    },
    { path: '**', redirectTo: 'search' }
];


