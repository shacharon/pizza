import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

type Lang = 'mirror' | 'he' | 'en' | 'ar';

export interface FoodSearchBody {
    city?: string;
    type?: 'pizza' | 'sushi' | 'burger' | 'other';
    constraints?: { maxPrice?: number };
    language?: Lang;
}

@Injectable({ providedIn: 'root' })
export class FoodService {
    private http = inject(HttpClient);

    search(body: FoodSearchBody) {
        return this.http.post<any>('/api/restaurants/search', body);
    }
}


