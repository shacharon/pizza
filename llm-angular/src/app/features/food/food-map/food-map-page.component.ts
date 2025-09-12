import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-food-map-page',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './food-map-page.component.html',
    styleUrls: ['./food-map-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodMapPageComponent { }


