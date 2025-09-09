import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';


@Component({
  selector: 'app-food-landing',
  standalone: true,
  imports: [
    CommonModule
  ],
  templateUrl: './food-landing.component.html',
  styleUrls: ['./food-landing.component.scss']
})
export class FoodLandingComponent {
  constructor(private router: Router) { }

  navigateTo(route: string): void {
    this.router.navigate([route]);
  }
}
