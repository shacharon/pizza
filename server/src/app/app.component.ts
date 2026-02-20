import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { LanguageService } from './core/services/language.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private languageService = inject(LanguageService);

  ngOnInit(): void {
    console.log('[BUILD]', '2026-01-25 ws-ticket-fix v4'); // <— marker חד פעמי
    console.log('[App] Initialized with language:', this.languageService.currentLang());
  }
}
