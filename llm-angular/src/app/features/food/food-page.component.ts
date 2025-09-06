import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatLogComponent } from '../../chat-widgets/chat-log/chat-log.component';
import { ChatComposerComponent } from '../../chat-widgets/composer/chat-composer.component';
import { FoodResultsStripComponent } from './food-results-strip.component';
import { FoodFacade } from './food.facade';
import { FoodSmartChipsComponent } from './food-smart-chips.component';

@Component({
    selector: 'app-food-page',
    standalone: true,
    imports: [CommonModule, ChatLogComponent, ChatComposerComponent, FoodResultsStripComponent, FoodSmartChipsComponent],
    providers: [FoodFacade],
    templateUrl: './food-page.component.html',
    styleUrls: ['./food-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FoodPageComponent {
    facade = inject(FoodFacade);
    // expose signals for template
    log = this.facade.log;
    input = this.facade.input;
    pending = this.facade.pending;
    language = this.facade.language;
    chips = this.facade.chips;

    onInput(v: string) { this.facade.input.set(v); }
    onInputChange(v: string) { this.facade.onInputChange(v); }
    onLang(_v: 'mirror' | 'he' | 'en' | 'ar') { /* dropdown hidden; ignore for now */ }
    onSend() { this.facade.send(); }
}


