import { Component } from '@angular/core';
import { LegalPageComponent } from './legal-page.component';

@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [LegalPageComponent],
  template: `
    <app-legal-page title="Privacy">
      <p>We use the words you type, and your location if you allow it, to find food nearby.</p>
      <p>An AI reads those words and turns them into a place search. Maps then return the restaurants. We do not sell your searches.</p>
      <p>Location is for the search. You can turn it off in the browser.</p>
    </app-legal-page>
  `,
})
export class PrivacyPageComponent {}
