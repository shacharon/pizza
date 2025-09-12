import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-food-landing',
    standalone: true,
    imports: [RouterModule],
    templateUrl: './food-landing.component.html',
    styleUrls: ['./food-landing.component.scss'],
})
export class FoodLandingComponent { }

