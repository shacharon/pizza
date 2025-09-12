import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FoodGridResultsComponent } from '../food-grid-results/food-grid-results.component';

@Component({
    selector: 'app-food-grid-page',
    standalone: true,
    imports: [CommonModule, FoodGridResultsComponent],
    templateUrl: './food-grid-page.component.html',
    styleUrls: ['./food-grid-page.component.scss'],
})
export class FoodGridPageComponent { }
