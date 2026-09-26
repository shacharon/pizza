import { Component } from '@angular/core';
import { LegalPageComponent } from './legal-page.component';

@Component({
  selector: 'app-terms-page',
  standalone: true,
  imports: [LegalPageComponent],
  template: `
    <app-legal-page title="Terms">
      <p>going2eat is a search tool. An AI reads your sentence, and it can misunderstand you. The list is a suggestion, not a promise that a place is open, kosher, or a good match.</p>
      <p>Check the place yourself before you go. Hours, prices, and menus can be wrong.</p>
    </app-legal-page>
  `,
})
export class TermsPageComponent {}
