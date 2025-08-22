import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'chat' },
    { path: 'chat', loadChildren: () => import('./chat-page/chat.routes').then(m => m.CHAT_ROUTES) },
    { path: '**', redirectTo: 'chat' }
];


