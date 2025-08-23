import { Routes } from '@angular/router';

export const BASIC_CHAT_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () => import('../../chat-page/chat-page.component').then(m => m.ChatPageComponent)
    }
];


