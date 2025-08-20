import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="wrap">
<h1>LLM Chat (Angular)</h1>
<div class="box">
<div *ngFor="let m of log()">
<b>{{ m.role === 'user' ? 'You' : 'AI' }}:</b> {{ m.text }}
</div>
</div>
<div class="row">
<input [(ngModel)]="input" placeholder="שאל משהו…" />
<button (click)="send()">Send</button>
</div>
</div>
`,
  styles: [`
.wrap { max-width: 700px; margin: 40px auto; font-family: system-ui, sans-serif; }
.box { border: 1px solid #ddd; padding: 16px; border-radius: 8px; min-height: 220px; }
.row { display: flex; gap: 8px; margin-top: 12px; }
input { flex: 1; padding: 8px; }
`]
})
export class AppComponent {
  input = '';
  log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
  constructor(private chat: ChatService) { }


  async send() {
    const msg = this.input.trim();
    if (!msg) return;
    this.log.update((l) => [...l, { role: 'user', text: msg }]);
    this.input = '';
    const reply = await this.chat.ask(msg);
    this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
  }
}