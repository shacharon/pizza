import { Routes } from '@angular/router';
import { ChatPageComponent } from './features/basic-chat/chat-page.component';
import { ExplorePageComponent } from './features/explore/explore-page/explore-page.component';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'chat' },
    { path: 'chat', component: ChatPageComponent },
    { path: 'explore', component: ExplorePageComponent },
    { path: 'guardrails', loadComponent: () => import('./guardrails/guardrails.component').then(m => m.GuardrailsComponent) },
    { path: '**', redirectTo: 'chat' }
];


