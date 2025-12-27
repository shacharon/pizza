import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LanguageService } from './core/services/language.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private languageService = inject(LanguageService);
  
  ngOnInit(): void {
    // Language service initializes automatically via constructor
    // HTML dir attribute is set based on browser language
    console.log('[App] Initialized with language:', this.languageService.currentLang());
  }
}